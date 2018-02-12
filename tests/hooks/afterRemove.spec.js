const _ = require('lodash');
const utils = require('../../utils');
const extendSequelize = require('../../');
const connection = require('../helpers/connection');
const dropAll = require('../helpers/dropAll');

const TEST = 'test';

describe('hooks', () => {
  let sequelize;
  let db;

  const reset = async () => {
    await dropAll(sequelize);
    db = {};
    db.user = sequelize.define('user', {
      username: sequelize.Sequelize.STRING(255),
    });
    db.task = sequelize.define('task', {
      title: sequelize.Sequelize.STRING(255),
    });
    db.project = sequelize.define('project', {
      project: sequelize.Sequelize.STRING(255),
    });
    db.task.belongsTo(db.user);
    db.user.hasMany(db.task);
    db.user.belongsToMany(db.project, { through: 'userProjects' });
    db.project.belongsToMany(db.user, { through: 'userProjects' });
    await sequelize.sync();
  };

  before(async () => {
    sequelize = connection();
  });

  after(async () => {
    sequelize.close();
  });

  describe('-> afterRemove:', () => {
    let fn;
    const extension = {
      afterRemoveTest: (db, hooks) => {
        const handler = (...args) => fn(...args);
        hooks[utils.getName(db.user)].afterRemoveTask.push(handler);
        hooks[utils.getName(db.user)].afterRemoveTasks.push(handler);
        hooks[utils.getName(db.project)].afterRemoveUser.push(handler);
        hooks[utils.getName(db.project)].afterRemoveUsers.push(handler);
      },
    };
    let project;
    let user1;
    let user2;
    let task1;
    let task2;

    before(async () => {
      await reset();
      extendSequelize(db, extension);
      project = await db.project.create({ name: TEST });
      user1 = await db.user.create({ username: TEST });
      user2 = await db.user.create({ username: TEST });
      task1 = await db.task.create({ title: TEST });
      task2 = await db.task.create({ title: TEST });
    });

    describe('-> 1:M relationship:', () => {
      it('should send user within the options (remove singular)', async () => {
        let userId;
        fn = (self, value, options) => { userId = options.user.id; };
        await user1.addTask(task1);
        await user1.removeTask(task1, { user: { id: 2 } });
        assert.equal(userId, 2);
      });

      it('should send user within the options (add plural)', async () => {
        let userId;
        fn = (self, value, options) => { userId = options.user.id; };
        await user2.addTasks([task1, task2]);
        await user2.removeTasks([task1, task2], { user: { id: 2 } });
        assert.equal(userId, 2);
      });

      it('should send default user within the options if options.user is empty (remove singular)', async () => {
        let userId;
        fn = (self, value, options) => { userId = options.user.id; };
        await user1.addTask(task1);
        await user1.removeTask(task1);
        assert.equal(userId, 1);
      });

      it('should send default user within the options if options.user is empty (remove plural)', async () => {
        let userId;
        fn = (self, value, options) => { userId = options.user.id; };
        await user2.addTasks([task1, task2]);
        await user2.removeTasks([task1, task2]);
        assert.equal(userId, 1);
      });

      it('should have removed objects correctly', async () => {
        await user2.addTasks([task1, task2]);
        let tasks = await user2.getTasks();
        assert.equal(tasks.length, 2);
        await user2.removeTasks([task1, task2]);
        tasks = await user2.getTasks();
        assert.equal(tasks.length, 0);
      });
    });

    describe('-> N:M relationship:', () => {
      it('should send user within the options (remove singular)', async () => {
        let userId;
        fn = (self, value, options) => { userId = options.user.id; };
        await project.addUser(user1);
        await project.removeUser(user1, { user: { id: 2 } });
        assert.equal(userId, 2);
      });

      it('should send user within the options (remove plural)', async () => {
        let userId;
        fn = (self, value, options) => { userId = options.user.id; };
        await project.addUsers([user1, user2]);
        await project.removeUsers([user1, user2], { user: { id: 2 } });
        assert.equal(userId, 2);
      });

      it('should send default user within the options if options.user is empty (remove singular)', async () => {
        let userId;
        fn = (self, value, options) => { userId = options.user.id; };
        await project.addUser(user1);
        await project.removeUser(user1);
        assert.equal(userId, 1);
      });

      it('should send default user within the options if options.user is empty (remove plural)', async () => {
        let userId;
        fn = (self, value, options) => { userId = options.user.id; };
        await project.addUsers([user1, user2]);
        await project.removeUsers([user1, user2]);
        assert.equal(userId, 1);
      });

      it('should have removed objects correctly', async () => {
        await project.addUsers([user1, user2]);
        let users = await project.getUsers();
        assert.equal(users.length, 2);
        await project.removeUsers([user1, user2]);
        users = await project.getUsers();
        assert.equal(users.length, 0);
      });
    });
  });
});
