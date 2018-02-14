const _ = require('lodash');
const utils = require('../../utils');
const extendSequelize = require('../../');
const connection = require('../helpers/connection');
const dropAll = require('../helpers/dropAll');

describe('hooks', () => {
  let sequelize;
  let db;

  const reset = async () => {
    await dropAll(sequelize);
    db = {};
    db.user = sequelize.define('user', {
      username: sequelize.Sequelize.STRING(255),
    }, {
      paranoid: true,
    });
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

  describe('-> beforeDestroy:', () => {
    let fn;
    const username = 'TEST';
    const extension = {
      beforeUpdateTest: (db, hooks) => {
        setAllHooks(hooks, 'beforeDestroy', (...args) => fn(...args));
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
      await user.destroy({ user: { id: 2 } });
      assert.equal(userId, 2);
    });

    it('should send default user within the options if options.user is empty', async () => {
      let userId;
      fn = (self, options) => { userId = options.user.id; };
      const user = await db.user.create({ username });
      await user.destroy();
      assert.equal(userId, 1);
    });

    it('should NOT send user within the options when bulk destroying', async () => {
      let userId;
      fn = (self, options) => { userId = options.user.id; };
      await db.user.create({ username });
      await db.user.destroy({
        where: { id: { ne: null } },
        user: { id: 2 },
      });
      assert.equal(userId, undefined);
    });
  });
});
