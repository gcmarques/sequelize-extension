# sequelize-extension

[![Build Status](https://travis-ci.org/gcmarques/sequelize-extension.svg?branch=master)](https://travis-ci.org/gcmarques/sequelize-extension)
[![codecov](https://codecov.io/gh/gcmarques/sequelize-extension/branch/master/graph/badge.svg)](https://codecov.io/gh/gcmarques/sequelize-extension)
![GitHub license](https://img.shields.io/github/license/gcmarques/sequelize-extension.svg)

This module provides pre-built extensions and an interface to extend sequelize models.

### Installation
```
$ npm install --save sequelize
$ npm install --save sequelize-extension
```

### Usage

```
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

### Built-in Extensions

The built-in extensions are disabled by default. In order to enable, you can call like below:

```
extendSequelize(db, {
  tracking: { log: console.log },
  // the extension settings can also be an empty object: {}
});
```

### Tracking

This extension enables to track instance changes. You can define what models will be tracked using the option `history` and you can define what associated fields will be tracked using `extendHistory` option when creating the association. `extendHistory` is `false` by default.
```
const Project = sequelize.define('project', {
  name: DataTypes.STRING(255),
}, { 
  history: true 
});
const Task = sequelize.define('project', {
  name: DataTypes.STRING(255),
}, { 
  history: false 
});
const User = sequelize.define('project', {
  username: DataTypes.STRING(255),
}, { 
  history: false 
});
Task.belongsTo(Project);
User.belongsToMany(Project, { through: 'userProjects' });
Project.belongsToMany(User, { through: 'userProjects', extendHistory: true });
Project.hasMany(Task, { extendHistory: true });

extendSequelize(db, {
  tracking: { log: console.log }
});

const project = await Project.create({ name: 'My Project' });
// [
//   type: 'UPDATE',
//   reference: 'project-1',
//   data: {
//     id: 1,
//     type: 'project',
//     before: {},
//     after: { name: 'My Project' }
//   },
//   executionTime: 1000 (nanoseconds)
// ]
const user = await User.create({ username: 'gabriel@test.com' });
await project.addUser(user);
// [
//   reference: 'project-1',
//   ...
//     before: { users: [] },
//     after: { users: [{ id: 1, username: 'gabriel@test.com' }] }
//   ...
// ]
const task = await Task.create({ name: 'Test', projectId: 1 });
// [
//   reference: 'project-1',
//   ...
//     before: { tasks: [] },
//     after: { tasks: [{ id: 1, name: 'Test'}] }
//   ...
// ]
```

### GraphQL

This extension uses [graphql-tools-sequelize](https://github.com/rse/graphql-tools-sequelize) to generate a GraphQL schema based on the sequelize models. It is required to provided a booted `gts` instance to initialize the models.

```
const GraphQLToolsSequelize = require('graphql-tools-sequelize');
...
const gts = new GraphQLToolsSequelize(sequelize, { idtype: 'ID' });
await gts.boot();

// You can add custom mutations. Each mutation can have three attributes:
// `input` is optional. If present, it will be added to the top of the schema.
// `schema` is required.
// `resolver` is required.
db.User.mutations = {};
db.User.mutations.authenticate = {
  input: `
    AuthenticateUserInput {
      username: String
      password: String
    }`,
  schema: `
    # Authenticate \[user\]() with username and password.
    authenticate(with: AuthenticateUserInput!): JSON!
  `,
  resolver: async (_, input, ctx) => {
    const { username, password } = input.with;
    ...
  },
};

// You can add custom queries
db.User.queries = {};
db.User.queries.pendingEmails = {
  schema: `...`
  resolver: async (_, input, ctx) => {
    ...
  },
};

// You can overwrite the default queries and mutations created by GTS.
db.User.mutations.create = {
  schema: `
    # Create \[user\]() with a json.
    create(with: JSON!): User!
  `,
  resolver: async (_, input, ctx) => {
    const { username, password } = input.with;
    ...
  },
}

// The extension will automatically create:
// - create(id: ID!, with: JSON!)
// - update(with: JSON!)
// - clone()
// - delete()
// - All associated attributes and it's resolvers
extendSequelize(db, {
  graphql: { gts },
});

```

### CreatedBy

If a model has a `createdBy` field, this extension will automatically add `options.user.id` to `createdBy` upon an instance is creation.
```
const task1 = await db.task.create({...}, { user: { id: 2 } });
console.log(task1.createdBy);
// 2

const task2 = await db.task.create({...});
console.log(task2.createdBy);
// 1 <- default userId
```

### UpdatedBy

If a model has a `updatedBy` field, this extension will automatically add `options.user.id` to `updatedBy`.
```
await task.save({ user: { id: 2 } });
console.log(task1.updatedBy);
// 2

await task.save();
console.log(task1.updatedBy);
// 1 <- default userId
```

### DeletedBy

If a model has a `deletedBy` field, this extension will automatically add `options.user.id` to `deletedBy`.
```
await task.destroy({ user: { id: 2 } });
console.log(task1.deletedBy);
// 2

await task.destroy();
console.log(task1.deletedBy);
// 1 <- default userId
```
