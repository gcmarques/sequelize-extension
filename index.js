const _ = require('lodash');
const inflection = require('inflection');
const utils = require('./utils');
const enhancers = require('./enhancers');

function wrappedOptions(options) {
  options = options || {};
  options.__gsm = {};
  options.user = utils.getUser(options);
  return options;
}

async function callHooks(hooks, ...params) {
  for (let i = 0; i < hooks.length; i += 1) {
    const fn = hooks[i];
    await fn.call(null, ...params);
  }
}

function wrapSetter(model, functionName, hooks) {
  const set = model.prototype[functionName];
  const triggerName = _.upperFirst(functionName);
  model.prototype[functionName] = async function wrappedSetter(value, options) {
    options = wrappedOptions(options);
    options.__gsm.hook = `before${triggerName}`;
    await callHooks(hooks[options.__gsm.hook], this, value, options);
    const result = await set.call(this, value, options);
    options.__gsm.hook = `after${triggerName}`;
    await callHooks(hooks[options.__gsm.hook], this, value, options);
    return result;
  };
}

function wrapModels(models, options) {
  const hooks = {};
  const defaults = {};
  _.each(enhancers, (enhancer, key) => {
    defaults[key] = false;
  });

  // Prepare hooks and wrap sequelize functions
  _.each(models, (model) => {
    if (utils.isModel(model)) {
      const name = utils.getName(model);
      const modelOptions = utils.getOptions(model);
      hooks[name] = {
        beforeUpdate: [],
        afterUpdate: [],
        beforeCreate: [],
        afterCreate: [],
        beforeDestroy: [],
        afterDestroy: [],
      };

      model.beforeCreate(async (self, options) => {
        options = wrappedOptions(options);
        await callHooks(hooks[name].beforeCreate, self, options);
      });
      model.afterCreate(async (self, options) => {
        options = wrappedOptions(options);
        await callHooks(hooks[name].afterCreate, self, options);
      });
      model.beforeUpdate(async (self, options) => {
        options = wrappedOptions(options);
        await callHooks(hooks[name].beforeUpdate, self, options);
      });
      model.afterUpdate(async (self, options) => {
        options = wrappedOptions(options);
        await callHooks(hooks[name].afterUpdate, self, options);
      });
      model.beforeDestroy(async (self, options) => {
        options = wrappedOptions(options);
        options.fields = self.changed() || [];
        await callHooks(hooks[name].beforeDestroy, self, options);
      });
      model.afterDestroy(async (self, options) => {
        options = wrappedOptions(options);
        await callHooks(hooks[name].afterDestroy, self, options);
      });

      const { update } = model;
      model.update = function wrappedUpdate(values, options) {
        options = wrappedOptions(options);
        if (!_.has(options, 'individualHooks')) {
          options.individualHooks = true;
        }
        return update.call(this, values, options);
      };

      const { bulkCreate } = model;
      model.bulkCreate = function wrappedBulkCreate(values, options) {
        options = wrappedOptions(options);
        if (!_.has(options, 'individualHooks')) {
          options.individualHooks = true;
        }
        return bulkCreate.call(this, values, options);
      };

      const { destroy } = model;
      model.destroy = async function wrappedDestroy(options) {
        options = wrappedOptions(options);
        if (!_.has(options, 'individualHooks')) {
          options.individualHooks = true;
        }
        options.fields = ['deletedAt'];

        let result;
        if (!options.individualHooks) {
          result = await destroy.call(this, options);
        } else {
          // This allows the hook to change fields while destroying
          const now = new Date();
          const instances = await model.findAll({
            where: options.where,
            include: options.include,
          });
          if (instances.length) {
            for (let i = 0; i < instances.length; i += 1) {
              await callHooks(hooks[name].beforeDestroy, instances[i], options);
            }
            const id = [];
            _.each(instances, (instance) => { id.push(instance.id); });
            if (!modelOptions.paranoid || options.force) {
              result = await destroy.call(this, {
                hooks: false,
                where: { id, deletedAt: null },
              });
            } else {
              _.each(instances, (instance) => { instance.setDataValue('deletedAt', now); });
              const values = _.pick(instances[0], options.fields);
              await update.call(this, values, {
                hooks: false,
                where: { id, deletedAt: null },
              });
            }
            for (let i = 0; i < instances.length; i += 1) {
              await callHooks(hooks[name].afterDestroy, instances[i], options);
            }
          } else {
            result = 0;
          }
        }
        return result;
      };

      _.each(utils.getAssociations(model), (association) => {
        const as = utils.getAssociationAs(association);
        const singular = _.upperFirst(inflection.singularize(as));
        if (utils.isListAssociation(association)) {
          const plural = _.upperFirst(inflection.pluralize(as));
          if (singular !== plural) {
            hooks[name][`beforeAdd${singular}`] = [];
            hooks[name][`afterAdd${singular}`] = [];
            wrapSetter(model, `add${singular}`, hooks[name]);

            hooks[name][`beforeRemove${singular}`] = [];
            hooks[name][`afterRemove${singular}`] = [];
            wrapSetter(model, `remove${singular}`, hooks[name]);
          }
          hooks[name][`beforeAdd${plural}`] = [];
          hooks[name][`afterAdd${plural}`] = [];
          wrapSetter(model, `add${plural}`, hooks[name]);

          hooks[name][`beforeRemove${plural}`] = [];
          hooks[name][`afterRemove${plural}`] = [];
          wrapSetter(model, `remove${plural}`, hooks[name]);

          hooks[name][`beforeSet${plural}`] = [];
          hooks[name][`afterSet${plural}`] = [];
          wrapSetter(model, `set${plural}`, hooks[name]);
        } else {
          hooks[name][`beforeSet${singular}`] = [];
          hooks[name][`afterSet${singular}`] = [];
          wrapSetter(model, `set${singular}`, hooks[name]);
        }
      });
    }
  });

  // enhance models
  _.each(_.defaults({}, options, defaults), (settings, name) => {
    if (settings !== false) {
      const fn = _.isFunction(settings) ? settings : enhancers[name];
      if (_.isFunction(fn)) {
        if (!_.isPlainObject(settings)) {
          settings = {};
        }
        settings.utils = utils;
        fn(models, hooks, settings);
      }
    }
  });
  return models;
}
module.exports = wrapModels;
