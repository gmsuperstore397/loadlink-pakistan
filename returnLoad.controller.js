const prisma = require('./prisma');
const asyncHandler = require('./asyncHandler');
const { success } = require('./apiResponse');
const { distanceKm } = require('./geo');

// GET /api/return-loads  - loads posted near a transporter's current/return route,
// so they can avoid driving back empty.
const listReturnLoads = asyncHandler(async (req, res) => {
  const { currentLat, currentLng, returnDestination, vehicleType, maxWeight, radiusKm } = req.query;

  const where = {
    status: { in: ['POSTED', 'SEARCHING'] },
    ...(returnDestination && { destinationAddress: { contains: returnDestination, mode: 'insensitive' } }),
    ...(vehicleType && { preferredVehicle: vehicleType }),
    ...(maxWeight && { weightKg: { lte: Number(maxWeight) } }),
  };

  let loads = await prisma.load.findMany({
    where,
    include: { customer: { select: { fullName: true, city: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  if (currentLat && currentLng) {
    loads = loads.map((l) => ({
      ...l,
      distanceFromCurrentKm: distanceKm(Number(currentLat), Number(currentLng), l.pickupLatitude, l.pickupLongitude),
    }));
    const radius = radiusKm ? Number(radiusKm) : null;
    if (radius) loads = loads.filter((l) => l.distanceFromCurrentKm === null || l.distanceFromCurrentKm <= radius);
    loads.sort((a, b) => (a.distanceFromCurrentKm ?? Infinity) - (b.distanceFromCurrentKm ?? Infinity));
  }

  return success(res, 200, 'Return loads fetched', { loads });
});

module.exports = { listReturnLoads };
