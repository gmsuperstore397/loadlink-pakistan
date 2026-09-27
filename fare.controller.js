const asyncHandler = require('./asyncHandler');
const { success } = require('./apiResponse');
const ApiError = require('./ApiError');
const { estimateFare } = require('./fare.service');

// POST /api/fare/estimate
const estimateFareHandler = asyncHandler(async (req, res) => {
  const { pickupLat, pickupLng, destinationLat, destinationLng, vehicleType, weightKg } = req.body;
  if (!pickupLat || !pickupLng || !destinationLat || !destinationLng) {
    throw new ApiError(400, 'Pickup and destination coordinates are required');
  }
  const result = estimateFare({ pickupLat, pickupLng, destinationLat, destinationLng, vehicleType, weightKg });
  return success(res, 200, 'Fare estimated (not a guaranteed final price)', result);
});

module.exports = { estimateFareHandler };
