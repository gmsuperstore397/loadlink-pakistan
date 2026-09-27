const prisma = require('./prisma');
const { recommendVehicle } = require('./vehicleRecommendation');
const { distanceKm } = require('./geo');

// Suggests suitable vehicle categories for a weight, and (if coordinates are given)
// looks up currently available, verified vehicles of those categories nearby.
async function getRecommendation({ weightKg, preferredVehicle, pickupLatitude, pickupLongitude }) {
  const bands = recommendVehicle(weightKg);
  const recommendedTypes = bands ? bands.map((b) => b.vehicleType) : [];

  let nearbyVehicles = [];
  if (recommendedTypes.length) {
    nearbyVehicles = await prisma.vehicle.findMany({
      where: {
        vehicleType: { in: recommendedTypes },
        status: 'AVAILABLE',
      },
      include: { driver: { include: { user: true } } },
      take: 20,
    });

    nearbyVehicles = nearbyVehicles
      .map((v) => ({
        ...v,
        distanceKm: distanceKm(pickupLatitude, pickupLongitude, v.latitude, v.longitude),
      }))
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }

  let preferredVehicles = [];
  if (preferredVehicle) {
    preferredVehicles = await prisma.vehicle.findMany({
      where: { vehicleType: preferredVehicle, status: 'AVAILABLE' },
      include: { driver: { include: { user: true } } },
      take: 20,
    });
  }

  return {
    recommendedVehicleTypes: recommendedTypes,
    nearbyVehicles,
    preferredVehicle: preferredVehicle || null,
    preferredVehicles,
  };
}

module.exports = { getRecommendation };
