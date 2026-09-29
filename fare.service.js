const { distanceKm } = require('./geo');
const { baseFare, perKmRate } = require('./env');

// Vehicle-type fare multipliers relative to the base per-km rate. Configurable rates;
// this is an estimate only, never presented as a guaranteed final price.
const VEHICLE_MULTIPLIER = {
  'Loader Rickshaw': 0.6,
  'Suzuki Loader': 0.8,
  Pickup: 0.8,
  Mazda: 1.0,
  Shazore: 1.2,
  'Mini Truck': 1.4,
  'Mini Van': 1.0,
  '10 Wheeler': 2.0,
  '12 Wheeler': 2.3,
  '14 Wheeler': 2.6,
  '16 Wheeler': 2.9,
  '18 Wheeler': 3.2,
  '22 Wheeler': 3.6,
  Trailer: 4.5,
  Container: 4.5,
};

function estimateFare({ pickupLat, pickupLng, destinationLat, destinationLng, vehicleType, weightKg }) {
  const distance = distanceKm(pickupLat, pickupLng, destinationLat, destinationLng);
  if (distance === null) return { distanceKm: null, estimatedFare: null, minFare: null, maxFare: null, vehicleType: vehicleType || null };

  const multiplier = VEHICLE_MULTIPLIER[vehicleType] || 1.0;
  const weightFactor = weightKg ? Math.max(1, Number(weightKg) / 2000) : 1;
  const estimatedFare = Math.round(baseFare + distance * perKmRate * multiplier * Math.min(weightFactor, 3));

  // Give customers a practical negotiation range instead of presenting one number as fixed.
  const minFare = Math.round(estimatedFare * 0.90);
  const maxFare = Math.round(estimatedFare * 1.10);
  return {
    distanceKm: Math.round(distance * 10) / 10,
    estimatedFare,
    minFare,
    maxFare,
    vehicleType: vehicleType || null,
    disclaimer: 'Estimated fare only. Final fare may vary by route, demand, vehicle availability and agreement with the driver.',
  };
}

module.exports = { estimateFare };
