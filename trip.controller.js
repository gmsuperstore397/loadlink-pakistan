const prisma = require('./prisma');
const asyncHandler = require('./asyncHandler');
const { success } = require('./apiResponse');
const ApiError = require('./ApiError');
const notify = require('./notification.service');

// GET /api/trips
const listTrips = asyncHandler(async (req, res) => {
  const where = req.user.role === 'ADMIN'
    ? {}
    : req.user.driverProfile
      ? { driverId: req.user.driverProfile.id }
      : { load: { customerId: req.user.id } };
  const trips = await prisma.trip.findMany({
    where,
    include: { load: true, vehicle: true, driver: { include: { user: { select: { id: true, fullName: true } } } } },
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

// GET /api/trips/:id/stream - Server-Sent Events for near-real-time tracking.
const streamTrip = asyncHandler(async (req, res) => {
  const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
  if (!trip) throw new ApiError(404, 'Trip not found');
  await assertTripAccess(req, trip);
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  let closed = false;
  const send = async () => {
    if (closed) return;
    const current = await prisma.trip.findUnique({ where: { id: trip.id }, select: { id: true, status: true, currentLatitude: true, currentLongitude: true, updatedAt: true } });
    if (current) res.write(`data: ${JSON.stringify(current)}\\n\\n`);
  };
  await send();
  const timer = setInterval(send, 5000);
  req.on('close', () => { closed = true; clearInterval(timer); res.end(); });
});


// POST /api/trips/:id/proof - assigned driver submits digital proof of delivery.
const submitDeliveryProof = asyncHandler(async (req, res) => {
  const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
  if (!trip) throw new ApiError(404, 'Trip not found');
  if (!req.user.driverProfile || trip.driverId !== req.user.driverProfile.id) {
    throw new ApiError(403, 'Only the assigned driver can submit delivery proof');
  }
  if (trip.status !== 'DELIVERED') {
    throw new ApiError(400, 'Delivery proof can only be submitted after the trip is delivered');
  }

  const receiverName = String(req.body.receiverName || '').trim();
  if (!receiverName) throw new ApiError(400, 'Receiver name is required');

  const photoUrl = req.files?.photo?.[0] ? `/api/documents/${req.files.photo[0].filename}` : null;
  const signatureUrl = req.files?.signature?.[0] ? `/api/documents/${req.files.signature[0].filename}` : null;

  const proof = await prisma.deliveryProof.upsert({
    where: { tripId: trip.id },
    create: {
      tripId: trip.id,
      submittedById: req.user.id,
      receiverName,
      receiverPhone: String(req.body.receiverPhone || '').trim() || null,
      photoUrl,
      signatureUrl,
      notes: String(req.body.notes || '').trim() || null,
      deliveredAt: req.body.deliveredAt ? new Date(req.body.deliveredAt) : new Date(),
    },
    update: {
      submittedById: req.user.id,
      receiverName,
      receiverPhone: String(req.body.receiverPhone || '').trim() || null,
      ...(photoUrl !== null && { photoUrl }),
      ...(signatureUrl !== null && { signatureUrl }),
      notes: String(req.body.notes || '').trim() || null,
      deliveredAt: req.body.deliveredAt ? new Date(req.body.deliveredAt) : undefined,
    },
  });

  return success(res, 200, 'Delivery proof saved', { proof });
});

// GET /api/trips/:id/proof - customer, assigned driver or admin can view proof.
const getDeliveryProof = asyncHandler(async (req, res) => {
  const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
  if (!trip) throw new ApiError(404, 'Trip not found');
  await assertTripAccess(req, trip);
  const proof = await prisma.deliveryProof.findUnique({
    where: { tripId: trip.id },
    include: { submittedBy: { select: { id: true, fullName: true } } },
  });
  if (!proof) throw new ApiError(404, 'Delivery proof not found');
  return success(res, 200, 'Delivery proof fetched', { proof });
});

module.exports = { listTrips, getTrip, getLiveTrip, updateLocation, updateTripStatus, streamTrip, submitDeliveryProof, getDeliveryProof };
