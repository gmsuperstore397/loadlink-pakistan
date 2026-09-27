const { success } = require('../utils/apiResponse');

const health = (req, res) => success(res, 200, 'LoadLink Pakistan API is running');

module.exports = { health };
