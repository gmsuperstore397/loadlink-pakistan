// Vehicle capacity table and recommendation logic, matching the platform's
// published weight bands for Pakistan freight vehicle categories.

const VEHICLE_CAPACITY_TABLE = [
  { vehicleType: 'Loader Rickshaw', minKg: 0, maxKg: 500, capacityKg: 500 },
  { vehicleType: 'Suzuki Loader', minKg: 501, maxKg: 1000, capacityKg: 1000 },
  { vehicleType: 'Pickup', minKg: 501, maxKg: 1000, capacityKg: 1000 },
  { vehicleType: 'Mazda', minKg: 1001, maxKg: 2000, capacityKg: 2000 },
  { vehicleType: 'Shazore', minKg: 2001, maxKg: 3000, capacityKg: 3000 },
  { vehicleType: 'Mini Truck', minKg: 3001, maxKg: 5000, capacityKg: 5000 },
  { vehicleType: '10 Wheeler', minKg: 5001, maxKg: 10000, capacityKg: 10000 },
  { vehicleType: '12 Wheeler', minKg: 10001, maxKg: 12000, capacityKg: 12000 },
  { vehicleType: '14 Wheeler', minKg: 12001, maxKg: 14000, capacityKg: 14000 },
  { vehicleType: '16 Wheeler', minKg: 14001, maxKg: 16000, capacityKg: 16000 },
  { vehicleType: '18 Wheeler', minKg: 16001, maxKg: 18000, capacityKg: 18000 },
  { vehicleType: '22 Wheeler', minKg: 18001, maxKg: 22000, capacityKg: 22000 },
  { vehicleType: 'Trailer', minKg: 22001, maxKg: Infinity, capacityKg: 40000 },
  { vehicleType: 'Container', minKg: 22001, maxKg: Infinity, capacityKg: 40000 },
];

const ALL_VEHICLE_TYPES = [
  'Loader Rickshaw', 'Suzuki Loader', 'Mazda', 'Shazore', 'Mini Truck',
  'Pickup', 'Mini Van', '10 Wheeler', '12 Wheeler', '14 Wheeler',
  '16 Wheeler', '18 Wheeler', '22 Wheeler', 'Trailer', 'Container',
];

function recommendVehicle(weightKg) {
  const w = Number(weightKg);
  if (!w || w <= 0) return null;
  if (w > 22000) {
    return VEHICLE_CAPACITY_TABLE.filter((v) => v.minKg === 22001);
  }
  const match = VEHICLE_CAPACITY_TABLE.filter((v) => w >= v.minKg && w <= v.maxKg);
  return match.length ? match : null;
}

module.exports = { VEHICLE_CAPACITY_TABLE, ALL_VEHICLE_TYPES, recommendVehicle };
