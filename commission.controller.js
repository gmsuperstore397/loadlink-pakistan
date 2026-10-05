'use strict';

const prisma = require('./prisma');
const asyncHandler = require('./asyncHandler');
const ApiError = require('./ApiError');
const { success } = require('./apiResponse');
const notify = require('./notification.service');
const audit = require('./audit');

const commissionForBooking = (booking) => {
  const fare = Number(booking.agreedFare || 0);
  const rate = Number(booking.commissionRate || 0.05);
  return { fare, rate, amount: Math.round(fare * rate * 100) / 100 };
};

const uploadCommissionSlip = asyncHandler(async (req, res) => {
  const trip = await prisma.trip.findUnique({ where: { id: req.params.id }, include: { booking: true } });
  if (!trip) throw new ApiError(404, 'Trip not found');
  if (!req.user.driverProfile || trip.driverId !== req.user.driverProfile.id) {
    throw new ApiError(403, 'Only the assigned driver can upload the commission slip');
  }
  if (!trip.booking) throw new ApiError(409, 'Booking not found for this trip');
  if (!trip.booking.agreedFare || Number(trip.booking.agreedFare) <= 0) {
    throw new ApiError(409, 'Agreed fare is required before commission can be calculated');
  }
  if (!req.file) throw new ApiError(400, 'Transaction slip upload karein');

  const commission = commissionForBooking(trip.booking);
  const slipUrl = '/api/documents/' + req.file.filename;
  const updated = await prisma.booking.update({
    where: { id: trip.bookingId },
    data: {
      commissionRate: commission.rate,
      commissionAmount: commission.amount,
      commissionStatus: 'SLIP_UPLOADED',
      commissionSlipUrl: slipUrl,
      commissionUploadedAt: new Date(),
      commissionVerifiedAt: null,
      commissionVerifiedById: null,
    },
    include: { trip: { select: { id: true, status: true } } },
  });

  await audit(req, 'COMMISSION_SLIP_UPLOADED', 'Booking', trip.bookingId, {
    tripId: trip.id, amount: commission.amount, slipUrl,
  });
  await notify(trip.booking.customerId, 'COMMISSION_SLIP_UPLOADED', 'Commission slip uploaded', 'Driver ne commission transaction slip upload kar di hai. Manager verification ke baad trip approve hoga.');
  return success(res, 200, 'Commission slip uploaded', { booking: updated, commission });
});

const listCommissions = asyncHandler(async (req, res) => {
  const bookings = await prisma.booking.findMany({
    where: { commissionAmount: { not: null } },
    include: {
      load: { select: { id: true, pickupAddress: true, destinationAddress: true } },
      customer: { select: { id: true, fullName: true, mobile: true } },
      driver: { include: { user: { select: { id: true, fullName: true, mobile: true } } } },
      vehicle: { select: { vehicleNumber: true, vehicleType: true } },
      trip: { select: { id: true, status: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 300,
  });
  return success(res, 200, 'Commission records fetched', { commissions: bookings });
});

const verifyCommission = asyncHandler(async (req, res) => {
  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: { trip: true, driver: { select: { userId: true } } },
  });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.commissionStatus !== 'SLIP_UPLOADED' || !booking.commissionSlipUrl) {
    throw new ApiError(409, 'Commission slip upload hone ke baad hi verify ki ja sakti hai');
  }
  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { commissionStatus: 'VERIFIED', commissionVerifiedAt: new Date(), commissionVerifiedById: req.user.id },
    include: { trip: { select: { id: true, status: true } } },
  });
  await audit(req, 'COMMISSION_VERIFIED', 'Booking', booking.id, { tripId: booking.trip?.id || null, amount: booking.commissionAmount });
  await notify(booking.driver.userId, 'COMMISSION_VERIFIED', 'Commission verified', 'Commission payment slip verify ho gayi hai. Ab Manager deal/trip approve kar sakta hai.');
  return success(res, 200, 'Commission verified', { commission: updated });
});

const rejectCommission = asyncHandler(async (req, res) => {
  const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (!booking.commissionSlipUrl) throw new ApiError(409, 'Commission slip missing');
  const updated = await prisma.booking.update({ where: { id: booking.id }, data: { commissionStatus: 'REJECTED' } });
  await audit(req, 'COMMISSION_REJECTED', 'Booking', booking.id, { reason: req.body.reason || null });
  return success(res, 200, 'Commission slip rejected', { commission: updated });
});

module.exports = { uploadCommissionSlip, listCommissions, verifyCommission, rejectCommission };
