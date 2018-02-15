const extendSequelize = require('../../');
const connection = require('../helpers/connection');
const dropAll = require('../helpers/dropAll');
const GraphQLToolsSequelize = require('graphql-tools-sequelize');

describe('enhancers', () => {
  let sequelize;
  let db;

  const reset = async () => {
    await dropAll(sequelize);
    db = {};
    db.user = sequelize.define('user', {
      username: sequelize.Sequelize.STRING(255),
    });
    await sequelize.sync();
  };

  after(async () => {
    sequelize.close();
  });

  describe('-> graphql:', () => {
    it('should return the schema correcly', async () => {
      sequelize = connection();
      await reset();
      const gts = new GraphQLToolsSequelize(sequelize, { idtype: 'ID' });
      await gts.boot();
      extendSequelize(db, {
        graphql: { gts },
      });
      db.getGraphQLExecutableSchema();
    });
  });
});
