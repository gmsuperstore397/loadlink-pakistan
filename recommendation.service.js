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
        isVerified: true,
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
      where: { vehicleType: preferredVehicle, status: 'AVAILABLE', isVerified: true },
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

async function getSmartLoadMatches(loadId) {
  const load = await prisma.load.findUnique({ where: { id: loadId } });
  if (!load) { const err = new Error('Load not found'); err.statusCode = 404; throw err; }

  const vehicles = await prisma.vehicle.findMany({
    where: {
      status: 'AVAILABLE',
      isVerified: true,
      capacityKg: { gte: Math.ceil(load.weightKg) },
      driver: { verification: 'VERIFIED', user: { status: 'ACTIVE' } },
    },
    include: { driver: { include: { user: { select: { id: true, fullName: true, city: true, mobile: true } } } } },
    take: 200,
  });

  const matches = vehicles.map((vehicle) => {
    const distance = distanceKm(load.pickupLatitude, load.pickupLongitude, vehicle.latitude, vehicle.longitude);
    let score = 40;
    const reasons = ['Verified driver + vehicle'];
    if (vehicle.capacityKg >= load.weightKg) {
      score += Math.min(25, Math.round((vehicle.capacityKg / Math.max(load.weightKg, 1)) * 10));
      reasons.push('Capacity suitable');
    }
    if (load.preferredVehicle && vehicle.vehicleType === load.preferredVehicle) {
      score += 20; reasons.push('Preferred vehicle match');
    } else if (load.preferredVehicle) reasons.push('Different vehicle type');
    if (distance !== null) {
      score += Math.max(0, 15 - Math.min(15, Math.round(distance / 10)));
      reasons.push(distance <= 25 ? 'Near pickup' : distance + ' km from pickup');
    } else reasons.push('Location unavailable');
    if (vehicle.driver.user.city && load.pickupAddress.toLowerCase().includes(vehicle.driver.user.city.toLowerCase())) {
      score += 5; reasons.push('Same pickup city');
    }
    return {
      vehicleId: vehicle.id, driverId: vehicle.driver.id, driver: vehicle.driver.user,
      vehicle: { id: vehicle.id, vehicleType: vehicle.vehicleType, vehicleNumber: vehicle.vehicleNumber, capacityKg: vehicle.capacityKg, brand: vehicle.brand, model: vehicle.model },
      distanceKm: distance, matchScore: Math.min(100, score), reasons,
    };
  }).sort((a,b) => b.matchScore - a.matchScore || (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));

  return {
    load: { id: load.id, pickupAddress: load.pickupAddress, destinationAddress: load.destinationAddress, weightKg: load.weightKg, preferredVehicle: load.preferredVehicle },
    matches: matches.slice(0, 10),
  };
}

module.exports = { getRecommendation, getSmartLoadMatches };
