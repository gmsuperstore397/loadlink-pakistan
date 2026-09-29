const prisma = require('./prisma');
const asyncHandler = require('./asyncHandler');
const { success } = require('./apiResponse');
const ApiError = require('./ApiError');
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


const smartReturnLoads = asyncHandler(async (req, res) => {
  const { currentLat, currentLng, returnDestination, vehicleType, maxWeight, radiusKm } = req.query;
  const destination = String(returnDestination || '').trim().toLowerCase();
  if (!destination && !(currentLat && currentLng)) {
    return success(res, 200, 'Smart return loads fetched', { loads: [] });
  }

  let loads = await prisma.load.findMany({
    where: {
      status: { in: ['POSTED', 'SEARCHING'] },
      ...(maxWeight && { weightKg: { lte: Number(maxWeight) } }),
    },
    include: { customer: { select: { fullName: true, city: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const radius = radiusKm ? Number(radiusKm) : 250;
  const lat = currentLat ? Number(currentLat) : null;
  const lng = currentLng ? Number(currentLng) : null;

  const scored = loads.map((load) => {
    const distance = lat !== null && lng !== null
      ? distanceKm(lat, lng, load.pickupLatitude, load.pickupLongitude)
      : null;
    let score = 0;
    const reasons = [];

    if (distance !== null) {
      const proximity = Math.max(0, 35 - Math.min(35, Math.round(distance / 5)));
      score += proximity;
      if (distance <= 25) reasons.push('Pickup near current route');
      else if (distance <= radius) reasons.push('Pickup within search radius');
    }

    const destinationText = String(load.destinationAddress || '').toLowerCase();
    if (destination && destinationText.includes(destination)) {
      score += 45;
      reasons.push('Return destination match');
    } else if (destination) {
      const words = destination.split(/[,\s]+/).filter((w) => w.length >= 3);
      const hits = words.filter((word) => destinationText.includes(word)).length;
      if (hits) {
        score += Math.min(30, hits * 10);
        reasons.push('Destination partially matches');
      }
    }

    if (vehicleType && (!load.preferredVehicle || load.preferredVehicle === vehicleType)) {
      score += 15;
      reasons.push('Vehicle requirement compatible');
    }

    if (maxWeight && Number(load.weightKg) <= Number(maxWeight)) {
      score += 5;
      reasons.push('Weight within capacity');
    }

    const ageHours = Math.max(0, (Date.now() - new Date(load.createdAt).getTime()) / 3600000);
    if (ageHours <= 24) {
      score += 5;
      reasons.push('Recently posted');
    }

    return {
      ...load,
      distanceFromCurrentKm: distance,
      smartMatchScore: Math.min(100, Math.round(score)),
      smartMatchReasons: reasons.length ? reasons : ['Potential return-route match'],
    };
  }).filter((load) => {
    if (load.distanceFromCurrentKm === null || !radius) return true;
    return load.distanceFromCurrentKm <= radius;
  }).sort((a, b) =>
    b.smartMatchScore - a.smartMatchScore ||
    (a.distanceFromCurrentKm ?? Infinity) - (b.distanceFromCurrentKm ?? Infinity)
  );

  return success(res, 200, 'Smart return loads fetched', { loads: scored.slice(0, 20) });
});


const smartReturnLoadsForTrip = asyncHandler(async (req, res) => {
  const trip = await prisma.trip.findUnique({
    where: { id: req.params.tripId },
    include: { load: true, vehicle: true },
  });
  if (!trip) throw new ApiError(404, 'Trip not found');
  if (!req.user.driverProfile || trip.driverId !== req.user.driverProfile.id) {
    throw new ApiError(403, 'Only the assigned driver can view return-load suggestions');
  }

  if (!['IN_TRANSIT', 'NEAR_DESTINATION'].includes(trip.status)) {
    return success(res, 200, 'Return-load suggestions fetched', { loads: [] });
  }

  const currentLat = trip.currentLatitude ?? trip.load.destinationLatitude;
  const currentLng = trip.currentLongitude ?? trip.load.destinationLongitude;
  if (currentLat == null || currentLng == null) {
    return success(res, 200, 'Return-load suggestions fetched', { loads: [] });
  }

  const loads = await prisma.load.findMany({
    where: { status: { in: ['POSTED', 'SEARCHING'] }, id: { not: trip.loadId } },
    include: { customer: { select: { fullName: true, city: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const scored = loads.map((load) => {
    const distance = distanceKm(Number(currentLat), Number(currentLng), load.pickupLatitude, load.pickupLongitude);
    if (distance === null || distance > 100) return null;

    let score = Math.max(0, 55 - Math.min(55, Math.round(distance / 5)));
    const reasons = [];
    if (distance <= 15) reasons.push('Pickup very close to delivery point');
    else if (distance <= 50) reasons.push('Pickup is nearby');

    if (load.preferredVehicle && trip.vehicle?.vehicleType === load.preferredVehicle) {
      score += 20;
      reasons.push('Same vehicle type requested');
    }
    if (trip.vehicle?.capacityKg && Number(load.weightKg) <= Number(trip.vehicle.capacityKg)) {
      score += 15;
      reasons.push('Load fits vehicle capacity');
    }

    const ageHours = Math.max(0, (Date.now() - new Date(load.createdAt).getTime()) / 3600000);
    if (ageHours <= 24) {
      score += 5;
      reasons.push('Recently posted');
    }

    return {
      ...load,
      distanceFromDeliveryKm: distance,
      returnMatchScore: Math.min(100, Math.round(score)),
      returnMatchReasons: reasons.length ? reasons : ['Potential return-load match'],
    };
  }).filter(Boolean)
    .sort((a, b) => b.returnMatchScore - a.returnMatchScore || a.distanceFromDeliveryKm - b.distanceFromDeliveryKm);

  return success(res, 200, 'Return-load suggestions fetched', { loads: scored.slice(0, 5), tripStatus: trip.status });
});


const smartReturnRouteForTrip = asyncHandler(async (req, res) => {
  const trip = await prisma.trip.findUnique({
    where: { id: req.params.tripId },
    include: { load: true, vehicle: true },
  });
  if (!trip) throw new ApiError(404, 'Trip not found');
  if (!req.user.driverProfile || trip.driverId !== req.user.driverProfile.id) {
    throw new ApiError(403, 'Only the assigned driver can view route suggestions');
  }
  if (!['IN_TRANSIT', 'NEAR_DESTINATION'].includes(trip.status)) {
    return success(res, 200, 'Return route suggestions fetched', { routes: [] });
  }

  const startLat = trip.currentLatitude ?? trip.load.destinationLatitude;
  const startLng = trip.currentLongitude ?? trip.load.destinationLongitude;
  const finalLat = trip.load.destinationLatitude;
  const finalLng = trip.load.destinationLongitude;
  if (startLat == null || startLng == null || finalLat == null || finalLng == null) {
    return success(res, 200, 'Return route suggestions fetched', { routes: [] });
  }

  const loads = await prisma.load.findMany({
    where: { status: { in: ['POSTED', 'SEARCHING'] }, id: { not: trip.loadId } },
    include: { customer: { select: { fullName: true, city: true } } },
    orderBy: { createdAt: 'desc' },
    take: 250,
  });

  const vehicleCapacity = trip.vehicle?.capacityKg ? Number(trip.vehicle.capacityKg) : null;
  const vehicleType = trip.vehicle?.vehicleType || null;
  const candidates = loads.map((load) => {
    if (load.pickupLatitude == null || load.pickupLongitude == null || load.destinationLatitude == null || load.destinationLongitude == null) return null;
    if (vehicleCapacity && Number(load.weightKg) > vehicleCapacity) return null;
    if (load.preferredVehicle && vehicleType && load.preferredVehicle !== vehicleType) return null;
    return load;
  }).filter(Boolean);

  const distance = (aLat, aLng, bLat, bLng) => distanceKm(Number(aLat), Number(aLng), Number(bLat), Number(bLng));
  const progressScore = (lat, lng) => {
    const direct = distance(startLat, startLng, finalLat, finalLng);
    const remaining = distance(lat, lng, finalLat, finalLng);
    if (!direct || remaining == null) return 0;
    return Math.max(0, Math.min(100, Math.round((1 - (remaining / direct)) * 100)));
  };

  const scoreLeg = (from, load) => {
    const pickupKm = distance(from.lat, from.lng, load.pickupLatitude, load.pickupLongitude);
    const afterPickupToDropKm = distance(load.pickupLatitude, load.pickupLongitude, load.destinationLatitude, load.destinationLongitude);
    const dropToFinalKm = distance(load.destinationLatitude, load.destinationLongitude, finalLat, finalLng);
    if (pickupKm == null || afterPickupToDropKm == null || dropToFinalKm == null) return null;

    const directRemaining = distance(from.lat, from.lng, finalLat, finalLng) || 1;
    const detourKm = Math.max(0, pickupKm + afterPickupToDropKm + dropToFinalKm - directRemaining);
    let score = 100;
    score -= Math.min(40, detourKm * 1.4);
    score -= Math.min(25, pickupKm * 0.7);
    score += Math.min(15, Math.max(0, progressScore(load.destinationLatitude, load.destinationLongitude) / 8));
    if (vehicleCapacity) score += 8;
    if (load.preferredVehicle && vehicleType === load.preferredVehicle) score += 8;
    const ageHours = Math.max(0, (Date.now() - new Date(load.createdAt).getTime()) / 3600000);
    if (ageHours <= 24) score += 5;
    return { pickupKm, detourKm, dropToFinalKm, score: Math.max(0, Math.min(100, Math.round(score))) };
  };

  const ranked = [];
  const maxFirst = candidates.map((load) => {
    const leg = scoreLeg({ lat: startLat, lng: startLng }, load);
    return leg ? { load, leg } : null;
  }).filter(Boolean).sort((a, b) => b.leg.score - a.leg.score).slice(0, 8);

  for (const first of maxFirst) {
    const firstPoint = { lat: first.load.destinationLatitude, lng: first.load.destinationLongitude };
    ranked.push({
      loads: [first.load],
      legs: [first.leg],
      totalDetourKm: first.leg.detourKm,
      chainScore: first.leg.score,
    });

    const secondOptions = candidates.filter((load) => load.id !== first.load.id).map((load) => {
      const leg = scoreLeg(firstPoint, load);
      return leg ? { load, leg } : null;
    }).filter(Boolean).sort((a, b) => b.leg.score - a.leg.score).slice(0, 5);

    for (const second of secondOptions) {
      const finalFromSecond = distance(second.load.destinationLatitude, second.load.destinationLongitude, finalLat, finalLng) || 0;
      const totalDetour = first.leg.detourKm + second.leg.detourKm;
      const chainScore = Math.max(0, Math.min(100, Math.round(
        (first.leg.score * 0.45) + (second.leg.score * 0.35) + Math.max(0, 20 - Math.min(20, finalFromSecond))
      )));
      ranked.push({
        loads: [first.load, second.load],
        legs: [first.leg, second.leg],
        totalDetourKm: totalDetour,
        chainScore,
      });
    }
  }

  const unique = new Map();
  ranked.sort((a, b) => b.chainScore - a.chainScore || a.totalDetourKm - b.totalDetourKm);
  for (const route of ranked) {
    const key = route.loads.map((l) => l.id).join('>');
    if (!unique.has(key)) unique.set(key, route);
  }

  const routes = Array.from(unique.values()).slice(0, 5).map((route) => ({
    chainScore: route.chainScore,
    totalDetourKm: Math.round(route.totalDetourKm * 10) / 10,
    totalCargoKg: route.loads.reduce((sum, load) => sum + Math.max(0, Number(load.weightKg) || 0), 0),
    loads: route.loads.map((load, index) => ({
      id: load.id,
      pickupAddress: load.pickupAddress,
      destinationAddress: load.destinationAddress,
      weightKg: load.weightKg,
      preferredVehicle: load.preferredVehicle,
      createdAt: load.createdAt,
      legPickupKm: Math.round(route.legs[index].pickupKm * 10) / 10,
      legDetourKm: Math.round(route.legs[index].detourKm * 10) / 10,
    })),
  }));

  return success(res, 200, 'Return route suggestions fetched', {
    tripId: trip.id,
    tripStatus: trip.status,
    finalDestination: trip.load.destinationAddress,
    routes,
  });
});

module.exports = { listReturnLoads, smartReturnLoads, smartReturnLoadsForTrip, smartReturnRouteForTrip };
