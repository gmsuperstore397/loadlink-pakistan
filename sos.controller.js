const prisma = require('./prisma');
const asyncHandler = require('./asyncHandler');
const { success } = require('./apiResponse');
const ApiError = require('./ApiError');
const notify = require('./notification.service');
const audit = require('./audit');

const ACTIVE_TRIP_STATUSES = ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'NEAR_DESTINATION'];
const SOS_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'CANCELLED'];

async function getTripAccess(req, trip) {
  const isDriver = !!req.user.driverProfile && trip.driverId === req.user.driverProfile.id;
  const isCustomer = trip.load && trip.load.customerId === req.user.id;
  const isAdmin = ['ADMIN', 'MANAGER'].includes(req.user.role);
  if (!isDriver && !isCustomer && !isAdmin) throw new ApiError(403, 'Not allowed to access this trip');
  return { isDriver, isCustomer, isAdmin };
}

const createSOS = asyncHandler(async (req, res) => {
  const trip = await prisma.trip.findUnique({
    where: { id: req.params.tripId },
    include: { load: { select: { customerId: true, pickupAddress: true, destinationAddress: true } }, driver: { select: { userId: true } } },
  });
  if (!trip) throw new ApiError(404, 'Trip not found');
  const access = await getTripAccess(req, trip);
  if (!access.isDriver && !access.isCustomer) throw new ApiError(403, 'Only trip participants can raise SOS');
  if (!ACTIVE_TRIP_STATUSES.includes(trip.status)) throw new ApiError(400, 'SOS is available only during an active trip');

  const existing = await prisma.sOSAlert.findFirst({ where: { tripId: trip.id, raisedById: req.user.id, status: { in: ['OPEN', 'ACKNOWLEDGED'] } } });
  if (existing) throw new ApiError(409, 'You already have an active SOS for this trip');

  const type = String(req.body.type || 'EMERGENCY').trim().slice(0, 40) || 'EMERGENCY';
  const message = String(req.body.message || '').trim().slice(0, 500) || null;
  const latitude = req.body.latitude != null ? Number(req.body.latitude) : null;
  const longitude = req.body.longitude != null ? Number(req.body.longitude) : null;
  if ((latitude !== null && !Number.isFinite(latitude)) || (longitude !== null && !Number.isFinite(longitude))) {
    throw new ApiError(400, 'Invalid location');
  }

  const alert = await prisma.sOSAlert.create({ data: {
    tripId: trip.id, raisedById: req.user.id, type, message,
    latitude, longitude,
  }, include: { raisedBy: { select: { id: true, fullName: true, mobile: true } } });

  const otherUserId = access.isDriver ? trip.load.customerId : trip.driver.userId;
  if (otherUserId) {
    await notify(otherUserId, 'SYSTEM', '🚨 SOS Emergency Alert', `Emergency alert raised for Trip #${trip.id.slice(0, 8)}. Please check the trip.`);
  }
  await audit(req, 'SOS_RAISED', 'SOSAlert', alert.id, { tripId: trip.id, type, hasLocation: latitude !== null && longitude !== null });
  return success(res, 201, 'SOS alert raised', { alert });
});

const listMySOS = asyncHandler(async (req, res) => {
  const alerts = await prisma.sOSAlert.findMany({
    where: { raisedById: req.user.id },
    include: { trip: { select: { id: true, pickup: true, destination: true, status: true } } },
    orderBy: { createdAt: 'desc' }, take: 100,
  });
  return success(res, 200, 'SOS alerts fetched', { alerts });
});

const getTripSOS = asyncHandler(async (req, res) => {
  const trip = await prisma.trip.findUnique({ where: { id: req.params.tripId }, include: { load: true } });
  if (!trip) throw new ApiError(404, 'Trip not found');
  await getTripAccess(req, trip);
  const alerts = await prisma.sOSAlert.findMany({
    where: { tripId: trip.id },
    include: { raisedBy: { select: { id: true, fullName: true, mobile: true } }, resolvedBy: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return success(res, 200, 'Trip SOS alerts fetched', { alerts });
});

module.exports = { createSOS, listMySOS, getTripSOS, ACTIVE_TRIP_STATUSES, SOS_STATUSES };