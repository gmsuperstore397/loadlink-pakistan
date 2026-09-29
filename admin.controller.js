const prisma = require('./prisma');
const asyncHandler = require('./asyncHandler');
const { success } = require('./apiResponse');
const ApiError = require('./ApiError');
const { sanitizeUser } = require('./sanitizeUser');
const notify = require('./notification.service');
const audit = require('./audit');

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

const setCustomerAccountStatus = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user || user.role !== 'CUSTOMER') throw new ApiError(404, 'Customer not found');
  const status = req.body.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED';
  const updated = await prisma.user.update({ where: { id: user.id }, data: { status } });
  await audit(req, status === 'ACTIVE' ? 'CUSTOMER_ACCOUNT_ENABLED' : 'CUSTOMER_ACCOUNT_DISABLED', 'User', user.id, { status });
  return success(res, 200, 'Customer account status updated', { user: sanitizeUser(updated) });
});

const setDriverAccountStatus = asyncHandler(async (req, res) => {
  const driver = await prisma.driverProfile.findUnique({ where: { id: req.params.id }, include: { user: true } });
  if (!driver || driver.user.role !== 'DRIVER') throw new ApiError(404, 'Driver not found');
  const status = req.body.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED';
  const updated = await prisma.user.update({ where: { id: driver.userId }, data: { status } });
  await audit(req, status === 'ACTIVE' ? 'DRIVER_ACCOUNT_ENABLED' : 'DRIVER_ACCOUNT_DISABLED', 'User', driver.userId, { status, driverProfileId: driver.id });
  return success(res, 200, 'Driver account status updated', { user: sanitizeUser(updated) });
});


const updateCustomer = asyncHandler(async (req,res) => {
  const user=await prisma.user.findUnique({where:{id:req.params.id}});
  if(!user || user.role!=='CUSTOMER') throw new ApiError(404,'Customer not found');
  const data={};
  for(const k of ['fullName','city']) if(req.body[k]!==undefined) data[k]=String(req.body[k]).trim();
  if(req.body.status!==undefined) data.status=req.body.status==='ACTIVE'?'ACTIVE':'SUSPENDED';
  const updated=await prisma.user.update({where:{id:user.id},data});
  await audit(req,'CUSTOMER_UPDATED','User',user.id,data);
  return success(res,200,'Customer updated',{user:sanitizeUser(updated)});
});

const updateLoad = asyncHandler(async (req,res) => {
  const load=await prisma.load.findUnique({where:{id:req.params.id}});
  if(!load) throw new ApiError(404,'Load not found');
  const allowed=['status','pickupAddress','destinationAddress'];
  const data={}; for(const k of allowed) if(req.body[k]!==undefined) data[k]=req.body[k];
  const updated=await prisma.load.update({where:{id:load.id},data});
  await audit(req,'LOAD_UPDATED','Load',load.id,data);
  return success(res,200,'Load updated',{load:updated});
});

const updateBooking = asyncHandler(async (req,res) => {
  const booking=await prisma.booking.findUnique({where:{id:req.params.id}});
  if(!booking) throw new ApiError(404,'Booking not found');
  const data={}; for(const k of ['status','agreedFare']) if(req.body[k]!==undefined) data[k]=req.body[k];
  const updated=await prisma.booking.update({where:{id:booking.id},data});
  await audit(req,'BOOKING_UPDATED','Booking',booking.id,data);
  return success(res,200,'Booking updated',{booking:updated});
});

const updatePayment = asyncHandler(async (req,res) => {
  const payment=await prisma.payment.findUnique({where:{id:req.params.id}});
  if(!payment) throw new ApiError(404,'Payment not found');
  if(!['PENDING','PAID','FAILED'].includes(req.body.status)) throw new ApiError(400,'Invalid payment status');
  const updated=await prisma.payment.update({where:{id:payment.id},data:{status:req.body.status}});
  await audit(req,'PAYMENT_UPDATED','Payment',payment.id,{status:req.body.status});
  return success(res,200,'Payment updated',{payment:updated});
});

const listAuditLogs = asyncHandler(async (req, res) => {
  const logs = await prisma.auditLog.findMany({ include: { user: { select: { id: true, fullName: true, mobile: true, role: true } } }, orderBy: { createdAt: 'desc' }, take: 200 });
  return success(res, 200, 'Audit logs fetched', { logs });
});

