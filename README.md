# sequelize-extension

[![Build Status](https://travis-ci.org/gcmarques/sequelize-extension.svg?branch=master)](https://travis-ci.org/gcmarques/sequelize-extension)
[![codecov](https://codecov.io/gh/gcmarques/sequelize-extension/branch/master/graph/badge.svg)](https://codecov.io/gh/gcmarques/sequelize-extension)
![GitHub license](https://img.shields.io/github/license/gcmarques/sequelize-extension.svg)

This module provides pre-built extensions and an interface to extend sequelize models.

## Installation
```bash
$ npm install --save sequelize
$ npm install --save sequelize-extension
```

## Usage

```javascript
const Sequelize = require('sequelize');
const extendSequelize = require('sequelize-extension');

const sequelize = new Sequelize(...);

// Load Models
const db = {};
fs
  .readdirSync(__dirname)
  .filter(file => (file.indexOf('.') !== 0) && (file !== basename) && (file.slice(-3) === '.js'))
  .forEach((file) => {
    const model = sequelize.import(path.join(__dirname, file));
    db[model.name] = model;
  });
  
// Associate Models
db.forEach((model) => {
  if (model.associate) {
    model.associate(db);
  }
});

extendSequelize(db, {
  myCustomExtension: (db, hooks, settings) => {
    const { utils } = settings;
    _.each(db, (model) => {
      if (utils.isModel(model)) {
        _.each(utils.getAssociations(model), (association) => {
          if (utils.isListAssociation(association)) {
            // do something...
          }
        });
      }
    });
  },
});
```

## Built-in Extensions

The built-in extensions are disabled by default. In order to enable, you can call like below:

```javascript
extendSequelize(db, {
  createdBy: {},
  deletedBy: {},
  updatedBy: {},
  graphql: { gts },
  tracking: { log: console.log },
});
```

The built-in extensions are:
* `tracking` - [sequelize-extension-tracking](https://www.npmjs.com/package/sequelize-extension-tracking) - Automatically track sequelize instance updates.
* `graphql` - [sequelize-extension-graphql](https://www.npmjs.com/package/sequelize-extension-graphql) - Create GraphQL schema based on sequelize models.
* `createdBy` - [sequelize-extension-createdby](https://www.npmjs.com/package/sequelize-extension-createdby) - Automatically set `createdBy` with `options.user.id` option.
* `deletedBy` - [sequelize-extension-deletedby](https://www.npmjs.com/package/sequelize-extension-deletedby) - Automatically set `deletedBy` with `options.user.id` option.
* `updatedBy` - [sequelize-extension-updatedby](https://www.npmjs.com/package/sequelize-extension-updatedby) - Automatically set `updatedBy` with `options.user.id` option.

## Custom Extensions

### Hooks
```javascript
extendSequelize(db, {
  extensionName: (db, hooks, settings) => {
    hooks.beforeUpdate.push(async (instance, options) => {
      // do something
    });
  },
});
```

Single instance triggers:
* `beforeUpdate` (instance: Model, options: Object)
* `afterUpdate` (instance: Model, options: Object)
* `beforeCreate` (instance: Model, options: Object)
* `afterCreate` (instance: Model, options: Object)
* `beforeDestroy` (instance: Model, options: Object)
* `afterDestroy` (instance: Model, options: Object)

For bulk triggers, you can pull the bulked instances using `utils.getBulkedInstance(options)`. It will make at maximum one call to the database and cache the result in the options.
* `beforeBulkUpdate` (options: Object)
* `afterBulkUpdate` (options: Object)
* `beforeBulkCreate` (options: Object)
* `afterBulkCreate` (options: Object)
* `beforeBulkDestroy` (options: Object)
* `afterBulkDestroy` (options: Object)
