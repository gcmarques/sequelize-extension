# sequelize-extension

This module provides pre-built extensions and an interface to extend sequelize models.

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
  myExtension: (model, hooks) => { ... },
});
```

### Built-in Extensions

The built-in extensions are enabled by default. In order to disable, you can call like below:

```
extendSequelize(db, {
  tracking: false,
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

### Tracking

This extension enables to track changes instance changes.