const managerAuditTimeline = asyncHandler(async (req, res) => {
  const where = {
    user: { role: 'MANAGER' },
  };
  if (req.query.managerId) where.userId = req.query.managerId;
  if (req.query.action) where.action = String(req.query.action).trim();
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
  where.createdAt = { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };

  const logs = await prisma.auditLog.findMany({
    where,
    include: { user: { select: { id: true, fullName: true, mobile: true, role: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  return success(res, 200, 'Manager audit timeline fetched', { logs, days });
});

const paymentSummary = asyncHandler(async (req, res) => {
  const [pending, paid, failed, totalPaid] = await Promise.all([
    prisma.payment.count({ where: { status: 'PENDING' } }),
    prisma.payment.count({ where: { status: 'PAID' } }),
    prisma.payment.count({ where: { status: 'FAILED' } }),
    prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
  ]);
  return success(res, 200, 'Payment summary', { pending, paid, failed, totalPaid: totalPaid._sum.amount || 0 });
});

const expiringDocuments = asyncHandler(async (req, res) => {
  const until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const [drivers, vehicles] = await Promise.all([
    prisma.driverProfile.findMany({
      where: { OR: [
        { cnicExpiryDate: { lte: until } },
        { licenseExpiryDate: { lte: until } },
      ] },
      include: { user: { select: { id: true, fullName: true, mobile: true } } },
    }),
    prisma.vehicle.findMany({
      where: { documentExpiryDate: { lte: until } },
      include: { driver: { include: { user: { select: { id: true, fullName: true, mobile: true } } } } },
    }),
  ]);
  return success(res, 200, 'Documents expiring within 30 days', { drivers, vehicles });
});


const MANAGER_PERMISSIONS = [
  'dashboard.view',
  'customers.view',
  'customers.edit',
  'drivers.view',
  'drivers.verify',
  'drivers.documents',
  'loads.view',
  'loads.edit',
  'bookings.view',
  'deals.approve',
  'commission.verify',
  'payments.verify',
  'location.unlock',
  'trips.view',
  'reports.view',
  'disputes.view',
  'disputes.resolve',
];

const listManagers = asyncHandler(async (req, res) => {
  const managers = await prisma.user.findMany({
    where: { role: 'MANAGER' },
    select: { id: true, fullName: true, email: true, mobile: true, status: true, permissions: true, createdAt: true, lastLoginAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return success(res, 200, 'Managers fetched', {
    managers: managers.map((m) => ({ ...m, permissions: (() => { try { return JSON.parse(m.permissions || '[]'); } catch (_) { return []; } })() })),
  });
});

const createManager = asyncHandler(async (req, res) => {
  const { fullName, email, mobile, password, permissions } = req.body;
  if (!fullName || !email || !mobile || !password) throw new ApiError(400, 'Name, email, mobile and password are required');
  if (String(password).length < 10) throw new ApiError(400, 'Password must be at least 10 characters');
  const requested = Array.isArray(permissions) ? permissions.filter((p) => MANAGER_PERMISSIONS.includes(p)) : [];
  const bcrypt = require('bcryptjs');
  const passwordHash = await bcrypt.hash(String(password), 12);

  const existingEmail = await prisma.user.findUnique({ where: { email: String(email).trim().toLowerCase() } });
  const existingMobile = await prisma.user.findUnique({ where: { mobile: String(mobile).replace(/\s+/g, '') } });
  if (existingEmail || existingMobile) throw new ApiError(409, 'Email ya mobile pehle se registered hai');

  const manager = await prisma.user.create({
    data: {
      fullName: String(fullName).trim(),
      email: String(email).trim().toLowerCase(),
      mobile: String(mobile).replace(/\s+/g, ''),
      passwordHash,
      role: 'MANAGER',
      status: 'ACTIVE',
      emailVerified: true,
      permissions: JSON.stringify(requested),
    },
    select: { id: true, fullName: true, email: true, mobile: true, role: true, status: true, permissions: true, createdAt: true },
  });
  await audit(req, 'MANAGER_CREATED', 'User', manager.id, { permissions: requested });
  return success(res, 201, 'Manager created', {
    manager: { ...manager, permissions: requested },
  });
});

const updateManager = asyncHandler(async (req, res) => {
  const manager = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!manager || manager.role !== 'MANAGER') throw new ApiError(404, 'Manager not found');

  const data = {};
  if (req.body.fullName != null) data.fullName = String(req.body.fullName).trim();
  if (req.body.status === 'ACTIVE' || req.body.status === 'SUSPENDED') data.status = req.body.status;
  if (Array.isArray(req.body.permissions)) {
    data.permissions = JSON.stringify(req.body.permissions.filter((p) => MANAGER_PERMISSIONS.includes(p)));
  }
  if (req.body.password) {
    if (String(req.body.password).length < 10) throw new ApiError(400, 'Password must be at least 10 characters');
    const bcrypt = require('bcryptjs');
    data.passwordHash = await bcrypt.hash(String(req.body.password), 12);
  }
  const updated = await prisma.user.update({
    where: { id: manager.id },
    data,
    select: { id: true, fullName: true, email: true, mobile: true, role: true, status: true, permissions: true, createdAt: true, lastLoginAt: true },
  });
  await audit(req, 'MANAGER_UPDATED', 'User', manager.id, { fields: Object.keys(data) });
  return success(res, 200, 'Manager updated', {
    manager: { ...updated, permissions: (() => { try { return JSON.parse(updated.permissions || '[]'); } catch (_) { return []; } })() },
  });
});


const listCustomers = asyncHandler(async (req,res) => { const users=await prisma.user.findMany({where:{role:'CUSTOMER'},select:{id:true,fullName:true,email:true,mobile:true,city:true,status:true,createdAt:true,lastLoginAt:true},orderBy:{createdAt:'desc'},take:300}); return success(res,200,'Customers fetched',{customers:users}); });
const listDrivers = asyncHandler(async (req,res) => {
  const drivers=await prisma.driverProfile.findMany({include:{user:{select:{id:true,fullName:true,email:true,mobile:true,city:true,status:true,createdAt:true}},vehicles:true},orderBy:{createdAt:'desc'},take:300});
  const userIds=drivers.map(d=>d.userId);
  const driverIds=drivers.map(d=>d.id);
  const [ratings,bookingGroups,tripGroups,proofGroups]=await Promise.all([
    prisma.rating.groupBy({by:['toUserId'],where:{toUserId:{in:userIds}},_avg:{rating:true},_count:{_all:true}}),
    prisma.booking.groupBy({by:['driverId','status'],where:{driverId:{in:driverIds}},_count:{_all:true}}),
    prisma.trip.groupBy({by:['driverId','status'],where:{driverId:{in:driverIds}},_count:{_all:true}}),
    prisma.deliveryProof.groupBy({by:['submittedById'],where:{submittedById:{in:userIds}},_count:{_all:true}}),
  ]);
  const enriched=drivers.map((driver)=>{
    const rating=ratings.find(r=>r.toUserId===driver.userId);
    const bs=bookingGroups.filter(r=>r.driverId===driver.id);
    const ts=tripGroups.filter(r=>r.driverId===driver.id);
    const bookingCount=bs.reduce((s,r)=>s+r._count._all,0);
    const accepted=bs.filter(r=>['ACCEPTED','COMPLETED'].includes(r.status)).reduce((s,r)=>s+r._count._all,0);
    const completed=bs.find(r=>r.status==='COMPLETED')?._count._all||0;
    const delivered=ts.find(r=>r.status==='DELIVERED')?._count._all||0;
    const proofs=proofGroups.find(r=>r.submittedById===driver.userId)?._count._all||0;
    const avg=rating?._avg.rating||null;
    const ratingComponent=avg==null?25:(avg/5)*50;
    const reliability=bookingCount?(accepted/bookingCount)*15:7.5;
    const completion=accepted?(completed/accepted)*20:10;
    const verification=driver.verification==='VERIFIED'?10:0;
    const proof=delivered?Math.min(1,proofs/delivered)*5:0;
    const trustScore=Math.round(Math.max(0,Math.min(100,ratingComponent+reliability+completion+verification+proof)));
    return {...driver,trustScore,trustMeta:{averageRating:avg?Math.round(avg*10)/10:null,ratingCount:rating?._count._all||0,completedTrips:delivered,deliveryProofs:proofs}};
  });
  return success(res,200,'Drivers fetched',{drivers:enriched});
});
const listLoads = asyncHandler(async (req,res) => { const loads=await prisma.load.findMany({include:{customer:{select:{id:true,fullName:true,mobile:true}},bookings:{select:{id:true,status:true,agreedFare:true}}},orderBy:{createdAt:'desc'},take:300}); return success(res,200,'Loads fetched',{loads}); });
const listBookings = asyncHandler(async (req,res) => { const bookings=await prisma.booking.findMany({include:{load:{select:{id:true,pickupAddress:true,destinationAddress:true,status:true,weightKg:true}},customer:{select:{id:true,fullName:true,mobile:true}},driver:{include:{user:{select:{id:true,fullName:true,mobile:true}}}},vehicle:{select:{id:true,vehicleNumber:true,vehicleType:true}},trip:{select:{id:true,status:true}}},orderBy:{createdAt:'desc'},take:300}); return success(res,200,'Bookings fetched',{bookings}); });
const listPayments = asyncHandler(async (req,res) => { const payments=await prisma.payment.findMany({include:{user:{select:{id:true,fullName:true,mobile:true}},trip:{select:{id:true,status:true}}},orderBy:{createdAt:'desc'},take:300}); return success(res,200,'Payments fetched',{payments}); });
const listTrips = asyncHandler(async (req,res) => { const trips=await prisma.trip.findMany({include:{load:{select:{id:true,pickupAddress:true,destinationAddress:true}},driver:{include:{user:{select:{id:true,fullName:true,mobile:true}}}},vehicle:{select:{id:true,vehicleNumber:true,vehicleType:true}},booking:{select:{id:true,status:true,agreedFare:true}}},orderBy:{createdAt:'desc'},take:300}); return success(res,200,'Trips fetched',{trips}); });
const reports = asyncHandler(async (req,res) => { const [usersByRole,loadStatus,bookingStatus,paymentStatus,revenue]=await Promise.all([prisma.user.groupBy({by:['role'],_count:{_all:true}}),prisma.load.groupBy({by:['status'],_count:{_all:true}}),prisma.booking.groupBy({by:['status'],_count:{_all:true}}),prisma.payment.groupBy({by:['status'],_count:{_all:true}}),prisma.payment.aggregate({where:{status:'PAID'},_sum:{amount:true}})]); return success(res,200,'Reports fetched',{usersByRole,loadStatus,bookingStatus,paymentStatus,revenue:revenue._sum.amount||0}); });
const unlockLocation = asyncHandler(async (req,res) => { const booking=await prisma.spaceBooking.findUnique({where:{id:req.params.id}}); if(!booking) throw new ApiError(404,'Space booking not found'); const updated=await prisma.spaceBooking.update({where:{id:booking.id},data:{exactPickupUnlocked:true}}); await audit(req,'LOCATION_UNLOCKED','SpaceBooking',booking.id,{}); return success(res,200,'Exact pickup location unlocked',{booking:updated}); });

const listDisputes = asyncHandler(async (req, res) => {
  const disputes = await prisma.dispute.findMany({
    include: { raisedBy: { select: { id: true, fullName: true, mobile: true, role: true } }, trip: { select: { id: true, pickup: true, destination: true, status: true } }, resolvedBy: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: 'desc' }, take: 300,
  });
  return success(res, 200, 'Disputes fetched', { disputes });
});

const updateDispute = asyncHandler(async (req, res) => {
  const dispute = await prisma.dispute.findUnique({ where: { id: req.params.id } });
  if (!dispute) throw new ApiError(404, 'Dispute not found');
  const status = String(req.body.status || '').toUpperCase();
  if (!['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'].includes(status)) throw new ApiError(422, 'Invalid dispute status');
  const resolution = req.body.resolution == null ? dispute.resolution : String(req.body.resolution).trim();
  if (['RESOLVED', 'REJECTED'].includes(status) && (!resolution || resolution.length < 5)) throw new ApiError(422, 'Resolution note is required');
  const updated = await prisma.dispute.update({
    where: { id: dispute.id },
    data: { status, resolution: resolution || null, resolvedById: ['RESOLVED', 'REJECTED'].includes(status) ? req.user.id : null, resolvedAt: ['RESOLVED', 'REJECTED'].includes(status) ? new Date() : null },
    include: { raisedBy: { select: { id: true, fullName: true } } },
  });
  await audit(req, 'DISPUTE_' + status, 'Dispute', dispute.id, { resolution: resolution || null });
  await notify(updated.raisedBy.id, 'SYSTEM', 'Dispute updated', 'Your dispute is now ' + status.replace('_', ' ').toLowerCase() + '.');
  return success(res, 200, 'Dispute updated', { dispute: updated });
});


module.exports = { managerAuditTimeline, setCustomerAccountStatus, setDriverAccountStatus, updateCustomer, updateLoad, updateBooking, updatePayment, listCustomers, listDrivers, listLoads, listBookings, listPayments, listTrips, reports, unlockLocation, listDisputes, updateDispute, dashboard, listUsers, pendingTransporters, verifyTransporter, rejectTransporter, suspendUser, listAuditLogs, paymentSummary, expiringDocuments, listManagers, createManager, updateManager, MANAGER_PERMISSIONS };
