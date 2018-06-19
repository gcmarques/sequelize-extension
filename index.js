const _ = require('lodash');
const inflection = require('inflection');
const utils = require('./utils');
const enhancers = require('./enhancers');

function wrappedOptions(options) {
  options = options || {};
  if (!options.__gsm) {
    options.__gsm = {};
  }
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
    if (!options.__gsm.hook) {
      options.__gsm.hook = functionName;
    }
    await callHooks(hooks[`before${triggerName}`], this, value, options);
    const result = await set.call(this, value, options);
    await callHooks(hooks[`after${triggerName}`], this, value, options);
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
      hooks[name] = {
        beforeUpdate: [],
        afterUpdate: [],
        beforeBulkUpdate: [],
        afterBulkUpdate: [],
        beforeCreate: [],
        afterCreate: [],
        beforeBulkCreate: [],
        afterBulkCreate: [],
        beforeDestroy: [],
        afterDestroy: [],
        beforeBulkDestroy: [],
        afterBulkDestroy: [],
      };

      model.beforeCreate(async (values, options) => {
        options = wrappedOptions(options);
        if (!options.__gsm.hook) {
          options.__gsm.hook = 'CREATE';
        }
        await callHooks(hooks[name].beforeCreate, values, options);
      });
      model.afterCreate(async (values, options) => {
        options = wrappedOptions(options);
        if (!options.__gsm.hook) {
          options.__gsm.hook = 'CREATE';
        }
        await callHooks(hooks[name].afterCreate, values, options);
      });
      model.beforeBulkCreate(async (values, options) => {
        options = wrappedOptions(options);
        if (!options.__gsm.hook) {
          options.__gsm.hook = 'BULKCREATE';
        }
        await callHooks(hooks[name].beforeBulkCreate, values, options);
      });
      model.afterBulkCreate(async (values, options) => {
        options = wrappedOptions(options);
        if (!options.__gsm.hook) {
          options.__gsm.hook = 'BULKCREATE';
        }
        await callHooks(hooks[name].afterBulkCreate, values, options);
      });
      model.beforeUpdate(async (values, options) => {
        options = wrappedOptions(options);
        if (!options.__gsm.hook) {
          options.__gsm.hook = 'UPDATE';
        }
        await callHooks(hooks[name].beforeUpdate, values, options);
      });
      model.afterUpdate(async (values, options) => {
        options = wrappedOptions(options);
        if (!options.__gsm.hook) {
          options.__gsm.hook = 'UPDATE';
        }
        await callHooks(hooks[name].afterUpdate, values, options);
      });
      model.beforeBulkUpdate(async (options) => {
        options = wrappedOptions(options);
        if (!options.__gsm.hook) {
          options.__gsm.hook = 'BULKUPDATE';
        }
        await callHooks(hooks[name].beforeBulkUpdate, options);
      });
      model.afterBulkUpdate(async (options) => {
        options = wrappedOptions(options);
        if (!options.__gsm.hook) {
          options.__gsm.hook = 'BULKUPDATE';
        }
        await callHooks(hooks[name].afterBulkUpdate, options);
      });
      model.beforeDestroy(async (values, options) => {
        options = wrappedOptions(options);
        if (!options.__gsm.hook) {
          options.__gsm.hook = 'DESTROY';
        }
        await callHooks(hooks[name].beforeDestroy, values, options);
      });
      model.afterDestroy(async (values, options) => {
        options = wrappedOptions(options);
        if (!options.__gsm.hook) {
          options.__gsm.hook = 'DESTROY';
        }
        await callHooks(hooks[name].afterDestroy, values, options);
      });
      model.beforeBulkDestroy(async (options) => {
        options = wrappedOptions(options);
        if (!options.__gsm.hook) {
          options.__gsm.hook = 'BULKDESTROY';
        }
        await callHooks(hooks[name].beforeBulkDestroy, options);
      });
      model.afterBulkDestroy(async (options) => {
        options = wrappedOptions(options);
        if (!options.__gsm.hook) {
          options.__gsm.hook = 'BULKDESTROY';
        }
        await callHooks(hooks[name].afterBulkDestroy, options);
      });

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
      const fn = _.isFunction(settings) ?
        settings : enhancers[name](_.isObject(settings) ? settings : {});
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
wrapModels.utils = utils;

module.exports = wrapModels;
