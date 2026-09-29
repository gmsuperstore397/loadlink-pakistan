const prisma = require('./prisma');
const asyncHandler = require('./asyncHandler');
const { success } = require('./apiResponse');
const ApiError = require('./ApiError');
const { distanceKm } = require('./geo');


// GET /api/vehicles
const listVehicles = asyncHandler(async (req, res) => {
  const vehicles = await prisma.vehicle.findMany({
    include: { driver: { include: { user: { select: { id: true, fullName: true, city: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return success(res, 200, 'Vehicles fetched', { vehicles });
});

// GET /api/vehicles/mine  (owning driver only)
const listMyVehicles = asyncHandler(async (req, res) => {
  if (!req.user.driverProfile) throw new ApiError(403, 'Driver profile required');
  const vehicles = await prisma.vehicle.findMany({
    where: { driverId: req.user.driverProfile.id },
    orderBy: { createdAt: 'desc' },
  });
  return success(res, 200, 'My vehicles fetched', { vehicles });
});

// GET /api/vehicles/available
const listAvailableVehicles = asyncHandler(async (req, res) => {
  const { vehicleType, minCapacity, lat, lng, verifiedOnly } = req.query;

  const where = {
    status: 'AVAILABLE',
    ...(vehicleType && { vehicleType }),
    ...(minCapacity && { capacityKg: { gte: Number(minCapacity) } }),
    ...(verifiedOnly === 'true' && { isVerified: true }),
  };

  let vehicles = await prisma.vehicle.findMany({
    where,
    include: { driver: { include: { user: { select: { id: true, fullName: true, city: true } } } } },
    take: 100,
  });

  if (lat && lng) {
    vehicles = vehicles
      .map((v) => ({ ...v, distanceKm: distanceKm(Number(lat), Number(lng), v.latitude, v.longitude) }))
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }

  return success(res, 200, 'Available vehicles fetched', { vehicles });
});

// GET /api/vehicles/:id
const getVehicle = asyncHandler(async (req, res) => {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: req.params.id },
    include: { driver: { include: { user: { select: { id: true, fullName: true, city: true } } } } },
  });
  if (!vehicle) throw new ApiError(404, 'Vehicle not found');
  return success(res, 200, 'Vehicle fetched', { vehicle });
});

// POST /api/vehicles  (driver only)
const createVehicle = asyncHandler(async (req, res) => {
  if (!req.user.driverProfile) throw new ApiError(403, 'Driver profile required');

  const { vehicleType, vehicleNumber, capacityKg, brand, model, year } = req.body;

  const existing = await prisma.vehicle.findUnique({ where: { vehicleNumber } });
  if (existing) throw new ApiError(409, 'A vehicle with this number is already registered');

  const vehicle = await prisma.vehicle.create({
    data: {
      driverId: req.user.driverProfile.id,
      vehicleType,
      vehicleNumber,
      capacityKg: Number(capacityKg),
      brand: brand || null,
      model: model || null,
      year: year ? Number(year) : null,
      documentUrl: req.file ? `/api/documents/${req.file.filename}` : null,
      documentExpiryDate: req.body.documentExpiryDate ? new Date(req.body.documentExpiryDate) : null,
      status: 'OFFLINE',
      isVerified: false,
    },
  });

  return success(res, 201, 'Vehicle registered. Pending verification.', { vehicle });
});

// PATCH /api/vehicles/:id  (owning driver only)
const updateVehicle = asyncHandler(async (req, res) => {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: req.params.id } });
  if (!vehicle) throw new ApiError(404, 'Vehicle not found');
  if (!req.user.driverProfile || vehicle.driverId !== req.user.driverProfile.id) {
    throw new ApiError(403, 'Not your vehicle');
  }

  const { status, latitude, longitude, capacityKg, brand, model, year } = req.body;
  const updated = await prisma.vehicle.update({
    where: { id: vehicle.id },
    data: {
      ...(status && ['AVAILABLE', 'BUSY', 'OFFLINE'].includes(status) && { status }),
      ...(latitude !== undefined && { latitude: Number(latitude) }),
      ...(longitude !== undefined && { longitude: Number(longitude) }),
      ...(capacityKg && { capacityKg: Number(capacityKg) }),
      ...(brand !== undefined && { brand }),
      ...(model !== undefined && { model }),
      ...(year && { year: Number(year) }),
    },
  });

  return success(res, 200, 'Vehicle updated', { vehicle: updated });
});

module.exports = { listVehicles, listMyVehicles, listAvailableVehicles, getVehicle, createVehicle, updateVehicle };
