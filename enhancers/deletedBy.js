const _ = require('lodash');
const utils = require('../utils');

function enhance(db, hooks) {
  _.each(db, (model) => {
    if (utils.isModel(model) && _.has(utils.getRawAttributes(model), 'deletedBy')) {
      hooks[utils.getName(model)].beforeDestroy.push((instance, options) => {
        options.fields.push('deletedBy');
        instance.deletedBy = options.user.id;
      });
    }
  });
}
module.exports = enhance;
