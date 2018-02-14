const _ = require('lodash');
const perfy = require('perfy');
const inflection = require('inflection');
const utils = require('../utils');

function setScopeKey(options, key) {
  utils.setTriggerParams(options, 'tracking-scope', { key });
}

function getScopeKey(options) {
  const { key } = utils.getTriggerParams(options, 'tracking-scope');
  return `tracking-${key !== undefined ? key : 1}`;
}

function getTrackingKey(model, options) {
  return `${utils.getName(model)}-${getScopeKey(options)}-${Math.random()}-${Date.now()}`;
}

function getVisibleAttributes(model) {
  return ['id'].concat(_.without(
    _.keys(utils.getRawAttributes(model)),
    'updatedAt', 'updatedBy', 'createdAt',
    'createdBy', 'deletedBy',
  ));
}

const SETTER = /^(add|set|remove)/;
function isSetter(options) {
  const trigger = utils.getTriggerType(options);
  return SETTER.test(trigger);
}

const REMOVE_SETTER = /^remove/;
function isRemoveSetter(options) {
  const trigger = utils.getTriggerType(options);
  return REMOVE_SETTER.test(trigger);
}

const ADD_SETTER = /^add/;
function isAddSetter(options) {
  const trigger = utils.getTriggerType(options);
  return ADD_SETTER.test(trigger);
}

function safe(value, model) {
  const hiddenAttributes = model ? utils.getHiddenAttributes(model) : {};
  if (value === null) {
    return value;
  }
  if (_.isArray(value)) {
    const result = [];
    _.each(value, (_instance) => {
      const instance = {};
      _.each(_instance, (v, k) => {
        if (v !== undefined && v !== null && v !== '') {
          instance[k] = hiddenAttributes[k] ? '[redacted]' : v;
        }
      });
      result.push(instance);
    });
    return result;
  }
  const instance = {};
  _.each(value, (v, k) => {
    if (v !== undefined && v !== null && v !== '') {
      instance[k] = hiddenAttributes[k] ? '[redacted]' : v;
    }
  });
  return instance;
}

function getScope(model, association) {
  const sequelize = utils.getSequelize(model);
  const name = utils.getName(model);
  const target = utils.getAssociationTarget(association);
  const list = utils.isListAssociation(association);
  const as = utils.getAssociationAs(association);
  const attributes = getVisibleAttributes(target);
  const foreignKey = utils.getAssociationForeignKey(association);
  const get = async (id, transaction, original) => {
    const params = {
      attributes: ['id'],
      where: { id },
      include: [],
      transaction,
    };
    params.include.push({
      model: target,
      as,
      attributes,
    });
    const instance = await model.find(params);
    if (!instance) {
      throw new Error(`Associated object not found: ${utils.getName(target)} -> ${name}-${id}`);
    }
    if (original) {
      return instance[as];
    }
    if (list) {
      return _.map(instance[as], v => safe(_.pick(v, attributes), target));
    }
    return instance[as] ? safe(_.pick(instance[as], attributes), target) : '';
  };
  return {
    name,
    target,
    list,
    as,
    get,
    attributes,
    foreignKey,
    sequelize,
  };
}

async function _wrappedBeforeUpdate(self, options, model) {
  const created = !self.id;
  const changes = self.changed();
  const trigger = utils.getTriggerType(options);
  const destroyed = trigger === 'DESTROY' || trigger === 'BULKDESTROY';
  if (changes.length || created || destroyed) {
    const trackingKey = getTrackingKey(model, options);
    perfy.start(trackingKey);
    const after = {};
    const before = {};
    _.each(changes, (key) => {
      after[key] = self[key];
      before[key] = self.previous(key);
    });
    utils.setTriggerParams(options, getScopeKey(options), {
      before, after, trackingKey,
    });
  } else {
    utils.setTriggerParams(options, getScopeKey(options), {});
  }
}

function beforeUpdate(model) {
  return async function wrappedBeforeUpdate(self, options) {
    if (isSetter(options)) {
      return;
    }
    return _wrappedBeforeUpdate(self, options, model);
  };
}

