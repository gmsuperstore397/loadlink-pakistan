const prisma = require('./prisma');
const asyncHandler = require('./asyncHandler');
const { success } = require('./apiResponse');
const ApiError = require('./ApiError');
const notify = require('./notification.service');

const VALID_CATEGORIES = ['PAYMENT', 'DELIVERY', 'DAMAGE', 'SERVICE', 'OTHER'];
const VALID_STATUSES = ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'];

async function getAccessibleTrip(req, tripId) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { load: { select: { customerId: true } }, driver: { select: { userId: true } } },
  });
  if (!trip) throw new ApiError(404, 'Trip not found');
  const allowed = ['ADMIN', 'MANAGER'].includes(req.user.role) || trip.load.customerId === req.user.id || trip.driver.userId === req.user.id;
  if (!allowed) throw new ApiError(403, 'Not allowed to access this trip');
  return trip;
}

const createDispute = asyncHandler(async (req, res) => {
  const trip = await getAccessibleTrip(req, req.body.tripId);
  const category = String(req.body.category || '').trim().toUpperCase();
  const description = String(req.body.description || '').trim();
  if (!VALID_CATEGORIES.includes(category)) throw new ApiError(422, 'Invalid dispute category');
  if (description.length < 10) throw new ApiError(422, 'Dispute description must be at least 10 characters');
  const existing = await prisma.dispute.findFirst({
    where: { tripId: trip.id, raisedById: req.user.id, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
  });
  if (existing) throw new ApiError(409, 'You already have an active dispute for this trip');

  const dispute = await prisma.dispute.create({
    data: { tripId: trip.id, raisedById: req.user.id, category, description },
    include: { raisedBy: { select: { id: true, fullName: true, role: true } } },
  });
  const otherUserId = trip.load.customerId === req.user.id ? trip.driver.userId : trip.load.customerId;
  await notify(otherUserId, 'SYSTEM', 'Dispute raised', 'A dispute has been raised for trip ' + trip.id.slice(0, 8) + '.');
  return success(res, 201, 'Dispute submitted', { dispute });
});

const listMyDisputes = asyncHandler(async (req, res) => {
  const disputes = await prisma.dispute.findMany({
    where: { raisedById: req.user.id },
    include: { trip: { select: { id: true, pickup: true, destination: true, status: true } }, resolvedBy: { select: { fullName: true } } },
    orderBy: { createdAt: 'desc' }, take: 100,
  });
  return success(res, 200, 'Disputes fetched', { disputes });
});

const getDispute = asyncHandler(async (req, res) => {
  const dispute = await prisma.dispute.findUnique({
    where: { id: req.params.id },
    include: { trip: { select: { id: true, pickup: true, destination: true, status: true, load: { select: { customerId: true } }, driver: { select: { userId: true } } } }, raisedBy: { select: { id: true, fullName: true, role: true } }, resolvedBy: { select: { id: true, fullName: true } } },
  });
  if (!dispute) throw new ApiError(404, 'Dispute not found');
  const allowed = ['ADMIN', 'MANAGER'].includes(req.user.role) || dispute.raisedById === req.user.id || dispute.trip.load.customerId === req.user.id || dispute.trip.driver.userId === req.user.id;
  if (!allowed) throw new ApiError(403, 'Not allowed');
  return success(res, 200, 'Dispute fetched', { dispute });
});

module.exports = { createDispute, listMyDisputes, getDispute, VALID_STATUSES };
