const _ = require('lodash');
const utils = require('../utils');

function enhance(model, hooks) {
  if (_.has(utils.getRawAttributes(model), 'createdBy')) {
    hooks[utils.getName(model)].beforeCreate.push((instance, options) => {
      instance.createdBy = options.user.id;
    });
  }
}
module.exports = enhance;
