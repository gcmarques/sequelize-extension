const _ = require('lodash');

const utils = {};

utils.getSequelize = model => model.sequelize;

utils.getBulkedInstances = async (model, options) => {
  if (options.__gsm.__instances === undefined) {
    options.__gsm.__instances = await model.findAll({
      where: options.where,
      include: options.include,
      transaction: options.transaction,
    });
  }
  return options.__gsm.__instances;
};

utils.setTriggerParams = (options, scope, params) => {
  if (!options.__gsm[scope]) {
    options.__gsm[scope] = {};
  }
  options.__gsm[scope] = _.extend(options.__gsm[scope], params);
};

utils.getTriggerParams = (options, scope) => {
  if (!options.__gsm[scope]) {
    options.__gsm[scope] = {};
  }
  return options.__gsm[scope];
};

utils.getTriggerType = options => options.__gsm.hook;

utils.getUser = (options) => {
  const user = options ? options.user : null;
  return user || { id: 1, role: 'Server' };
};

utils.getAssociations = model => model.associations;

utils.getRawAttributes = model => model.rawAttributes;

utils.getHiddenAttributes = (model) => {
  if (!_.has(model, 'hiddenAttributes')) {
    model.hiddenAttributes = {};
    _.each(utils.getRawAttributes(model), (attribute, key) => {
      if (attribute.hidden) {
        model.hiddenAttributes[key] = key;
      }
    });
  }
  return model.hiddenAttributes;
};

utils.getAttributeType = (attribute) => {
  let type = null;
  if (attribute.fieldName === 'id') {
    type = 'Id';
  } else if (attribute.type && attribute.type.constructor && attribute.type.constructor.name) {
    type = _.capitalize(attribute.type.constructor.name);
  } else if (attribute.type && attribute.type.name) {
    type = _.capitalize(attribute.type.name);
  }
  if (type === 'Virtual') {
    type = _.capitalize(attribute.type.returnType.constructor.name);
  }
  if (!type) {
    throw new Error('Unexpected Type');
  }
  return type;
};

utils.isNewRecord = instance => instance && instance._options && instance._options.isNewRecord;

utils.getAttributeValues = attribute => attribute.values;

utils.isNullableAttribute = attribute => !!attribute.allowNull;

utils.isInstance = value => value && value.dataValues;

utils.isModel = model => model && model.options && !!model.options.sequelize;

utils.getName = model => model.name;

utils.getOptions = model => model.options;

utils.isListAssociation = association => association.associationType === 'HasMany' ||
  (association.paired && association.paired.associationType === 'BelongsToMany');

utils.isBelongsToAssociation = association => association.associationType === 'BelongsTo';

utils.hasThroughAssociation = association => !!association.through;

utils.getAssociationTarget = association => association.target;

utils.getAssociationSource = association => association.source;

utils.getAssociationForeignKey = association => association.foreignKey;

utils.getAssociationAs = association => association.as;

utils.getAssociationOptions = association => association.options;

module.exports = utils;
