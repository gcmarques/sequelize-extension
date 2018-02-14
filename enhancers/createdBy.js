const _ = require('lodash');
const utils = require('../utils');

function enhance(db, hooks) {
  _.each(db, (model) => {
    if (utils.isModel(model) && _.has(utils.getRawAttributes(model), 'createdBy')) {
      const name = utils.getName(model);
      hooks[name].beforeCreate.push((instance, options) => {
        instance.createdBy = options.user.id;
      });
      hooks[name].beforeBulkCreate.push((instances, options) => {
        _.each(instances, (instance) => { instance.createdBy = options.user.id; });
      });
    }
  });
}
module.exports = enhance;
