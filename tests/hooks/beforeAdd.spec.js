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

  describe('-> beforeAdd:', () => {
    let fn;
    const extension = {
      beforeAddTest: (db, hooks) => {
        const handler = (...args) => fn(...args);
        hooks[utils.getName(db.user)].beforeAddTask.push(handler);
        hooks[utils.getName(db.user)].beforeAddTasks.push(handler);
        hooks[utils.getName(db.project)].beforeAddUser.push(handler);
        hooks[utils.getName(db.project)].beforeAddUsers.push(handler);
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
      it('should send user within the options (add singular)', async () => {
        let userId;
        fn = (self, value, options) => { userId = options.user.id; };
        await user1.addTask(task1, { user: { id: 2 } });
        assert.equal(userId, 2);
      });

      it('should send user within the options (add plural)', async () => {
        let userId;
        fn = (self, value, options) => { userId = options.user.id; };
        await user2.addTasks([task1, task2], { user: { id: 2 } });
        assert.equal(userId, 2);
      });

      it('should send default user within the options if options.user is empty (add singular)', async () => {
        let userId;
        fn = (self, value, options) => { userId = options.user.id; };
        await user1.removeTask(task1);
        await user1.addTask(task1);
        assert.equal(userId, 1);
      });

      it('should send default user within the options if options.user is empty (add plural)', async () => {
        let userId;
        fn = (self, value, options) => { userId = options.user.id; };
        await user1.removeTasks([task1, task2]);
        await user2.addTasks([task1, task2]);
        assert.equal(userId, 1);
      });

      it('should have added objects correctly', async () => {
        const tasks = await user2.getTasks();
        assert.equal(tasks.length, 2);
        let t1 = false;
        let t2 = false;
        _.each(tasks, (t) => {
          if (t.id === task1.id) {
            t1 = true;
          }
          if (t.id === task2.id) {
            t2 = true;
          }
        });
        assert.equal(t1, true);
        assert.equal(t2, true);
      });
    });

    describe('-> N:M relationship:', () => {
      it('should send user within the options (add singular)', async () => {
        let userId;
        fn = (self, value, options) => { userId = options.user.id; };
        await project.addUser(user1, { user: { id: 2 } });
        assert.equal(userId, 2);
      });

      it('should send user within the options (add plural)', async () => {
        let userId;
        fn = (self, value, options) => { userId = options.user.id; };
        await project.removeUser(user1);
        await project.addUsers([user1, user2], { user: { id: 2 } });
        assert.equal(userId, 2);
      });

      it('should send default user within the options if options.user is empty (add singular)', async () => {
        let userId;
        fn = (self, value, options) => { userId = options.user.id; };
        await project.removeUsers([user1, user2]);
        await project.addUser(user1);
        assert.equal(userId, 1);
      });

      it('should send default user within the options if options.user is empty (add plural)', async () => {
        let userId;
        fn = (self, value, options) => { userId = options.user.id; };
        await project.removeUser(user1);
        await project.addUsers([user1, user2]);
        assert.equal(userId, 1);
      });

      it('should have added objects correctly', async () => {
        const users = await project.getUsers();
        assert.equal(users.length, 2);
        let u1 = false;
        let u2 = false;
        _.each(users, (u) => {
          if (u.id === user1.id) {
            u1 = true;
          }
          if (u.id === user2.id) {
            u2 = true;
          }
        });
        assert.equal(u1, true);
        assert.equal(u2, true);
      });
    });
  });
});
