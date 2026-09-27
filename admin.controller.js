const prisma = require('./prisma');
const asyncHandler = require('./asyncHandler');
const { success } = require('./apiResponse');
const ApiError = require('./ApiError');
const { sanitizeUser } = require('./sanitizeUser');
const notify = require('./notification.service');

// GET /api/admin/dashboard
const dashboard = asyncHandler(async (req, res) => {
  const [
    users, drivers, verifiedDrivers, pendingDrivers, vehicles,
    activeLoads, completedLoads, activeTrips, completedTrips,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'DRIVER' } }),
    prisma.driverProfile.count({ where: { verification: 'VERIFIED' } }),
    prisma.driverProfile.count({ where: { verification: 'PENDING_VERIFICATION' } }),
    prisma.vehicle.count(),
    prisma.load.count({ where: { status: { in: ['POSTED', 'SEARCHING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] } } }),
    prisma.load.count({ where: { status: 'DELIVERED' } }),
    prisma.trip.count({ where: { status: { not: 'DELIVERED' } } }),
    prisma.trip.count({ where: { status: 'DELIVERED' } }),
  ]);

  return success(res, 200, 'Dashboard stats', {
    users, drivers, verifiedDrivers, pendingDrivers, vehicles,
    activeLoads, completedLoads, activeTrips, completedTrips,
  });
});

// GET /api/admin/users
const listUsers = asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({
    include: { driverProfile: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return success(res, 200, 'Users fetched', { users: users.map(sanitizeUser) });
});

// GET /api/admin/transporters/pending
const pendingTransporters = asyncHandler(async (req, res) => {
  const pending = await prisma.driverProfile.findMany({
    where: { verification: 'PENDING_VERIFICATION' },
    include: { user: { select: { id: true, fullName: true, mobile: true, city: true } }, vehicles: true },
    orderBy: { createdAt: 'asc' },
  });
  return success(res, 200, 'Pending transporters fetched', { pending });
});

// PATCH /api/admin/transporters/:id/verify
const verifyTransporter = asyncHandler(async (req, res) => {
  const driver = await prisma.driverProfile.findUnique({ where: { id: req.params.id } });
  if (!driver) throw new ApiError(404, 'Transporter not found');

  const updated = await prisma.$transaction(async (tx) => {
    const d = await tx.driverProfile.update({
      where: { id: driver.id },
      data: { verification: 'VERIFIED', rejectionReason: null },
    });
    await tx.vehicle.updateMany({ where: { driverId: driver.id }, data: { isVerified: true, status: 'AVAILABLE' } });
    return d;
  });

  await notify(driver.userId, 'ACCOUNT_VERIFIED', 'Account verified',
    'Your driver account has been verified. You can now accept bookings.');

  return success(res, 200, 'Transporter verified', { driver: updated });
});

// PATCH /api/admin/transporters/:id/reject
const rejectTransporter = asyncHandler(async (req, res) => {
  const driver = await prisma.driverProfile.findUnique({ where: { id: req.params.id } });
  if (!driver) throw new ApiError(404, 'Transporter not found');

  const updated = await prisma.driverProfile.update({
    where: { id: driver.id },
    data: { verification: 'REJECTED', rejectionReason: req.body.reason || null },
  });

  return success(res, 200, 'Transporter rejected', { driver: updated });
});

// PATCH /api/admin/users/:id/suspend
const suspendUser = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) throw new ApiError(404, 'User not found');

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { status: req.body.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED' },
  });
  return success(res, 200, 'User status updated', { user: sanitizeUser(updated) });
});

module.exports = { dashboard, listUsers, pendingTransporters, verifyTransporter, rejectTransporter, suspendUser };
