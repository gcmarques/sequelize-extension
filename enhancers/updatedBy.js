const _ = require('lodash');
const utils = require('../utils');

function enhance(db, hooks) {
  _.each(db, (model) => {
    if (utils.isModel(model) && _.has(utils.getRawAttributes(model), 'updatedBy')) {
      const name = utils.getName(model);

      hooks[name].beforeUpdate.push((instance, options) => {
        instance.updatedBy = options.user.id;
      });

      hooks[name].beforeBulkUpdate.push((options) => {
        options.fields.push('updatedBy');
        options.attributes.updatedBy = options.user.id;
      });
    }
  });
}
module.exports = enhance;