async function _wrappedAfterUpdate(self, options, model, name, attributes, log) {
  const { before, after, trackingKey } = utils.getTriggerParams(options, getScopeKey(options));
  if (trackingKey) {
    const trigger = utils.getTriggerType(options);
    const destroyed = trigger === 'DESTROY' || trigger === 'BULKDESTROY';
    await log([{
      type: destroyed ? 'DELETE' : 'UPDATE',
      reference: `${name}-${self.id}`,
      data: {
        type: name,
        id: self.id,
        before: safe(_.pick(before, attributes), model),
        after: safe(_.pick(after, attributes), model),
      },
      executionTime: perfy.end(trackingKey).nanoseconds,
      userId: options.user.id,
    }]);
  }
}

function afterUpdate(model, log) {
  const name = utils.getName(model);
  const attributes = getVisibleAttributes(model);
  return async function wrappedAfterUpdate(self, options) {
    if (isSetter(options)) {
      return;
    }
    return _wrappedAfterUpdate(self, options, model, name, attributes, log);
  };
}

function beforeBulkCreate(model) {
  return async function wrappedBeforeBulkCreate(instances, options) {
    if (isSetter(options)) {
      return;
    }
    for (let i = 0; i < instances.length; i += 1) {
      setScopeKey(options, i);
      await _wrappedBeforeUpdate(instances[i], options, model);
    }
  };
}

function afterBulkCreate(model, log) {
  const name = utils.getName(model);
  const attributes = getVisibleAttributes(model);
  return async function wrappedAfterBulkCreate(instances, options) {
    if (isSetter(options)) {
      return;
    }
    const logs = [];
    const _log = m => Array.prototype.push.apply(logs, m);
    for (let i = 0; i < instances.length; i += 1) {
      setScopeKey(options, i);
      await _wrappedAfterUpdate(instances[i], options, model, name, attributes, _log);
    }
    if (logs.length) {
      await log(logs);
    }
  };
}

function beforeBulkUpdate(model) {
  const sequelize = utils.getSequelize(model);
  return async function wrappedBeforeBulkUpdate(options) {
    if (isSetter(options)) {
      return;
    }
    if (!options.transaction) {
      const transaction = await sequelize.transaction();
      options.transaction = transaction;
      utils.setTriggerParams(options, 'tracking', { transaction });
    }
    const instances = await utils.getBulkedInstances(model, options);
    for (let i = 0; i < instances.length; i += 1) {
      setScopeKey(options, i);
      _.each(options.attributes, (value, key) => {
        instances[i].setDataValue(key, value);
      });
      await _wrappedBeforeUpdate(instances[i], options, model);
    }
  };
}

