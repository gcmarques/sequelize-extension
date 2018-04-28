const _ = require('lodash');
const utils = require('../utils');
const GraphQLTools = require('graphql-tools');
const GraphQLToolsTypes = require('graphql-tools-types');

const enumRegex = /^[_A-Za-z][_0-9A-Za-z]+$/;

function getType(attribute) {
  let type = utils.getAttributeType(attribute);
  if (type === 'Id' || type === 'Bigint') {
    type = 'ID';
  }
  if (type === 'Decimal' || type === 'Double' || type === 'Real') {
    type = 'Float';
  }
  if (type === 'Integer') {
    type = 'Int';
  }
  if (type === 'Text' || type === 'Longtext') {
    type = 'String';
  }
  return type;
}

function getSchema(model, type, schema, gts) {
  const name = utils.getName(model);
  if (_.has(model[type], schema) &&
    (model[type][schema] === false || model[type][schema].schema === false)) {
    return false;
  }
  let val = '';
  if (!_.has(model[type], schema) || !model[type][schema].schema) {
    switch (schema) {
      case 'retrieve': val = gts.entityQuerySchema('root', '', name); break;
      case 'list': val = gts.entityQuerySchema('root', '', `${name}*`); break;
      case 'create': val = gts.entityCreateSchema(name); break;
      case 'clone': val = gts.entityCloneSchema(name); break;
      case 'update': val = gts.entityUpdateSchema(name); break;
      case 'delete': val = gts.entityDeleteSchema(name); break;
      default: throw new Error(`There is no default schema defined for "${type}.${schema}"`);
    }
  } else if (_.isString(model[type][schema].schema)) {
    val = model[type][schema].schema;
  } else {
    throw new Error(`Missing schema for "${type}.${schema}". Expected string and received ${typeof model[type][schema].schema}.`);
  }
  return val ? `${val}\n` : '';
}

function getResolver(model, type, resolver, gts) {
  const name = utils.getName(model);
  if (_.has(model[type], resolver) &&
    (model[type][resolver] === false || model[type][resolver].resolver === false)) {
    return false;
  }
  let val = null;
  if (!_.has(model[type], resolver) || !model[type][resolver].resolver) {
    switch (resolver) {
      case 'retrieve': val = gts.entityQueryResolver('root', '', name); break;
      case 'list': val = gts.entityQueryResolver('root', '', `${name}*`); break;
      case 'create': val = gts.entityCreateResolver(name); break;
      case 'clone': val = gts.entityCloneResolver(name); break;
      case 'update': val = gts.entityUpdateResolver(name); break;
      case 'delete': val = gts.entityDeleteResolver(name); break;
      default: throw new Error(`There is no default resolver defined for "${type}.${resolver}"`);
    }
  } else if (_.isFunction(model[type][resolver].resolver)) {
    val = model[type][resolver].resolver;
  } else {
    throw new Error(`Missing resolver for "${type}.${resolver}". Expected function and received ${typeof model[type][resolver].resolver}.`);
  }
  return val;
}

