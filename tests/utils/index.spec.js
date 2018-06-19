const Sequelize = require('sequelize');
const connection = require('../helpers/connection');
const dropAll = require('../helpers/dropAll');
const utils = require('../../utils');

describe('utils', () => {
  let sequelize;
  let db;

  const reset = async () => {
    await dropAll(sequelize);
    db = {};
    db.user = sequelize.define('user', {
      username: {
        allowNull: false,
        type: Sequelize.STRING(255),
      },
      password: {
        type: Sequelize.STRING(255),
        hidden: true,
      },
      count: {
        type: Sequelize.VIRTUAL(Sequelize.INTEGER),
        get() {
          return 0;
        },
      },
      role: Sequelize.ENUM('VISITOR', 'USER'),
    }, {
      history: true,
    });
    db.task = sequelize.define('task', {
      title: Sequelize.STRING(255),
    });
    db.project = sequelize.define('project', {
      project: Sequelize.STRING(255),
    });
    db.task.belongsTo(db.user);
    db.user.hasMany(db.task);
    db.user.belongsToMany(db.project, { through: 'userProjects' });
    db.project.belongsToMany(db.user, { through: 'userProjects' });
    await sequelize.sync();
  };

  before(async () => {
    sequelize = connection();
    await reset();
  });

  after(async () => {
    sequelize.close();
  });

  describe('-> getSequelize()', () => {
    it('it should return the sequelize instance', async () => {
      expect(utils.getSequelize(db.user)).to.be.an.instanceOf(Sequelize);
    });
  });

  describe('-> getBulkedInstances()', () => {
    it('should return all instances bulked to update or destroy', async () => {
      const users = await db.user.bulkCreate([
        { username: 'test1@test.com' },
        { username: 'test2@test.com' },
      ]);
      const options = {
        where: {
          username: ['test1@test.com', 'test2@test.com'],
        },
      };
      const result = await utils.getBulkedInstances(db.user, options);
      expect(result[0].id).to.be.equal(users[0].id);
      expect(result[0].username).to.be.equal('test1@test.com');
      expect(result[1].id).to.be.equal(users[1].id);
      expect(result[1].username).to.be.equal('test2@test.com');
      expect(options.__gsm.__instances).to.be.equal(result);
    });
  });

  describe('-> setTriggerParams(options, scope, params)', () => {
    it('should return the trigger params', async () => {
      const options = {};
      utils.setTriggerParams(options, 'test', { data: 1 });
      expect(utils.getTriggerParams(options, 'test').data).to.be.equal(1);
    });
  });

  describe('-> getTriggerType(options)', () => {
    it('should return the trigger type', async () => {
      const options = { __gsm: { hook: 'test' } };
      expect(utils.getTriggerType(options)).to.be.equal('test');
    });
  });

  describe('-> getUser(options)', () => {
    it('should return the default user', async () => {
      const options = {};
      expect(utils.getUser(options).id).to.be.equal(1);
    });

    it('should return the user', async () => {
      const options = { user: { id: 2 } };
      expect(utils.getUser(options).id).to.be.equal(2);
    });
  });

  describe('-> getAssociations(model)', () => {
    it('should return the associations', async () => {
      expect(utils.getAssociations(db.user).tasks.target).to.be.equal(db.task);
    });
  });

  describe('-> getRawAttributes(model)', () => {
    it('should return the raw attributes', async () => {
      expect(utils.getRawAttributes(db.user).username.type).to.be.an.instanceOf(Sequelize.STRING);
    });
  });

  describe('-> getHiddenAttributes(model)', () => {
    it('should return the hidden raw attributes', async () => {
      expect(utils.getHiddenAttributes(db.user).password).to.be.equal('password');
    });
  });

  describe('-> getAttributeType(attribute)', () => {
    it('should return id', async () => {
      const attribute = utils.getRawAttributes(db.user).id;
      expect(utils.getAttributeType(attribute)).to.be.equal('Id');
    });

    it('should return string', async () => {
      const attribute = utils.getRawAttributes(db.user).username;
      expect(utils.getAttributeType(attribute)).to.be.equal('String');
    });

    it('should return the virtual type', async () => {
      const attribute = utils.getRawAttributes(db.user).count;
      expect(utils.getAttributeType(attribute)).to.be.equal('Integer');
    });

    it('should throw', async () => {
      const attribute = {};
      expect(() => utils.getAttributeType(attribute)).to.throw(Error);
    });
  });

  describe('-> isVirtualModel(model)', () => {
    it('should return false', async () => {
      expect(utils.isVirtualModel(db.user)).to.be.false;
    });

    it('should return true', async () => {
      expect(utils.isVirtualModel({ virtual: true })).to.be.true;
    });
  });

  describe('-> isNewRecord(model)', () => {
    it('should return false', async () => {
      const username = 'test3@test.com';
      await db.user.create({ username });
      const user = await db.user.find({ where: { username } });
      expect(utils.isNewRecord(user)).to.be.false;
    });

    it('should return true', async () => {
      expect(utils.isNewRecord(db.user.build({}))).to.be.true;
    });

    it('should return true', async () => {
      const username = 'test4@test.com';
      const user = await db.user.create({ username });
      expect(utils.isNewRecord(user)).to.be.true;
    });
  });

  describe('-> getAttributeValues(attribute)', () => {
    it('should return the attribute values', async () => {
      const attribute = utils.getRawAttributes(db.user).role;
      expect(utils.getAttributeValues(attribute)).to.be.deep.equal(['VISITOR', 'USER']);
    });
  });

  describe('-> isNullableAttribute(attribute)', () => {
    it('should return false', async () => {
      const attribute = utils.getRawAttributes(db.user).username;
      expect(utils.isNullableAttribute(attribute)).to.be.false;
    });

    it('should return true', async () => {
      const attribute = utils.getRawAttributes(db.user).password;
      console.log(attribute);
      expect(utils.isNullableAttribute(attribute)).to.be.true;
    });
  });

  describe('-> isInstance(instance)', () => {
    it('should return false', async () => {
      expect(utils.isInstance({})).to.be.false;
    });

    it('should return true', async () => {
      expect(utils.isInstance(db.user.build({}))).to.be.true;
    });
  });

  describe('-> isModel(model)', () => {
    it('should return false', async () => {
      expect(utils.isModel({})).to.be.false;
    });

    it('should return true', async () => {
      expect(utils.isModel(db.user)).to.be.true;
    });
  });

  describe('-> getName(model)', () => {
    it('should return the model name', async () => {
      expect(utils.getName(db.user)).to.be.equal('user');
    });
  });

  describe('-> getOptions(model)', () => {
    it('should return the model options', async () => {
      expect(utils.getOptions(db.user).history).to.be.true;
    });
  });

  describe('-> isListAssociation(model)', () => {
    it('should return false', async () => {
      const association = utils.getAssociations(db.task).user;
      expect(utils.isListAssociation(association)).to.be.false;
    });

    it('should return true', async () => {
      const association = utils.getAssociations(db.user).tasks;
      expect(utils.isListAssociation(association)).to.be.true;
    });
  });

  describe('-> isBelongsToAssociation(model)', () => {
    it('should return false', async () => {
      const association = utils.getAssociations(db.user).tasks;
      expect(utils.isBelongsToAssociation(association)).to.be.false;
    });

    it('should return true', async () => {
      const association = utils.getAssociations(db.task).user;
      expect(utils.isBelongsToAssociation(association)).to.be.true;
    });
  });

  describe('-> hasThroughAssociation(model)', () => {
    it('should return false', async () => {
      const association = utils.getAssociations(db.user).tasks;
      expect(utils.hasThroughAssociation(association)).to.be.false;
    });

    it('should return true (1)', async () => {
      const association = utils.getAssociations(db.user).projects;
      expect(utils.hasThroughAssociation(association)).to.be.true;
    });

    it('should return true (2)', async () => {
      const association = utils.getAssociations(db.project).users;
      expect(utils.hasThroughAssociation(association)).to.be.true;
    });
  });

  describe('-> getAssociationType(association)', () => {
    it('should return the association type (1)', async () => {
      const association = utils.getAssociations(db.task).user;
      expect(utils.getAssociationType(association)).to.be.equal('BelongsTo');
    });

    it('should return the association type (2)', async () => {
      const association = utils.getAssociations(db.user).tasks;
      expect(utils.getAssociationType(association)).to.be.equal('HasMany');
    });

    it('should return the association type (3)', async () => {
      const association = utils.getAssociations(db.user).projects;
      expect(utils.getAssociationType(association)).to.be.equal('BelongsToMany');
    });
  });

  describe('-> getAssociationSource(association)', () => {
    it('should return the association source (1)', async () => {
      const association = utils.getAssociations(db.task).user;
      expect(utils.getAssociationSource(association)).to.be.equal(db.task);
    });

    it('should return the association source (2)', async () => {
      const association = utils.getAssociations(db.user).tasks;
      expect(utils.getAssociationSource(association)).to.be.equal(db.user);
    });

    it('should return the association source (3)', async () => {
      const association = utils.getAssociations(db.user).projects;
      expect(utils.getAssociationSource(association)).to.be.equal(db.user);
    });
  });

  describe('-> getAssociationTarget(association)', () => {
    it('should return the association target (1)', async () => {
      const association = utils.getAssociations(db.task).user;
      expect(utils.getAssociationTarget(association)).to.be.equal(db.user);
    });

    it('should return the association target (2)', async () => {
      const association = utils.getAssociations(db.user).tasks;
      expect(utils.getAssociationTarget(association)).to.be.equal(db.task);
    });

    it('should return the association target (3)', async () => {
      const association = utils.getAssociations(db.user).projects;
      expect(utils.getAssociationTarget(association)).to.be.equal(db.project);
    });
  });
});
