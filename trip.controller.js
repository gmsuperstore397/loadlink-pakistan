const prisma = require('./prisma');
const asyncHandler = require('./asyncHandler');
const { success } = require('./apiResponse');
const ApiError = require('./ApiError');
const notify = require('./notification.service');

// GET /api/trips
const listTrips = asyncHandler(async (req, res) => {
  const where = req.user.driverProfile ? { driverId: req.user.driverProfile.id } : {};
  const trips = await prisma.trip.findMany({
    where,
    include: { load: true, vehicle: true },
    orderBy: { createdAt: 'desc' },
  });
  return success(res, 200, 'Trips fetched', { trips });
});

async function assertTripAccess(req, trip) {
  const isDriver = req.user.driverProfile && trip.driverId === req.user.driverProfile.id;
  const load = await prisma.load.findUnique({ where: { id: trip.loadId } });
  const isCustomer = load && load.customerId === req.user.id;
  if (!isDriver && !isCustomer && req.user.role !== 'ADMIN') {
    throw new ApiError(403, 'Not allowed to view this trip');
  }
}

// GET /api/trips/:id
const getTrip = asyncHandler(async (req, res) => {
  const trip = await prisma.trip.findUnique({
    where: { id: req.params.id },
    include: { load: true, vehicle: true, driver: { include: { user: true } } },
  });
  if (!trip) throw new ApiError(404, 'Trip not found');
  await assertTripAccess(req, trip);
  return success(res, 200, 'Trip fetched', { trip });
});

// GET /api/trips/:id/live
const getLiveTrip = asyncHandler(async (req, res) => {
  const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
  if (!trip) throw new ApiError(404, 'Trip not found');
  await assertTripAccess(req, trip);

  return success(res, 200, 'Live trip status', {
    tripId: trip.id,
    status: trip.status,
    currentLatitude: trip.currentLatitude,
    currentLongitude: trip.currentLongitude,
    updatedAt: trip.updatedAt,
  });
});

// PATCH /api/trips/:id/location  (assigned driver only)
const updateLocation = asyncHandler(async (req, res) => {
  const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
  if (!trip) throw new ApiError(404, 'Trip not found');
  if (!req.user.driverProfile || trip.driverId !== req.user.driverProfile.id) {
    throw new ApiError(403, 'Only the assigned driver can update this trip\u2019s location');
  }

  const { latitude, longitude } = req.body;
  const updated = await prisma.$transaction([
    prisma.trip.update({
      where: { id: trip.id },
      data: { currentLatitude: Number(latitude), currentLongitude: Number(longitude) },
    }),
    prisma.vehicle.update({
      where: { id: trip.vehicleId },
      data: { latitude: Number(latitude), longitude: Number(longitude) },
    }),
  ]);

  return success(res, 200, 'Location updated', { trip: updated[0] });
});

const VALID_TRIP_TRANSITIONS = {
  ASSIGNED: ['PICKED_UP'],
  PICKED_UP: ['IN_TRANSIT'],
  IN_TRANSIT: ['NEAR_DESTINATION'],
  NEAR_DESTINATION: ['DELIVERED'],
  DELIVERED: [],
};

// PATCH /api/trips/:id/status  (assigned driver only)
const updateTripStatus = asyncHandler(async (req, res) => {
  const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
  if (!trip) throw new ApiError(404, 'Trip not found');
  if (!req.user.driverProfile || trip.driverId !== req.user.driverProfile.id) {
    throw new ApiError(403, 'Only the assigned driver can update this trip');
  }

  const { status } = req.body;
  const allowed = VALID_TRIP_TRANSITIONS[trip.status] || [];
  if (!allowed.includes(status)) {
    throw new ApiError(400, `Cannot move trip from ${trip.status} to ${status}`);
  }

  const isDelivered = status === 'DELIVERED';
  const loadStatusMap = {
    PICKED_UP: 'PICKED_UP',
    IN_TRANSIT: 'IN_TRANSIT',
    NEAR_DESTINATION: 'IN_TRANSIT',
    DELIVERED: 'DELIVERED',
  };

  const updated = await prisma.$transaction(async (tx) => {
    const t = await tx.trip.update({
      where: { id: trip.id },
      data: { status, ...(isDelivered && { completedAt: new Date() }) },
    });
    await tx.load.update({ where: { id: trip.loadId }, data: { status: loadStatusMap[status] } });
    if (isDelivered) {
      await tx.booking.update({ where: { id: trip.bookingId }, data: { status: 'COMPLETED' } });
      await tx.vehicle.update({ where: { id: trip.vehicleId }, data: { status: 'AVAILABLE' } });
    }
    return t;
  });

  const load = await prisma.load.findUnique({ where: { id: trip.loadId } });
  await notify(
    load.customerId,
    isDelivered ? 'TRIP_DELIVERED' : 'TRIP_UPDATED',
    isDelivered ? 'Load delivered' : 'Trip updated',
    isDelivered ? 'Your load has been delivered successfully.' : `Trip status changed to ${status}.`,
  );

  return success(res, 200, 'Trip status updated', { trip: updated });
});

module.exports = { listTrips, getTrip, getLiveTrip, updateLocation, updateTripStatus };
