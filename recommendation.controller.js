const asyncHandler = require('./asyncHandler');
const { success } = require('./apiResponse');
const { getRecommendation } = require('./recommendation.service');

// POST /api/recommendations/vehicle
const recommendVehicleHandler = asyncHandler(async (req, res) => {
  const { weightKg, preferredVehicle, pickupLatitude, pickupLongitude } = req.body;
  const result = await getRecommendation({ weightKg, preferredVehicle, pickupLatitude, pickupLongitude });
  return success(res, 200, 'Recommendation generated', result);
});

module.exports = { recommendVehicleHandler };
