const prisma = require('./prisma');
const asyncHandler = require('./asyncHandler');
const { success } = require('./apiResponse');

const analytics = asyncHandler(async (req, res) => {
  const now = new Date();
  const start30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const start7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsers, totalCustomers, totalDrivers, verifiedDrivers, activeVehicles,
    loads30, bookings30, trips30, disputes30, paid30,
    paidRevenue, avgFare, completedTrips, deliveredLoads,
    newUsers7, newLoads7, newBookings7,
    loadStatus, bookingStatus, tripStatus, paymentStatus, driverVerification,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
    prisma.user.count({ where: { role: 'DRIVER' } }),
    prisma.driverProfile.count({ where: { verification: 'VERIFIED' } }),
    prisma.vehicle.count({ where: { status: 'AVAILABLE', isVerified: true } }),
    prisma.load.count({ where: { createdAt: { gte: start30 } } }),
    prisma.booking.count({ where: { createdAt: { gte: start30 } } }),
    prisma.trip.count({ where: { createdAt: { gte: start30 } } }),
    prisma.dispute.count({ where: { createdAt: { gte: start30 } } }),
    prisma.payment.count({ where: { createdAt: { gte: start30 }, status: 'PAID' } }),
    prisma.payment.aggregate({ where: { createdAt: { gte: start30 }, status: 'PAID' }, _sum: { amount: true } }),
    prisma.booking.aggregate({ where: { createdAt: { gte: start30 }, agreedFare: { not: null } }, _avg: { agreedFare: true } }),
    prisma.trip.count({ where: { createdAt: { gte: start30 }, status: 'DELIVERED' } }),
    prisma.load.count({ where: { createdAt: { gte: start30 }, status: 'DELIVERED' } }),
    prisma.user.count({ where: { createdAt: { gte: start7 } } }),
    prisma.load.count({ where: { createdAt: { gte: start7 } } }),
    prisma.booking.count({ where: { createdAt: { gte: start7 } } }),
    prisma.load.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.booking.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.trip.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.payment.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.driverProfile.groupBy({ by: ['verification'], _count: { _all: true } }),
  ]);

  const revenue = paidRevenue._sum.amount || 0;
  const tripCompletionRate = trips30 ? Math.round((completedTrips / trips30) * 100) : 0;
  const loadDeliveryRate = loads30 ? Math.round((deliveredLoads / loads30) * 100) : 0;

  return success(res, 200, 'Admin analytics fetched', {
    period: 'last_30_days',
    generatedAt: now.toISOString(),
    kpis: {
      totalUsers, totalCustomers, totalDrivers, verifiedDrivers, activeVehicles,
      loads30, bookings30, trips30, disputes30, paid30,
      paidRevenue: revenue,
      averageAgreedFare: Math.round(avgFare._avg.agreedFare || 0),
      tripCompletionRate,
      loadDeliveryRate,
    },
    last7Days: { newUsers: newUsers7, newLoads: newLoads7, newBookings: newBookings7 },
    breakdowns: { loadStatus, bookingStatus, tripStatus, paymentStatus, driverVerification },
  });
});

module.exports = { analytics };
