const asyncHandler = require('./asyncHandler');
const { success } = require('./apiResponse');
const { getRecommendation, getSmartLoadMatches } = require('./recommendation.service');

// POST /api/recommendations/vehicle
const recommendVehicleHandler = asyncHandler(async (req, res) => {
  const { weightKg, preferredVehicle, pickupLatitude, pickupLongitude } = req.body;
  const result = await getRecommendation({ weightKg, preferredVehicle, pickupLatitude, pickupLongitude });
  return success(res, 200, 'Recommendation generated', result);
});

const smartLoadMatchesHandler = asyncHandler(async (req, res) => {
  const result = await getSmartLoadMatches(req.params.loadId);
  return success(res, 200, 'Smart driver matches generated', result);
});

module.exports = { recommendVehicleHandler, smartLoadMatchesHandler };

