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


// GET /api/ratings/trust/:userId - operational driver trust score.
const getDriverTrustScore = async (userId) => {
  const driver = await prisma.driverProfile.findUnique({
    where: { userId },
    select: { userId: true, verification: true },
  });
  if (!driver) throw new ApiError(404, 'Driver not found');

  const [ratings, bookings, trips, proofs] = await Promise.all([
    prisma.rating.aggregate({ where: { toUserId: userId }, _avg: { rating: true }, _count: { _all: true } }),
    prisma.booking.groupBy({ by: ['status'], where: { driverId: (await prisma.driverProfile.findUnique({ where: { userId }, select: { id: true } })).id }, _count: { _all: true } }),
    prisma.trip.groupBy({ by: ['status'], where: { driverId: (await prisma.driverProfile.findUnique({ where: { userId }, select: { id: true } })).id }, _count: { _all: true } }),
    prisma.deliveryProof.count({ where: { submittedById: userId } }),
  ]);

  const bookingCount = Object.values(bookings).reduce((sum, row) => sum + row._count._all, 0);
  const accepted = bookings.filter((row) => ['ACCEPTED', 'COMPLETED'].includes(row.status)).reduce((sum, row) => sum + row._count._all, 0);
  const completed = bookings.find((row) => row.status === 'COMPLETED')?._count._all || 0;
  const deliveredTrips = trips.find((row) => row.status === 'DELIVERED')?._count._all || 0;
  const averageRating = ratings._avg.rating ? Math.round(ratings._avg.rating * 10) / 10 : null;
  const ratingCount = ratings._count._all;

  // Components are deliberately transparent: ratings 50%, booking reliability 15%,
  // completion 20%, verification 10%, delivery-proof consistency 5%.
  const ratingComponent = averageRating == null ? 25 : (averageRating / 5) * 50;
  const reliabilityComponent = bookingCount ? (accepted / bookingCount) * 15 : 7.5;
  const completionComponent = accepted ? (completed / accepted) * 20 : 10;
  const verificationComponent = driver.verification === 'VERIFIED' ? 10 : 0;
  const proofComponent = deliveredTrips ? Math.min(1, proofs / deliveredTrips) * 5 : 0;
  const score = Math.round(Math.max(0, Math.min(100, ratingComponent + reliabilityComponent + completionComponent + verificationComponent + proofComponent)));

  return { score, averageRating, ratingCount, completedTrips: deliveredTrips, deliveryProofs: proofs, verification: driver.verification };
};

const getDriverTrustScoreHandler = asyncHandler(async (req, res) => {
  const result = await getDriverTrustScore(req.params.userId);
  return success(res, 200, 'Driver trust score fetched', { trust: result });
});

module.exports = { createRating, getRatingsForUser, getDriverTrustScore, getDriverTrustScoreHandler };
