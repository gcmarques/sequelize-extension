const _ = require('lodash');
const utils = require('../utils');

function enhance(db, hooks) {
  _.each(db, (model) => {
    if (utils.isModel(model) && _.has(utils.getRawAttributes(model), 'updatedBy')) {
      hooks[utils.getName(model)].beforeUpdate.push((instance, options) => {
        options.fields.push('updatedBy');
        instance.updatedBy = options.user.id;
      });
    }
  });
}
module.exports = enhance;
