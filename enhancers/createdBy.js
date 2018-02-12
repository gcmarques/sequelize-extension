const _ = require('lodash');
const utils = require('../utils');

function enhance(db, hooks) {
  _.each(db, (model) => {
    if (utils.isModel(model) && _.has(utils.getRawAttributes(model), 'createdBy')) {
      hooks[utils.getName(model)].beforeCreate.push((instance, options) => {
        instance.createdBy = options.user.id;
      });
    }
  });
}
module.exports = enhance;
