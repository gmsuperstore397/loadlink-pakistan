const asyncHandler = require('./asyncHandler');
const { success } = require('./apiResponse');
const { getRecommendation, getSmartLoadMatches } = require('./recommendation.service');
const prisma = require('./prisma');
const ApiError = require('./ApiError');

// POST /api/recommendations/vehicle
const recommendVehicleHandler = asyncHandler(async (req, res) => {
  const { weightKg, preferredVehicle, pickupLatitude, pickupLongitude } = req.body;
  const result = await getRecommendation({ weightKg, preferredVehicle, pickupLatitude, pickupLongitude });
  return success(res, 200, 'Recommendation generated', result);
});

const smartLoadMatchesHandler = asyncHandler(async (req, res) => {
  const load = await prisma.load.findUnique({ where: { id: req.params.loadId }, select: { id: true, customerId: true } });
  if (!load) throw new ApiError(404, 'Load not found');
  if (load.customerId !== req.user.id && !['ADMIN', 'MANAGER'].includes(req.user.role)) throw new ApiError(403, 'Not allowed');
  const result = await getSmartLoadMatches(req.params.loadId);
  return success(res, 200, 'Smart driver matches generated', result);
});

module.exports = { recommendVehicleHandler, smartLoadMatchesHandler };

