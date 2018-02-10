const _ = require('lodash');
const perfy = require('perfy');
const inflection = require('inflection');
const utils = require('../utils');

const TEMP = 'TEMP';

function getTrackingKey(model) {
  return `${model.name}-${Math.random()}-${Date.now()}`;
}

function safe(value, model) {
  const hiddenAttributes = utils.getHiddenAttributes(model);
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
  const name = utils.getName(model);
  const target = utils.getAssociationTarget(association);
  const list = utils.isListAssociation(association);
  const as = utils.getAssociationAs(association);
  const attributes = _.without(
    _.keys(utils.getRawAttributes(target)),
    'updatedAt', 'updatedBy', 'createdAt',
    'createdBy', 'deletedAt', 'deletedBy',
  );
  const get = async (id) => {
    const params = {
      attributes: ['id'],
      where: { id },
      include: [],
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
    return _.map(instance[as], v => safe(_.pick(v, attributes), target));
  };
  return {
    name,
    target,
    list,
    as,
    get,
    attributes,
  };
}

function beforeSetter(model, association) {
  const scope = getScope(model, association);
  return async function wrappedBeforeSetter(self, value, options) {
    const trackingKey = getTrackingKey(model);
    perfy.start(trackingKey);
    const before = {};
    before[scope.as] = await scope.get(self.id);
    utils.setTriggerParams(options, 'tracking', {
      before, trackingKey, scope,
    });
  };
}

function afterSetter(log) {
  return async function wrappedAfterSetter(self, value, options) {
    const { before, trackingKey, scope } = utils.getTriggerParams(options, 'tracking');
    const after = {};
    after[scope.as] = await scope.get(self.id);
    await log({
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
    });
  };
}

function beforeUpdate(model, association, key) {
  const scope = getScope(model, association);
  const track = async (id, _instance, changes, state) => {
    const instance = _instance.toJSON();
    if (!instance.id) {
      instance.id = TEMP;
    }
    const { as, target, attributes } = scope;
    const type = scope.name;
    const before = {};
    before[as] = await scope.get(id);
    const after = {};
    if (scope.list) {
      if (state === 'removed') {
        after[as] = _.filter(before[as], v => v.id !== instance.id);
      } else if (state === 'added') {
        after[as] = _.concat(
          before[as],
          safe(_.pick(instance, attributes), target),
        );
      } else {
        after[as] = _.map(before[as], (v) => {
          if (v.id !== instance.id) {
            return v;
          }
          return safe(_.extend(v, _.pick(instance, changes)), target);
        });
      }
    } else if (state === 'removed') {
      after[as] = '';
    } else if (state === 'added') {
      after[as] = safe(_.pick(instance, attributes), target);
    } else {
      after[as] = safe(_.extend({}, before[as], _.pick(instance, changes)), target);
    }
    return {
      id,
      type,
      before,
      after,
    };
  };

  return async function wrappedBeforeUpdate(self, options) {
    const created = !self.id;
    const changes = self.changed();

    if (!changes.length && !created) {
      return;
    }
    const trackingKey = getTrackingKey(model);
    const updates = [];
    if (self[key] !== self.previous(key)) {
      if (self.previous(key)) {
        updates.push(track(self.previous(key), self, changes, 'removed'));
      }
      if (self[key]) {
        updates.push(track(self.previous(key), self, changes, 'added'));
      }
    } else {
      updates.push(track(self[key], self, changes, 'updated'));
    }
    await Promise.all(updates);
    utils.setTriggerParams(options, `tracking-${scope.as}`, { updates, trackingKey });
  };
}

function afterUpdate(as, log) {
  return async function wrappedAfterUpdate(self, options) {
    const { updates, trackingKey } = utils.getTriggerParams(options, `tracking-${as}`);
    if (updates.length) {
      const logs = [];
      const created = !self.id;
      const executionTime = perfy.end(trackingKey).nanoseconds;
      _.each(updates, (update) => {
        if (created) {
          _.each(update.after, (v, k) => {
            if (v && v.id === TEMP) {
              v.id = self.id;
            } else {
              _.each(update.after[k], (v) => {
                if (v && v.id === TEMP) {
                  v.id = self.id;
                }
              });
            }
          });
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
          executionTime,
          userId: options.user.id,
        });
      });
      await log(logs);
    }
  };
}

function enhance(model, hooks, settings) {
  const name = utils.getName(model);
  const modelOptions = utils.getOptions(model);
  const associations = utils.getAssociations(model);

  let { log } = settings;
  if (!_.isFunction(log)) {
    log = logs => _.each(logs, log => GLOBAL.console.log(log));
  }

  _.each(associations, (association) => {
    // Add setter hooks:
    // addTask, addTasks, removeTask, removeTasks, setTask, setTasks
    if (utils.getAssociationOptions(association).extendHistory) {
      const as = utils.getAssociationAs(association);
      const singular = _.upperFirst(inflection.singularize(as));
      if (utils.isListAssociation(association)) {
        const plural = _.upperFirst(inflection.pluralize(as));
        if (singular !== plural) {
          hooks[name][`beforeAdd${singular}`].push(beforeSetter(model, association));
          hooks[name][`afterAdd${singular}`].push(afterSetter(log));
          hooks[name][`beforeRemove${singular}`].push(beforeSetter(model, association));
          hooks[name][`afterRemove${singular}`].push(afterSetter(log));
        }
        hooks[name][`beforeAdd${plural}`].push(beforeSetter(model, association));
        hooks[name][`afterAdd${plural}`].push(afterSetter(log));
        hooks[name][`beforeRemove${plural}`].push(beforeSetter(model, association));
        hooks[name][`afterRemove${plural}`].push(afterSetter(log));
        hooks[name][`beforeSet${plural}`].push(beforeSetter(model, association));
        hooks[name][`afterSet${plural}`].push(afterSetter(log));
      } else {
        hooks[name][`beforeSet${singular}`].push(beforeSetter(model, association));
        hooks[name][`afterSet${singular}`].push(afterSetter(log));
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
        const target = utils.getAssociationTarget(pairedAssociation);
        hooks[name].beforeUpdate.push(beforeUpdate(target, pairedAssociation, foreignKey));
        hooks[name].afterUpdate.push(afterUpdate(utils.getAssociationAs(pairedAssociation), log));
      }
    }
  });

  if (modelOptions.history) {
    model.update = async function notPermittedUpdate() {
      throw new Error('Batch updates are not allowed');
    };
  }
}
module.exports = enhance;
