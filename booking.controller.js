const prisma = require('./prisma');
const asyncHandler = require('./asyncHandler');
const { success } = require('./apiResponse');
const ApiError = require('./ApiError');
const notify = require('./notification.service');

// POST /api/bookings  (customer only) - request a specific vehicle for a load.
const createBooking = asyncHandler(async (req, res) => {
  const { loadId, driverId, vehicleId } = req.body;

  const load = await prisma.load.findUnique({ where: { id: loadId } });
  if (!load) throw new ApiError(404, 'Load not found');
  if (load.customerId !== req.user.id) throw new ApiError(403, 'Not your load');
  if (!['POSTED', 'SEARCHING'].includes(load.status)) {
    throw new ApiError(400, 'This load is no longer available for booking');
  }

  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle || vehicle.driverId !== driverId) throw new ApiError(400, 'Invalid vehicle/driver pair');
  if (vehicle.status !== 'AVAILABLE') throw new ApiError(400, 'Vehicle is not currently available');

  const booking = await prisma.$transaction(async (tx) => {
    // Re-check inside the transaction to prevent a race between two customers.
    const freshLoad = await tx.load.findUnique({ where: { id: loadId } });
    if (!['POSTED', 'SEARCHING'].includes(freshLoad.status)) {
      throw new ApiError(400, 'This load is no longer available for booking');
    }
    const created = await tx.booking.create({
      data: { loadId, customerId: req.user.id, driverId, vehicleId, status: 'REQUESTED' },
    });
    await tx.load.update({ where: { id: loadId }, data: { status: 'SEARCHING' } });
    return created;
  });

  const driverProfile = await prisma.driverProfile.findUnique({ where: { id: driverId } });
  await notify(driverProfile.userId, 'BOOKING_REQUEST', 'New booking request',
    `You have a new load booking request for ${load.pickupAddress} → ${load.destinationAddress}.`);

  return success(res, 201, 'Booking request sent', { booking });
});

// GET /api/bookings/my
const myBookings = asyncHandler(async (req, res) => {
  const where = req.user.role === 'DRIVER' && req.user.driverProfile
    ? { driverId: req.user.driverProfile.id }
    : { customerId: req.user.id };

  const bookings = await prisma.booking.findMany({
    where,
    include: { load: true, vehicle: true, driver: { include: { user: true } }, trip: true },
    orderBy: { createdAt: 'desc' },
  });
  return success(res, 200, 'Bookings fetched', { bookings });
});

// GET /api/bookings/:id
const getBooking = asyncHandler(async (req, res) => {
  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: { load: true, vehicle: true, driver: { include: { user: true } }, customer: true, trip: true },
  });
  if (!booking) throw new ApiError(404, 'Booking not found');

  const isOwner = booking.customerId === req.user.id
    || (req.user.driverProfile && booking.driverId === req.user.driverProfile.id);
  if (!isOwner && req.user.role !== 'ADMIN') throw new ApiError(403, 'Not allowed');

  return success(res, 200, 'Booking fetched', { booking });
});

// PATCH /api/bookings/:id/accept  (driver only, and must be verified)
const acceptBooking = asyncHandler(async (req, res) => {
  const booking = await prisma.booking.findUnique({ where: { id: req.params.id }, include: { load: true } });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (!req.user.driverProfile || booking.driverId !== req.user.driverProfile.id) {
    throw new ApiError(403, 'Not your booking');
  }
  if (req.user.driverProfile.verification !== 'VERIFIED') {
    throw new ApiError(403, 'Your account must be verified before accepting bookings');
  }
  if (booking.status !== 'REQUESTED') throw new ApiError(400, 'Booking is no longer pending');

  const trip = await prisma.$transaction(async (tx) => {
    const freshBooking = await tx.booking.findUnique({ where: { id: booking.id } });
    if (freshBooking.status !== 'REQUESTED') throw new ApiError(400, 'Booking is no longer pending');

    await tx.booking.update({ where: { id: booking.id }, data: { status: 'ACCEPTED' } });
    await tx.load.update({ where: { id: booking.loadId }, data: { status: 'ASSIGNED' } });
    await tx.vehicle.update({ where: { id: booking.vehicleId }, data: { status: 'BUSY' } });

    // Reject any other pending requests on the same load - one load, one driver.
    await tx.booking.updateMany({
      where: { loadId: booking.loadId, id: { not: booking.id }, status: 'REQUESTED' },
      data: { status: 'REJECTED' },
    });

    return tx.trip.create({
      data: {
        bookingId: booking.id,
        loadId: booking.loadId,
        driverId: booking.driverId,
        vehicleId: booking.vehicleId,
        pickup: booking.load.pickupAddress,
        destination: booking.load.destinationAddress,
        status: 'ASSIGNED',
        startedAt: new Date(),
      },
    });
  });

  const customerLoad = await prisma.load.findUnique({ where: { id: booking.loadId } });
  await notify(customerLoad.customerId, 'BOOKING_ACCEPTED', 'Booking accepted',
    'A driver has accepted your load and a trip has started.');

  return success(res, 200, 'Booking accepted, trip created', { trip });
});

// PATCH /api/bookings/:id/reject  (driver only)
const rejectBooking = asyncHandler(async (req, res) => {
  const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (!req.user.driverProfile || booking.driverId !== req.user.driverProfile.id) {
    throw new ApiError(403, 'Not your booking');
  }
  if (booking.status !== 'REQUESTED') throw new ApiError(400, 'Booking is no longer pending');

  await prisma.booking.update({ where: { id: booking.id }, data: { status: 'REJECTED' } });

  const load = await prisma.load.findUnique({ where: { id: booking.loadId } });
  await notify(load.customerId, 'BOOKING_REJECTED', 'Booking rejected',
    'The driver was unable to accept your booking request.');

  return success(res, 200, 'Booking rejected');
});

// PATCH /api/bookings/:id/cancel  (customer only, before acceptance)
const cancelBooking = asyncHandler(async (req, res) => {
  const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.customerId !== req.user.id) throw new ApiError(403, 'Not your booking');
  if (booking.status !== 'REQUESTED') throw new ApiError(400, 'Booking can no longer be cancelled');

  await prisma.$transaction([
    prisma.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } }),
    prisma.load.update({ where: { id: booking.loadId }, data: { status: 'POSTED' } }),
  ]);

  return success(res, 200, 'Booking cancelled');
});

module.exports = { createBooking, myBookings, getBooking, acceptBooking, rejectBooking, cancelBooking };
