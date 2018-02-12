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
    defaults[key] = {};
  });

  // Prepare hooks and wrap sequelize functions
  _.each(models, (model) => {
    if (utils.isModel(model)) {
      const name = utils.getName(model);
      hooks[name] = {
        beforeUpdate: [],
        afterUpdate: [],
        beforeCreate: [],
        afterCreate: [],
        beforeDestroy: [],
        afterDestroy: [],
      };

      const { save } = model.prototype;
      model.prototype.save = async function wrappedSave(options) {
        options = wrappedOptions(options);
        if (!this.id) {
          await callHooks(hooks[name].beforeCreate, this, options);
        }
        await callHooks(hooks[name].beforeUpdate, this, options);
        const result = await save.call(this, options);
        if (!this.id) {
          await callHooks(hooks[name].afterCreate, this, options);
        }
        await callHooks(hooks[name].afterUpdate, this, options);
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
  _.each(_.defaultsDeep(defaults, options), (settings, name) => {
    if (settings !== false) {
      const fn = _.isFunction(name) ? name : enhancers[name];
      if (_.isFunction(fn)) {
        fn(models, hooks, settings);
      }
    }
  });
  return models;
}
module.exports = wrapModels;
