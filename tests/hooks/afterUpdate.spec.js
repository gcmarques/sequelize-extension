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
    db.task.belongsTo(db.user);
    db.user.hasMany(db.task);
    await sequelize.sync();
  };

  const setAllHooks = (hooks, hookName, handler) => {
    _.each(db, (model) => {
      if (utils.isModel(model)) {
        hooks[utils.getName(model)][hookName].push(handler);
      }
    });
  };

  before(async () => {
    sequelize = connection();
  });

  after(async () => {
    sequelize.close();
  });

  describe('-> afterUpdate:', () => {
    let fn;
    const title = TEST;
    const username = TEST;
    const extension = {
      afterUpdateTest: (db, hooks) => {
        setAllHooks(hooks, 'afterUpdate', (...args) => fn(...args));
      },
    };

    before(async () => {
      await reset();
      extendSequelize(db, extension);
    });

    it('should send user within the options', async () => {
      let userId;
      fn = (self, options) => { userId = options.user.id; };
      const user = await db.user.create({ username });
      user.username += '-changed';
      await user.save({ user: { id: 2 } });
      assert.equal(userId, 2);
    });

    it('should send default user within the options if options.user is empty', async () => {
      let userId;
      fn = (self, options) => { userId = options.user.id; };
      const user = await db.user.create({ username });
      user.username += '-changed';
      await user.save();
      assert.equal(userId, 1);
    });

    it('should NOT call handler after creating instances', async () => {
      const counter = { user: 0 };
      fn = (self) => { counter[utils.getName(self.constructor)] += 1; };
      await db.user.create({ username });
      assert.equal(counter.user, 0);
    });

    it('should call handler after updating instances', async () => {
      const counter = { user: 0 };
      fn = (self) => { counter[utils.getName(self.constructor)] += 1; };
      const user = await db.user.create({ username });
      assert.equal(counter.user, 0);
      user.username += '-changed';
      await user.save();
      assert.equal(counter.user, 1);
    });

    it('should call handler after target association setters (1:M)', async () => {
      const counter = { user: 0, task: 0 };
      fn = (self) => { counter[utils.getName(self.constructor)] += 1; };
      const user1 = await db.user.create({ username });
      assert.equal(counter.user, 0);
      const user2 = await db.user.create({ username });
      assert.equal(counter.user, 0);
      const task = await db.task.create({ title, userId: user1.id });
      assert.equal(counter.task, 0);
      await user2.setTasks([task]);
      assert.equal(counter.task, 1);
    });

    it('should call handler after source association setters (1:M)', async () => {
      const counter = { user: 0, task: 0 };
      fn = (self) => { counter[utils.getName(self.constructor)] += 1; };
      const user1 = await db.user.create({ username });
      assert.equal(counter.user, 0);
      const user2 = await db.user.create({ username });
      assert.equal(counter.user, 0);
      const task = await db.task.create({ title, userId: user1.id });
      assert.equal(counter.task, 0);
      await task.setUser(user2);
      assert.equal(counter.task, 1);
    });
  });
});
