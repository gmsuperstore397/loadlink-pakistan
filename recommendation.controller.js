const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');
const { getRecommendation } = require('../services/recommendation.service');

// POST /api/recommendations/vehicle
const recommendVehicleHandler = asyncHandler(async (req, res) => {
  const { weightKg, preferredVehicle, pickupLatitude, pickupLongitude } = req.body;
  const result = await getRecommendation({ weightKg, preferredVehicle, pickupLatitude, pickupLongitude });
  return success(res, 200, 'Recommendation generated', result);
});

module.exports = { recommendVehicleHandler };
