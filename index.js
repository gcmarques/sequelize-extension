const _ = require('lodash');
const inflection = require('inflection');
const utils = require('./utils');
const enhancers = require('./enhancers');

const defaults = {};
_.each(enhancers, (key) => {
  defaults[key] = {};
});

function wrappedOptions(options) {
  options = options || {};
  options.__gsm = {};
  return options;
}

async function callTriggers(triggers, ...params) {
  for (let i = 0; i < triggers.length; i += 1) {
    const fn = triggers[i];
    await fn.call(null, ...params);
  }
}

function wrapSetter(model, functionName, hooks) {
  const set = model.prototype[functionName];
  const triggerName = _.upperFirst(functionName);
  model.prototype[functionName] = async function wrappedSet(value, options) {
    options = wrappedOptions(options);
    await callTriggers(hooks[`before${triggerName}`], this, value, options);
    const result = set.call(this, value, options);
    await callTriggers(hooks[`after${triggerName}`], this, value, options);
    return result;
  };
}

function wrapModels(models, options) {
  const hooks = {};

  // Prepare hooks and wrap sequelize functions
  _.each(models, (model) => {
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
        await callTriggers(hooks[name].beforeCreate, this, options);
      }
      await callTriggers(hooks[name].beforeUpdate, this, options);
      const result = save.call(this, options);
      if (!this.id) {
        await callTriggers(hooks[name].afterCreate, this, options);
      }
      await callTriggers(hooks[name].afterUpdate, this, options);
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
  });

  // enhance models
  _.each(_.defaultsDeep(defaults, options), (name, settings) => {
    if (settings !== false) {
      _.each(models, model => enhancers[name](model, hooks, settings));
    }
  });
  return models;
}
module.exports = wrapModels;