function enhanceModel(model, hooks, settings) {
  const { gts } = settings;
  if (!gts) {
    throw new Error('The graphql enhancer requires a booted gts');
  }
  const name = utils.getName(model);
  const attributes = utils.getRawAttributes(model);
  const associations = utils.getAssociations(model);

  model.queries = model.queries || {};
  model.mutations = model.mutations || {};
  model.graphql = {
    enums: '',
    inputs: '',
    enumCount: 0,
    attributes: '',
    methods: {
      attributes: '',
      resolvers: {},
    },
    enumTable: {},
    resolvers: {},
    type: () => `type ${name} {\n${model.graphql.attributes}}`,
  };

  _.each(attributes, (attribute, key) => {
    if (!attribute.hidden) {
      let type = getType(attribute);
      if (type === 'Enum') {
        model.graphql.enumCount += 1;
        type = `${name}Enum${model.graphql.enumCount}`;
        if (!model.graphql.enumTable[attribute]) {
          model.graphql.enumTable[attribute] = {};
        }
        model.graphql.enums += `enum ${type} {\n`;
        _.each(utils.getAttributeValues(attribute), (value, i) => {
          let validEnum = value;
          if (!enumRegex.test(validEnum)) {
            validEnum = validEnum.replace(/ +/g, '_');
            if (!enumRegex.test(validEnum)) {
              validEnum = validEnum.replace(/-+/g, '_');
              if (!enumRegex.test(validEnum)) {
                if (/^[^_A-Za-z]/.test(validEnum)) {
                  validEnum = `V_${validEnum}`;
                }
                validEnum = validEnum.replace(/[^_0-9A-Za-z]/g, '_');
              }
            }
          }
          model.graphql.enumTable[attribute][value] = validEnum;
          model.graphql.enumTable[attribute][validEnum] = value;
          model.graphql.enums += `${i > 0 ? '\n' : ''}${validEnum}`;
        });
        model.graphql.enums += '\n}\n';
      }
      model.graphql.attributes += `${key}: ${type}${!utils.isNullableAttribute(attribute) ? '!' : ''}\n`;
    }
  });

  _.each(associations, (association, key) => {
    const list = utils.isListAssociation(association);
    const options = utils.getAssociationOptions(association);
    if (!options.hidden) {
      const targetName = utils.getName(utils.getAssociationTarget(association));
      model.graphql.attributes += `${key}: ${list ? `[${targetName}]!` : `${targetName}`}\n`;
      model.graphql.resolvers[key] = gts.entityQueryResolver(name, key, `${targetName}${list ? '*' : ''}`);
    }
  });

  _.each(['create', 'clone', 'update', 'delete'], (action) => {
    model.mutations[action] = {
      schema: getSchema(model, 'mutations', action, gts),
      resolver: getResolver(model, 'mutations', action, gts),
    };
  });
  _.each(model.mutations, (definition, action) => {
    let aux = getSchema(model, 'mutations', action);
    if (aux) {
      model.graphql.attributes += aux;
    }
    aux = getResolver(model, 'mutations', action);
    if (aux) {
      model.graphql.resolvers[action] = aux;
    }
    if (definition.input) {
      model.graphql.inputs += definition.input;
    }
  });

  _.each(['retrieve', 'list'], (action) => {
    model.queries[action] = {
      schema: getSchema(model, 'queries', action, gts),
      resolver: getResolver(model, 'queries', action, gts),
    };
  });
  _.each(model.queries, (definition, action) => {
    let aux = getSchema(model, 'queries', action, gts);
    if (aux) {
      model.graphql.methods.attributes += aux;
    }
    aux = getResolver(model, 'queries', action, gts);
    if (aux) {
      if (action === 'retrieve') {
        model.graphql.methods.resolvers[model.options.name.singular] = aux;
      } else if (action === 'list') {
        model.graphql.methods.resolvers[model.options.name.plural] = aux;
      } else {
        model.graphql.methods.resolvers[action] = aux;
      }
    }
  });
}

function enhance(db, hooks, settings) {
  let methods = '';
  let enums = '';
  let inputs = '';
  const types = [];
  const resolvers = {
    UUID: GraphQLToolsTypes.UUID({ name: 'UUID', storage: 'string' }),
    JSON: GraphQLToolsTypes.JSON({ name: 'JSON' }),
    Jsontype: GraphQLToolsTypes.JSON({ name: 'Jsontype' }),
    Date: GraphQLToolsTypes.Date({ name: 'Date' }),
    root: {},
  };

  _.each(db, (model) => {
    if (utils.isModel(model)) {
      enhanceModel(model, hooks, settings);
      enums += model.graphql.enums;
      inputs += model.graphql.inputs;
      types.push(model.graphql.type());
      resolvers[model.name] = model.graphql.resolvers;
      methods += model.graphql.methods.attributes;
      _.extend(resolvers.root, model.graphql.methods.resolvers);
    }
  });

  const typeDefs = `
    schema {
      query: root
      mutation: root
    }
    scalar UUID
    scalar JSON
    scalar Jsontype
    scalar Date
    ${enums}
    ${inputs}
    type root {
      ${methods}
    }
    ${types.join('')}`;
    
  db.getGraphQLExecutableSchema = () => GraphQLTools.makeExecutableSchema({ typeDefs, resolvers });
}

module.exports = enhance;
