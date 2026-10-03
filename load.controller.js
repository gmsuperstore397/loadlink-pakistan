const prisma = require('./prisma');
const asyncHandler = require('./asyncHandler');
const { success, fail } = require('./apiResponse');
const ApiError = require('./ApiError');
const notify = require('./notification.service');

// POST /api/loads  (customer only)
const createLoad = asyncHandler(async (req, res) => {
  const {
    pickupAddress, pickupLatitude, pickupLongitude,
    destinationAddress, destinationLatitude, destinationLongitude,
    description, weightKg, preferredVehicle,
  } = req.body;

  const load = await prisma.load.create({
    data: {
      customerId: req.user.id,
      pickupAddress,
      pickupLatitude: pickupLatitude ? Number(pickupLatitude) : null,
      pickupLongitude: pickupLongitude ? Number(pickupLongitude) : null,
      destinationAddress,
      destinationLatitude: destinationLatitude ? Number(destinationLatitude) : null,
      destinationLongitude: destinationLongitude ? Number(destinationLongitude) : null,
      description,
      weightKg: Number(weightKg),
      preferredVehicle: preferredVehicle || null,
      status: 'POSTED',
    },
  });

  return success(res, 201, 'Load posted successfully', { load });
});

// GET /api/loads
const listLoads = asyncHandler(async (req, res) => {
  const { pickup, destination, vehicleType, status, minWeight, maxWeight } = req.query;

  const where = {
    ...(pickup && { pickupAddress: { contains: pickup, mode: 'insensitive' } }),
    ...(destination && { destinationAddress: { contains: destination, mode: 'insensitive' } }),
    ...(vehicleType && { preferredVehicle: vehicleType }),
    ...(status ? { status } : { status: { in: ['POSTED', 'SEARCHING'] } }),
    ...((minWeight || maxWeight) && {
      weightKg: {
        ...(minWeight && { gte: Number(minWeight) }),
        ...(maxWeight && { lte: Number(maxWeight) }),
      },
    }),
  };

  const loads = await prisma.load.findMany({
    where,
    include: { customer: { select: { id: true, fullName: true, city: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return success(res, 200, 'Loads fetched', { loads });
});

// GET /api/loads/mine
const listMyLoads = asyncHandler(async (req, res) => {
  const loads = await prisma.load.findMany({
    where: { customerId: req.user.id },
    include: { customer: { select: { id: true, fullName: true, city: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return success(res, 200, 'My loads fetched', { loads });
});

// GET /api/loads/:id
const getLoad = asyncHandler(async (req, res) => {
  const load = await prisma.load.findUnique({
    where: { id: req.params.id },
    include: {
      customer: { select: { id: true, fullName: true, city: true } },
      bookings: true,
    },
  });
  if (!load) throw new ApiError(404, 'Load not found');
  return success(res, 200, 'Load fetched', { load });
});

// PATCH /api/loads/:id  (owner only, and only while not yet assigned)
const updateLoad = asyncHandler(async (req, res) => {
  const load = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!load) throw new ApiError(404, 'Load not found');
  if (load.customerId !== req.user.id) throw new ApiError(403, 'Not your load');
  if (!['POSTED', 'SEARCHING'].includes(load.status)) {
    throw new ApiError(400, 'This load can no longer be edited');
  }

  const {
    pickupAddress, pickupLatitude, pickupLongitude,
    destinationAddress, destinationLatitude, destinationLongitude,
    description, weightKg, preferredVehicle, status,
  } = req.body;

  const updated = await prisma.load.update({
    where: { id: load.id },
    data: {
      ...(pickupAddress && { pickupAddress }),
      ...(pickupLatitude && { pickupLatitude: Number(pickupLatitude) }),
      ...(pickupLongitude && { pickupLongitude: Number(pickupLongitude) }),
      ...(destinationAddress && { destinationAddress }),
      ...(destinationLatitude && { destinationLatitude: Number(destinationLatitude) }),
      ...(destinationLongitude && { destinationLongitude: Number(destinationLongitude) }),
      ...(description && { description }),
      ...(weightKg && { weightKg: Number(weightKg) }),
      ...(preferredVehicle !== undefined && { preferredVehicle }),
      ...(status === 'CANCELLED' && { status }),
    },
  });

  return success(res, 200, 'Load updated', { load: updated });
});

// POST /api/loads/:id/contact-team (driver only)
const contactTeam = asyncHandler(async (req, res) => {
  if (!['DRIVER', 'FLEET_OWNER'].includes(req.user.role) && !req.user.driverProfile) throw new ApiError(403, 'Driver/Transporter account required');

  const load = await prisma.load.findUnique({
    where: { id: req.params.id },
    include: { customer: { select: { id: true, fullName: true, mobile: true, city: true } } },
  });
  if (!load) throw new ApiError(404, 'Load not found');
  if (!['POSTED', 'SEARCHING'].includes(load.status)) throw new ApiError(400, 'This load is no longer available for contact');

  const existing = await prisma.contactRequest.findFirst({
    where: { loadId: load.id, requesterId: req.user.id, status: { in: ['NEW', 'IN_PROGRESS'] } },
  });
  if (existing) return success(res, 200, 'Contact request already sent', { request: existing, alreadyExists: true });

  const request = await prisma.contactRequest.create({
    data: {
      loadId: load.id,
      requesterId: req.user.id,
      status: 'NEW',
      message: req.body?.message ? String(req.body.message).slice(0, 1000) : null,
    },
  });

  const teamUsers = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'MANAGER'] }, status: 'ACTIVE' },
    select: { id: true },
  });
  const title = '🚨 New Driver Contact Request';
  const message = [
    'Driver ne posted load ke liye LoadLink Team se contact request bheji hai.',
    'Load: ' + load.pickupAddress + ' → ' + load.destinationAddress,
    'Driver: ' + (req.user.fullName || '—') + ' · ' + (req.user.mobile || '—'),
    'Request ID: ' + request.id,
  ].join(' | ');
  await Promise.all(teamUsers.map((u) => notify(u.id, 'TEAM_CONTACT_REQUEST', title, message)));

  return success(res, 201, 'LoadLink Team ko contact request bhej di gayi', { request });
});

// DELETE /api/loads/:id  (owner only, and only while not yet assigned)
const deleteLoad = asyncHandler(async (req, res) => {
  const load = await prisma.load.findUnique({ where: { id: req.params.id } });
  if (!load) throw new ApiError(404, 'Load not found');
  if (load.customerId !== req.user.id) throw new ApiError(403, 'Not your load');
  if (!['POSTED', 'SEARCHING'].includes(load.status)) {
    throw new ApiError(400, 'This load can no longer be removed');
  }
  await prisma.load.update({ where: { id: load.id }, data: { status: 'CANCELLED' } });
  return success(res, 200, 'Load cancelled');
});

module.exports = { createLoad, listLoads, listMyLoads, getLoad, updateLoad, deleteLoad, contactTeam };