function afterBulkUpdate(model, log) {
  const name = utils.getName(model);
  const attributes = getVisibleAttributes(model);
  return async function wrappedAfterBulkUpdate(options) {
    if (isSetter(options)) {
      return;
    }
    const instances = await utils.getBulkedInstances(model, options);
    const { transaction } = utils.getTriggerParams(options, 'tracking');
    if (transaction) {
      try {
        await transaction.commit();
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    }
    const logs = [];
    const _log = m => Array.prototype.push.apply(logs, m);
    for (let i = 0; i < instances.length; i += 1) {
      setScopeKey(options, i);
      await _wrappedAfterUpdate(instances[i], options, model, name, attributes, _log);
    }
    if (logs.length) {
      await log(logs);
    }
  };
}

async function track(id, _instance, changes, state, scope, cache, transaction) {
  const instance = _instance.toJSON();
  if (!instance.id) {
    instance.id = _instance.tempId;
  }
  const cached = !!cache.id;
  if (!cached) {
    cache.id = id;
    cache.type = scope.name;
    cache.before = {};
    cache.after = {};
    cache.list = scope.list;
  }
  const { as, target, attributes } = scope;
  const { before, after } = cache;
  if (!cached) {
    before[as] = await scope.get(id, transaction);
    if (scope.list) {
      after[as] = {};
      after[as].length = 0;
      _.each(before[as], (v, i) => {
        after[as][v.id] = _.clone(v);
        after[as][v.id].__position = i;
        after[as].length += 1;
      });
    } else {
      after[as] = _.clone(before[as]);
    }
  }
  if (scope.list) {
    if (state === 'removed') {
      delete after[as][instance.id];
    } else if (state === 'added') {
      after[as][instance.id] = safe(_.pick(instance, attributes), target);
      after[as][instance.id].__position = after[as].length;
      after[as].length += 1;
    } else {
      _.extend(after[as][instance.id], safe(_.pick(instance, changes), target));
    }
  } else if (state === 'removed') {
    after[as] = '';
  } else if (state === 'added') {
    after[as] = safe(_.pick(instance, attributes), target);
  } else {
    _.extend(after[as], safe(_.pick(instance, changes), target));
  }
  return cache;
}

async function _wrappedBeforeUpdateAssociation(self, options, model, key, scope, cache) {
  const created = !self.id;
  const changes = self.changed();
  const trigger = utils.getTriggerType(options);
  const destroyed = trigger === 'DESTROY' || trigger === 'BULKDESTROY';

  if (!changes.length && !created && !destroyed) {
    return;
  }
  const scopeKey = getScopeKey(options);
  if (created) {
    self.tempId = scopeKey;
  }

  const trackingKey = getTrackingKey(model, options);
  let cacheId;
  let updates = [];
  const t = options.transaction;
  if (destroyed) {
    if (self[key]) {
      cacheId = self[key];
      cache[cacheId] = cache[cacheId] || {};
      updates.push(track(self[key], self, changes, 'removed', scope, cache[cacheId], t));
    }
  } else if (self[key] !== self.previous(key)) {
    if (self.previous(key)) {
      cacheId = self.previous(key);
      cache[cacheId] = cache[cacheId] || {};
      updates.push(track(self.previous(key), self, changes, 'removed', scope, cache[cacheId], t));
    }
    if (self[key]) {
      cacheId = self[key];
      cache[cacheId] = cache[cacheId] || {};
      updates.push(track(self[key], self, changes, 'added', scope, cache[cacheId], t));
    }
  } else if (self[key]) {
    cacheId = self[key];
    cache[cacheId] = cache[cacheId] || {};
    updates.push(track(self[key], self, changes, 'updated', scope, cache[cacheId], t));
  }
  if (updates.length) {
    perfy.start(trackingKey);
    updates = await Promise.all(updates);
  }
  utils.setTriggerParams(options, scopeKey, { updates, trackingKey, created });
}

function beforeUpdateAssociation(model, association, key) {
  const scope = getScope(model, association);
  return async function wrappedBeforeUpdateAssociation(self, options) {
    if (isSetter(options)) {
      return;
    }
    return _wrappedBeforeUpdateAssociation(self, options, model, key, scope, {});
  };
}

async function _wrappedAfterUpdateAssociation(self, options, as, log) {
  const scopeKey = getScopeKey(options);
  const { updates, trackingKey, created } = utils.getTriggerParams(options, scopeKey);
  if (updates && updates.length) {
    const logs = [];
    const executionTime = perfy.end(trackingKey).nanoseconds;
    _.each(updates, (update) => {
      if (created) {
        if (!update.list && update.after[as]) {
          update.after[as].id = self.id;
        } else if (update.list && update.after[as][scopeKey]) {
          update.after[as][scopeKey].id = self.id;
        }
      }
      update.executionTime = executionTime;
      if (log) {
        if (update.list) {
          update.after[as] = _.sortBy(_.omit(update.after[as], 'length'), v => v.__position);
          update.after[as] = _.map(update.after[as], v => _.omit(v, '__position'));
        } else {
          update.before = safe(update.before);
          update.after = safe(update.after);
        }
        logs.push({
          type: 'UPDATE',
          reference: `${update.type}-${update.id}`,
          data: {
            type: update.type,
            id: update.id,
            before: update.before,
            after: update.after,
          },
          executionTime: update.executionTime,
          userId: options.user.id,
        });
      }
    });
    if (logs.length) {
      await log(logs);
    }
  }
}

function afterUpdateAssociation(as, log) {
  return async function wrappedAfterUpdateAssociation(self, options) {
    if (isSetter(options)) {
      return;
    }
    return _wrappedAfterUpdateAssociation(self, options, as, log);
  };
}

function beforeBulkUpdateAssociation(target, model, association, key) {
  const scope = getScope(model, association);
  return async function wrappedBeforeBulkUpdateAssociation(instances, options) {
    if (!options) {
      options = instances;
      instances = null;
    }
    if (isSetter(options)) {
      return;
    }
    let transaction;
    if (instances === null) {
      if (!options.transaction) {
        transaction = await scope.sequelize.transaction();
        options.transaction = transaction;
        utils.setTriggerParams(options, 'tracking', { transaction });
      }
      instances = await utils.getBulkedInstances(target, options);
      _.each(instances, (instance) => {
        _.each(options.attributes, (value, key) => {
          instance.setDataValue(key, value);
        });
      });
    }
    const cache = {};
    for (let i = 0; i < instances.length; i += 1) {
      setScopeKey(options, i);
      await _wrappedBeforeUpdateAssociation(instances[i], options, model, key, scope, cache);
    }
    utils.setTriggerParams(options, getScopeKey(options), { cache });
  };
}

function afterBulkUpdateAssociation(target, as, log) {
  return async function wrappedAfterBulkUpdateAssociation(instances, options) {
    if (!options) {
      options = instances;
      instances = null;
    }
    if (isSetter(options)) {
      return;
    }
    if (instances === null) {
      instances = await utils.getBulkedInstances(target, options);
    }
    const { transaction } = utils.getTriggerParams(options, 'tracking');
    if (transaction) {
      try {
        await transaction.commit();
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    }
    const { cache } = utils.getTriggerParams(options, getScopeKey(options));
    const logs = [];
    for (let i = 0; i < instances.length; i += 1) {
      setScopeKey(options, i);
      await _wrappedAfterUpdateAssociation(instances[i], options, as);
    }
    _.each(cache, (update) => {
      if (update.list) {
        update.after[as] = _.sortBy(_.omit(update.after[as], 'length'), v => v.__position);
        update.after[as] = _.map(update.after[as], v => _.omit(v, '__position'));
      } else {
        update.before = safe(update.before);
        update.after = safe(update.after);
      }
      logs.push({
        type: 'UPDATE',
        reference: `${update.type}-${update.id}`,
        data: {
          type: update.type,
          id: update.id,
          before: update.before,
          after: update.after,
        },
        executionTime: update.executionTime,
        userId: options.user.id,
      });
    });
    if (logs.length) {
      await log(logs);
    }
  };
}

function beforeNonThroughSetter(model, association) {
  const scope = getScope(model, association);
  return async function wrappedBeforeNonThroughSetter(self, values, options) {
    const isRemove = isRemoveSetter(options);
    const isAdd = isAddSetter(options);
    if (!options.transaction) {
      const transaction = await scope.sequelize.transaction();
      options.transaction = transaction;
      utils.setTriggerParams(options, 'tracking', { transaction });
    }
    const { target, foreignKey } = scope;
    let before = await scope.get(self.id, options.transaction, true);
    if (!_.isArray(before)) {
      before = before === null ? [] : [before];
    }
    let after = [];
    if (values !== null) {
      if (!_.isArray(values)) {
        values = [values];
      }
      if (values.length) {
        if (utils.isInstance(values[0])) {
          values = _.map(values, v => v.id);
        }
        after = await target.findAll({
          where: { id: values },
          hooks: false,
          transaction: options.transaction,
        });
      }
    }
    const instances = [];
    _.each(before, (b) => {
      let found = false;
      _.each(after, (a) => {
        if (b.id === a.id) {
          if (isRemove) {
            b.setDataValue(foreignKey, null);
          } else {
            found = true;
          }
          a.found = true;
        }
      });
      if (!found) {
        if (!isRemove && !isAdd) {
          b.setDataValue(foreignKey, null);
        }
        instances.push(b);
      }
    });
    _.each(after, (a) => {
      if (!a.found) {
        a.setDataValue(foreignKey, self.id);
        instances.push(a);
      }
    });
    const cache = {};
    for (let i = 0; i < instances.length; i += 1) {
      setScopeKey(options, i);
      await _wrappedBeforeUpdateAssociation(instances[i], options, model, foreignKey, scope, cache);
    }
    utils.setTriggerParams(options, getScopeKey(options), { cache, instances });
  };
}

function afterNonThroughSetter(as, log) {
  return async function wrappedAfterBulkUpdateAssociation(self, values, options) {
    const { transaction } = utils.getTriggerParams(options, 'tracking');
    if (transaction) {
      try {
        await transaction.commit();
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    }
    const { cache, instances } = utils.getTriggerParams(options, getScopeKey(options));
    const logs = [];
    for (let i = 0; i < instances.length; i += 1) {
      setScopeKey(options, i);
      await _wrappedAfterUpdateAssociation(instances[i], options, as);
    }
    _.each(cache, (update) => {
      if (update.list) {
        update.after[as] = _.sortBy(_.omit(update.after[as], 'length'), v => v.__position);
        update.after[as] = _.map(update.after[as], v => _.omit(v, '__position'));
      } else {
        update.before = safe(update.before);
        update.after = safe(update.after);
      }
      logs.push({
        type: 'UPDATE',
        reference: `${update.type}-${update.id}`,
        data: {
          type: update.type,
          id: update.id,
          before: update.before,
          after: update.after,
        },
        executionTime: update.executionTime,
        userId: options.user.id,
      });
    });
    if (logs.length) {
      await log(logs);
    }
  };
}

function beforeThroughSetter(model, association) {
  const scope = getScope(model, association);
  return async function wrappedBeforeThroughSetter(self, value, options) {
    if (!options.transaction) {
      const transaction = await scope.sequelize.transaction();
      options.transaction = transaction;
      utils.setTriggerParams(options, 'tracking', { transaction });
    }
    const trackingKey = getTrackingKey(model, options);
    perfy.start(trackingKey);
    const before = {};
    before[scope.as] = await scope.get(self.id, options.transaction);
    utils.setTriggerParams(options, getScopeKey(options), {
      before, trackingKey, scope,
    });
  };
}

function afterThroughSetter(as, log) {
  return async function wrappedAfterThroughSetter(self, value, options) {
    const { transaction } = utils.getTriggerParams(options, 'tracking');
    const { before, trackingKey, scope } = utils.getTriggerParams(options, getScopeKey(options));
    const after = {};
    after[as] = await scope.get(self.id, options.transaction);
    if (transaction) {
      try {
        await transaction.commit();
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    }
    await log([{
      type: 'UPDATE',
      reference: `${scope.name}-${self.id}`,
      data: {
        type: scope.name,
        id: self.id,
        before,
        after,
      },
      executionTime: perfy.end(trackingKey).nanoseconds,
      userId: options.user.id,
    }]);
  };
}

function enhanceModel(model, hooks, settings) {
  const name = utils.getName(model);
  const modelOptions = utils.getOptions(model);
  const associations = utils.getAssociations(model);

  let { log } = settings;
  if (!_.isFunction(log)) {
    log = async logs => _.each(logs, log => global.console.log(log));
  }

  _.each(associations, (association) => {
    // Add setter hooks:
    // addTask, addTasks, removeTask, removeTasks, setTask, setTasks
    if (utils.getAssociationOptions(association).extendHistory) {
      const as = utils.getAssociationAs(association);
      const singular = _.upperFirst(inflection.singularize(as));
      if (!utils.hasThroughAssociation(association)) {
        if (utils.isListAssociation(association)) {
          const plural = _.upperFirst(inflection.pluralize(as));
          if (singular !== plural) {
            hooks[name][`beforeAdd${singular}`].push(beforeNonThroughSetter(model, association));
            hooks[name][`afterAdd${singular}`].push(afterNonThroughSetter(as, log));
            hooks[name][`beforeRemove${singular}`].push(beforeNonThroughSetter(model, association));
            hooks[name][`afterRemove${singular}`].push(afterNonThroughSetter(as, log));
          }
          hooks[name][`beforeAdd${plural}`].push(beforeNonThroughSetter(model, association));
          hooks[name][`afterAdd${plural}`].push(afterNonThroughSetter(as, log));
          hooks[name][`beforeRemove${plural}`].push(beforeNonThroughSetter(model, association));
          hooks[name][`afterRemove${plural}`].push(afterNonThroughSetter(as, log));
          hooks[name][`beforeSet${plural}`].push(beforeNonThroughSetter(model, association));
          hooks[name][`afterSet${plural}`].push(afterNonThroughSetter(as, log));
        } else {
          hooks[name][`beforeSet${singular}`].push(beforeNonThroughSetter(model, association));
          hooks[name][`afterSet${singular}`].push(afterNonThroughSetter(as, log));
        }
      } else if (utils.isListAssociation(association)) {
        const plural = _.upperFirst(inflection.pluralize(as));
        if (singular !== plural) {
          hooks[name][`beforeAdd${singular}`].push(beforeThroughSetter(model, association));
          hooks[name][`afterAdd${singular}`].push(afterThroughSetter(as, log));
          hooks[name][`beforeRemove${singular}`].push(beforeThroughSetter(model, association));
          hooks[name][`afterRemove${singular}`].push(afterThroughSetter(as, log));
        }
        hooks[name][`beforeAdd${plural}`].push(beforeThroughSetter(model, association));
        hooks[name][`afterAdd${plural}`].push(afterThroughSetter(as, log));
        hooks[name][`beforeRemove${plural}`].push(beforeThroughSetter(model, association));
        hooks[name][`afterRemove${plural}`].push(afterThroughSetter(as, log));
        hooks[name][`beforeSet${plural}`].push(beforeThroughSetter(model, association));
        hooks[name][`afterSet${plural}`].push(afterThroughSetter(as, log));
      } else {
        hooks[name][`beforeSet${singular}`].push(beforeThroughSetter(model, association));
        hooks[name][`afterSet${singular}`].push(afterThroughSetter(as, log));
      }
    }

    // Add update hooks for BelongsTo associations. If Project has Task and Task is
    // updated, it should be logged in Project (if extendHistory is TRUE).
    const foreignKey = utils.getAssociationForeignKey(association);
    if (utils.isBelongsToAssociation(association) && !utils.hasThroughAssociation(association)) {
      let pairedAssociation = null;
      _.each(utils.getAssociations(utils.getAssociationTarget(association)), (a) => {
        const target = utils.getAssociationTarget(a);
        const targetForeignKey = utils.getAssociationForeignKey(a);
        if (utils.getName(target) === name && targetForeignKey === foreignKey) {
          pairedAssociation = a;
        }
      });
      if (pairedAssociation && utils.getAssociationOptions(pairedAssociation).extendHistory) {
        const as = utils.getAssociationAs(pairedAssociation);
        const target = utils.getAssociationTarget(association);
        const beforeHandler = beforeUpdateAssociation(target, pairedAssociation, foreignKey);
        const afterHandler = afterUpdateAssociation(as, log);
        const beforeBulkHandler = beforeBulkUpdateAssociation(
          model,
          target,
          pairedAssociation,
          foreignKey,
        );
        const afterBulkHandler = afterBulkUpdateAssociation(model, as, log);
        hooks[name].beforeCreate.push(beforeHandler);
        hooks[name].afterCreate.push(afterHandler);
        hooks[name].beforeUpdate.push(beforeHandler);
        hooks[name].afterUpdate.push(afterHandler);
        hooks[name].beforeDestroy.push(beforeHandler);
        hooks[name].afterDestroy.push(afterHandler);
        hooks[name].beforeBulkCreate.push(beforeBulkHandler);
        hooks[name].afterBulkCreate.push(afterBulkHandler);
        hooks[name].beforeBulkUpdate.push(beforeBulkHandler);
        hooks[name].afterBulkUpdate.push(afterBulkHandler);
        hooks[name].beforeBulkDestroy.push(beforeBulkHandler);
        hooks[name].afterBulkDestroy.push(afterBulkHandler);
      }
    }
  });

  if (modelOptions.history) {
    hooks[name].beforeCreate.push(beforeUpdate(model));
    hooks[name].afterCreate.push(afterUpdate(model, log));
    hooks[name].beforeUpdate.push(beforeUpdate(model));
    hooks[name].afterUpdate.push(afterUpdate(model, log));
    hooks[name].beforeDestroy.push(beforeUpdate(model));
    hooks[name].afterDestroy.push(afterUpdate(model, log));
    hooks[name].beforeBulkCreate.push(beforeBulkCreate(model));
    hooks[name].afterBulkCreate.push(afterBulkCreate(model, log));
    hooks[name].beforeBulkUpdate.push(beforeBulkUpdate(model));
    hooks[name].afterBulkUpdate.push(afterBulkUpdate(model, log));
    hooks[name].beforeBulkDestroy.push(beforeBulkUpdate(model));
    hooks[name].afterBulkDestroy.push(afterBulkUpdate(model, log));
  }
}

function enhance(db, hooks, settings) {
  _.each(db, (model) => {
    if (utils.isModel(model)) {
      enhanceModel(model, hooks, settings);
    }
  });
}

module.exports = enhance;
