const _ = require('lodash');

const utils = {};

const nativeTypes = [
  'INT',
  'INTEGER',
  'BIGINT',
  'TINYINT',
  'SMALLINT',
  'MEDIUMINT',
  'FLOAT',
  'DOUBLE',
  'DECIMAL',
  'REAL',
  'BOOL',
  'BOOLEAN',
  'STRING',
  'TEXT',
  'LONGTEXT',
  'DATE',
  'DATETIME',
  'TIMESTAMP',
  'BINARY',
  'BLOB',
  'JSON',
  'JSONTYPE',
];

const ucfirst = str => `${str.substring(0, 1).toUpperCase()}${str.substring(1)}`;

utils.getSequelize = model => model.sequelize;

utils.getBulkedInstances = async (model, options) => {
  if (options.__gsm === undefined) {
    options.__gsm = {};
  }
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
  if (options.__gsm === undefined) {
    options.__gsm = {};
  }
  if (!options.__gsm[scope]) {
    options.__gsm[scope] = {};
  }
  options.__gsm[scope] = _.extend(options.__gsm[scope], params);
};

utils.getTriggerParams = (options, scope) => {
  if (options.__gsm === undefined) {
    options.__gsm = {};
  }
  if (!options.__gsm[scope]) {
    options.__gsm[scope] = {};
  }
  return options.__gsm[scope];
};

utils.getTriggerType = options => utils.getTriggerParams(options, 'hook');

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
    type = ucfirst(_.camelCase(attribute.type.constructor.name));
  } else if (attribute.type && attribute.type.name) {
    type = ucfirst(_.camelCase(attribute.type.name));
  }
  if (type === 'Virtual') {
    type = attribute.type.returnType.constructor.name;
    if (nativeTypes.indexOf(type) >= 0) {
      type = ucfirst(_.camelCase(type));
    }
  }
  if (!type) {
    throw new Error('Unexpected Type');
  }
  return type;
};

utils.isVirtualModel = model => !!model.virtual;

utils.isNewRecord = instance => instance && instance._options && instance._options.isNewRecord;

utils.getAttributeValues = attribute => attribute.values;

utils.isNullableAttribute = (attribute) => {
  if (attribute.allowNull === undefined) {
    return true;
  }
  return !!attribute.allowNull;
};

utils.isInstance = value => !!(value && value.dataValues);

utils.isModel = model => !!(model && model.options && !!model.options.sequelize);

utils.getName = model => model.name;

utils.getOptions = model => model.options;

utils.isListAssociation = association => association.associationType === 'HasMany' ||
  association.associationType === 'BelongsToMany';

utils.getAssociationType = association => association.associationType;

utils.isBelongsToAssociation = association => association.associationType === 'BelongsTo';

utils.hasThroughAssociation = association => !!association.through;

utils.getAssociationTarget = association => association.target;

utils.getAssociationSource = association => association.source;

utils.getAssociationForeignKey = association => association.foreignKey;

utils.getAssociationAs = association => association.as;

utils.getAssociationOptions = association => association.options;

module.exports = utils;
