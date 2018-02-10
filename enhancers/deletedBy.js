const _ = require('lodash');
const utils = require('../utils');

function enhance(model, hooks) {
  if (_.has(utils.getRawAttributes(model), 'deletedBy')) {
    hooks[utils.getName(model)].beforeDestroy.push((instance, options) => {
      instance.deletedBy = options.user.id;
    });
  }
}
module.exports = enhance;
