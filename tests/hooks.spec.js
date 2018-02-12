const _ = require('lodash');
const utils = require('../utils');
const extendSequelize = require('../');
const connection = require('./helpers/connection');
const dropAll = require('./helpers/dropAll');

describe('hooks', () => {
  let sequelize;
  let db;
  let sandbox;

  const reset = async () => {
    await dropAll(sequelize);
    db = {};
    db.user = sequelize.define('user', {
      username: sequelize.Sequelize.STRING(255),
    });
    db.project = sequelize.define('project', {
      name: sequelize.Sequelize.STRING(255),
    });
    db.task = sequelize.define('task', {
      title: sequelize.Sequelize.STRING(255),
    });
    db.task.belongsTo(db.project);
    db.user.belongsToMany(db.project, { through: 'userProjects' });
    db.project.belongsToMany(db.user, { through: 'userProjects' });
    db.project.hasMany(db.task);
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

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
  });

  afterEach(async () => {
    sandbox.restore();
  });

  after(async () => {
    sequelize.close();
  });

  describe('~beforeUpdate', () => {
    let fn;
    const extension = {
      beforeUpdateTest: (db, hooks) => {
        setAllHooks(hooks, 'beforeUpdate', (...args) => fn(...args));
      },
    };

    before(async () => {
      await reset();
      extendSequelize(db, extension);
    });

    it('should call handler before creating instances', async () => {
      const counter = {
        user: 0,
        project: 0,
        task: 0,
      };
      fn = (self) => { counter[utils.getName(self.constructor)] += 1; };
      await db.user.create({ username: 'test@test.com' });
      assert.equal(counter.user, 1);
    });
  });
});
