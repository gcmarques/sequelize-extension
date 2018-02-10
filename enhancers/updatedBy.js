const _ = require('lodash');
const utils = require('../utils');

function enhance(model, hooks) {
  if (_.has(utils.getRawAttributes(model), 'updatedBy')) {
    hooks[utils.getName(model)].beforeUpdate.push((instance, options) => {
      instance.updatedBy = options.user.id;
    });
  }
}
module.exports = enhance;
