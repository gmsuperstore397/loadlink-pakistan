const prisma = require('./prisma');
const asyncHandler = require('./asyncHandler');
const { success } = require('./apiResponse');
const ApiError = require('./ApiError');

// POST /api/ratings  (only after a trip is DELIVERED; one rating per user per trip)
const createRating = asyncHandler(async (req, res) => {
  const { tripId, toUserId, rating, comment } = req.body;
  if (!rating || rating < 1 || rating > 5) throw new ApiError(422, 'Rating must be between 1 and 5');

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { load: true, driver: { include: { user: true } } },
  });
  if (!trip) throw new ApiError(404, 'Trip not found');
  if (trip.status !== 'DELIVERED') throw new ApiError(400, 'You can only rate after delivery');

  const isCustomer = trip.load.customerId === req.user.id;
  const isDriver = req.user.driverProfile && trip.driverId === req.user.driverProfile.id;
  if (!isCustomer && !isDriver) throw new ApiError(403, 'Not part of this trip');

  const expectedToUserId = isCustomer ? trip.driver.user.id : trip.load.customerId;
  if (toUserId !== expectedToUserId) throw new ApiError(400, 'Invalid rating target for this trip');

  const existing = await prisma.rating.findUnique({
    where: { tripId_fromUserId: { tripId, fromUserId: req.user.id } },
  });
  if (existing) throw new ApiError(409, 'You have already rated this trip');

  const created = await prisma.rating.create({
    data: { tripId, fromUserId: req.user.id, toUserId, rating: Number(rating), comment: comment || null },
  });

  return success(res, 201, 'Rating submitted', { rating: created });
});

// GET /api/ratings/:userId
const getRatingsForUser = asyncHandler(async (req, res) => {
  const ratings = await prisma.rating.findMany({
    where: { toUserId: req.params.userId },
    include: { fromUser: { select: { fullName: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const avg = ratings.length
    ? Math.round((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length) * 10) / 10
    : null;
  return success(res, 200, 'Ratings fetched', { ratings, average: avg, count: ratings.length });
});

module.exports = { createRating, getRatingsForUser };
