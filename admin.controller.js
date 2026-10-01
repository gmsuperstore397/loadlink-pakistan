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
  const status=String(req.body.status || '').toUpperCase();
  if(!['PENDING','PAID','FAILED','CANCELLED','REFUNDED'].includes(status)) throw new ApiError(400,'Invalid payment status');
  const updated=await prisma.payment.update({
    where:{id:payment.id},
    data:{status, paidAt: status === 'PAID' ? (payment.paidAt || new Date()) : null}
  });
  await audit(req,'PAYMENT_'+status,'Payment',payment.id,{status});
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


const ROLE_DEFINITIONS = [
  { role: 'ADMIN', label: 'Admin', category: 'INTERNAL', publicSignup: false, dashboard: 'Full Admin Portal' },
  { role: 'MANAGER', label: 'Manager', category: 'INTERNAL', publicSignup: false, dashboard: 'Permission-based Admin Portal' },
  { role: 'CUSTOMER', label: 'Customer / Shipper', category: 'PUBLIC', publicSignup: true, dashboard: 'Customer Dashboard' },
  { role: 'DRIVER', label: 'Driver / Transporter', category: 'PUBLIC', publicSignup: true, dashboard: 'Driver Dashboard' },
  { role: 'FLEET_OWNER', label: 'Fleet Owner', category: 'PUBLIC_PROFESSIONAL', publicSignup: true, dashboard: 'Fleet Dashboard' },
  { role: 'DISPATCHER', label: 'Dispatcher', category: 'PROFESSIONAL', publicSignup: false, dashboard: 'Dispatch Dashboard' },
  { role: 'FREIGHT_BROKER', label: 'Freight Broker', category: 'PUBLIC_PROFESSIONAL', publicSignup: true, dashboard: 'Broker Dashboard' },
  { role: 'FREIGHT_FORWARDER', label: 'Freight Forwarder', category: 'PUBLIC_PROFESSIONAL', publicSignup: true, dashboard: 'Forwarder Dashboard' },
  { role: 'CUSTOMS_AGENT', label: 'Customs Agent', category: 'PUBLIC_PROFESSIONAL', publicSignup: true, dashboard: 'Customs Dashboard' },
  { role: 'PORT_AGENT', label: 'Port / Shipping Agent', category: 'PUBLIC_PROFESSIONAL', publicSignup: true, dashboard: 'Port Operations Dashboard' },
  { role: 'WAREHOUSE_OPERATOR', label: 'Warehouse Operator', category: 'PUBLIC_PROFESSIONAL', publicSignup: true, dashboard: 'Warehouse Dashboard' },
  { role: 'FINANCE', label: 'Finance Officer', category: 'INTERNAL', publicSignup: false, dashboard: 'Finance Dashboard' },
  { role: 'OPERATIONS', label: 'Operations Officer', category: 'INTERNAL', publicSignup: false, dashboard: 'Operations Dashboard' },
  { role: 'SUPPORT', label: 'Support Officer', category: 'INTERNAL', publicSignup: false, dashboard: 'Support Dashboard' },
];

const MANAGER_PERMISSIONS = [
  'dashboard.view',
  'customers.view', 'customers.create', 'customers.edit', 'customers.disable',
  'drivers.view', 'drivers.verify', 'drivers.documents', 'drivers.edit', 'drivers.disable',
  'fleet.view', 'fleet.edit', 'vehicles.view', 'vehicles.create', 'vehicles.edit', 'vehicles.disable',
  'loads.view', 'loads.create', 'loads.edit', 'loads.delete',
  'bookings.view', 'bookings.edit', 'deals.approve',
  'commission.view', 'commission.verify',
  'payments.view', 'payments.verify', 'payments.refund',
  'location.view', 'location.unlock',
  'trips.view', 'trips.edit',
  'dispatch.view', 'dispatch.assign',
  'brokers.view', 'forwarders.view', 'customs.view', 'ports.view', 'warehouses.view',
  'reports.view', 'reports.export',
  'disputes.view', 'disputes.resolve',
  'sos.view', 'sos.resolve',
  'support.view', 'support.resolve',
  'audit.view',
];

const ROLE_DEFAULT_PERMISSIONS = {
  MANAGER: [],
  DISPATCHER: ['dashboard.view','loads.view','bookings.view','trips.view','dispatch.view','dispatch.assign','vehicles.view'],
  FINANCE: ['dashboard.view','payments.view','payments.verify','commission.view','commission.verify','reports.view'],
  OPERATIONS: ['dashboard.view','loads.view','bookings.view','deals.approve','trips.view','trips.edit','dispatch.view','dispatch.assign','location.view','reports.view'],
  SUPPORT: ['dashboard.view','customers.view','drivers.view','loads.view','bookings.view','trips.view','disputes.view','disputes.resolve','sos.view','sos.resolve','support.view','support.resolve'],
  FLEET_OWNER: ['dashboard.view','fleet.view','fleet.edit','vehicles.view','vehicles.create','vehicles.edit','vehicles.disable','drivers.view','trips.view'],
  FREIGHT_BROKER: ['dashboard.view','customers.view','loads.view','bookings.view','deals.approve','drivers.view','fleet.view'],
  FREIGHT_FORWARDER: ['dashboard.view','loads.view','bookings.view','trips.view','reports.view'],
  CUSTOMS_AGENT: ['dashboard.view','loads.view','bookings.view','documents.view','customs.view'],
  PORT_AGENT: ['dashboard.view','loads.view','trips.view','ports.view'],
  WAREHOUSE_OPERATOR: ['dashboard.view','loads.view','trips.view','warehouses.view'],
  CUSTOMER: ['dashboard.view'],
  DRIVER: ['dashboard.view','vehicles.view','trips.view'],
};


const roleCatalog = asyncHandler(async (req, res) => {
  return success(res, 200, 'Role catalog', { roles: ROLE_DEFINITIONS, permissions: MANAGER_PERMISSIONS });
});

const listRoleAccounts = asyncHandler(async (req, res) => {
  const allowedRoles = ROLE_DEFINITIONS.filter((r) => r.role !== 'ADMIN').map((r) => r.role);
  const users = await prisma.user.findMany({
    where: { role: { in: allowedRoles } },
    select: { id: true, fullName: true, email: true, mobile: true, role: true, status: true, permissions: true, createdAt: true, lastLoginAt: true },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  return success(res, 200, 'Role accounts fetched', {
    accounts: users.map((u) => ({ ...u, permissions: (() => { try { return JSON.parse(u.permissions || '[]'); } catch (_) { return []; } })() })),
  });
});

const createRoleAccount = asyncHandler(async (req, res) => {
  const role = String(req.body.role || '').trim().toUpperCase();
  const definition = ROLE_DEFINITIONS.find((r) => r.role === role);
  if (!definition || role === 'ADMIN') throw new ApiError(400, 'Invalid role for account creation');
  const { fullName, email, mobile, password } = req.body;
  if (!fullName || !email || !mobile || !password) throw new ApiError(400, 'Name, email, mobile and password are required');
  if (String(password).length < 10) throw new ApiError(400, 'Password must be at least 10 characters');
  const existingEmail = await prisma.user.findUnique({ where: { email: String(email).trim().toLowerCase() } });
  const existingMobile = await prisma.user.findUnique({ where: { mobile: String(mobile).replace(/\s+/g, '') } });
  if (existingEmail || existingMobile) throw new ApiError(409, 'Email ya mobile pehle se registered hai');
  const bcrypt = require('bcryptjs');
  const requested = Array.isArray(req.body.permissions) ? req.body.permissions.filter((p) => MANAGER_PERMISSIONS.includes(p)) : [];
  const defaults = ROLE_DEFAULT_PERMISSIONS[role] || [];
  const permissions = role === 'MANAGER' ? requested : [...new Set(defaults.filter((p) => MANAGER_PERMISSIONS.includes(p)))];
  const user = await prisma.user.create({
    data: {
      fullName: String(fullName).trim(),
      email: String(email).trim().toLowerCase(),
      mobile: String(mobile).replace(/\s+/g, ''),
      passwordHash: await bcrypt.hash(String(password), 12),
      role,
      status: 'ACTIVE',
      emailVerified: true,
      permissions: JSON.stringify(permissions),
    },
    select: { id: true, fullName: true, email: true, mobile: true, role: true, status: true, permissions: true, createdAt: true },
  });
  await audit(req, 'ROLE_ACCOUNT_CREATED', 'User', user.id, { role, permissions });
  return success(res, 201, 'Role account created', { account: { ...user, permissions } });
});

const updateRoleAccount = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user || user.role === 'ADMIN') throw new ApiError(404, 'Role account not found');
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
    where: { id: user.id },
    data,
    select: { id: true, fullName: true, email: true, mobile: true, role: true, status: true, permissions: true, createdAt: true, lastLoginAt: true },
  });
  await audit(req, 'ROLE_ACCOUNT_UPDATED', 'User', user.id, { fields: Object.keys(data), role: user.role });
  return success(res, 200, 'Role account updated', {
    account: { ...updated, permissions: (() => { try { return JSON.parse(updated.permissions || '[]'); } catch (_) { return []; } })() },
  });
});

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
  const [ratings,bookingGroups,tripGroups,proofGroups,feedback]=await Promise.all([
    prisma.rating.groupBy({by:['toUserId'],where:{toUserId:{in:userIds}},_avg:{rating:true},_count:{_all:true}}),
    prisma.booking.groupBy({by:['driverId','status'],where:{driverId:{in:driverIds}},_count:{_all:true}}),
    prisma.trip.groupBy({by:['driverId','status'],where:{driverId:{in:driverIds}},_count:{_all:true}}),
    prisma.deliveryProof.groupBy({by:['submittedById'],where:{submittedById:{in:userIds}},_count:{_all:true}}),
    prisma.rating.findMany({where:{toUserId:{in:userIds}},include:{fromUser:{select:{fullName:true}}},orderBy:{createdAt:'desc'},take:500}),
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
    return {...driver,trustScore,trustMeta:{averageRating:avg?Math.round(avg*10)/10:null,ratingCount:rating?._count._all||0,completedTrips:delivered,deliveryProofs:proofs},recentFeedback:feedback.filter(r=>r.toUserId===driver.userId).slice(0,10).map(r=>({rating:r.rating,comment:r.comment,from:r.fromUser?.fullName||'Customer',createdAt:r.createdAt}))};
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
    include: { raisedBy: { select: { id: true, fullName: true, mobile: true, role: true } }, trip: { select: { id: true, pickup: true, destination: true, status: true, driver: { include: { user: { select: { id: true, fullName: true, mobile: true } } } } } }, resolvedBy: { select: { id: true, fullName: true } } },
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



const listSOSAlerts = asyncHandler(async (req, res) => {
  const status = req.query.status ? String(req.query.status).toUpperCase() : null;
  const alerts = await prisma.sOSAlert.findMany({
    where: status ? { status } : {},
    include: {
      raisedBy: { select: { id: true, fullName: true, mobile: true, role: true } },
      trip: { select: { id: true, pickup: true, destination: true, status: true, currentLatitude: true, currentLongitude: true, driver: { include: { user: { select: { id: true, fullName: true, mobile: true } } } } } },
      resolvedBy: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: 'desc' }, take: 300,
  });
  return success(res, 200, 'SOS alerts fetched', { alerts });
});

const updateSOSAlert = asyncHandler(async (req, res) => {
  const alert = await prisma.sOSAlert.findUnique({ where: { id: req.params.id } });
  if (!alert) throw new ApiError(404, 'SOS alert not found');
  const status = String(req.body.status || '').toUpperCase();
  if (!['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'CANCELLED'].includes(status)) throw new ApiError(422, 'Invalid SOS status');

  const data = { status };
  if (status === 'ACKNOWLEDGED' && !alert.acknowledgedAt) data.acknowledgedAt = new Date();
  if (['RESOLVED', 'CANCELLED'].includes(status)) {
    data.resolvedById = req.user.id;
    data.resolvedAt = new Date();
  }
  if (status === 'OPEN') {
    data.acknowledgedAt = null;
    data.resolvedById = null;
    data.resolvedAt = null;
  }

  const updated = await prisma.sOSAlert.update({
    where: { id: alert.id }, data,
    include: { raisedBy: { select: { id: true, fullName: true } }, trip: { select: { id: true } } },
  });
  await audit(req, 'SOS_' + status, 'SOSAlert', alert.id, { tripId: alert.tripId });
  if (status === 'ACKNOWLEDGED') await notify(updated.raisedBy.id, 'SYSTEM', 'SOS acknowledged', 'LoadLink team ne aapka SOS acknowledge kar liya hai.');
  if (status === 'RESOLVED') await notify(updated.raisedBy.id, 'SYSTEM', 'SOS resolved', 'Aapka SOS alert resolve mark kar diya gaya hai.');
  return success(res, 200, 'SOS alert updated', { alert: updated });
});

const dispatchOptions = asyncHandler(async (req, res) => {
  const [drivers, vehicles] = await Promise.all([
    prisma.driverProfile.findMany({
      where: { verification: 'VERIFIED', user: { status: 'ACTIVE', role: 'DRIVER' } },
      include: { user: { select: { id: true, fullName: true, mobile: true } } },
      orderBy: { user: { fullName: 'asc' } },
      take: 300,
    }),
    prisma.vehicle.findMany({
      where: { status: 'AVAILABLE', isVerified: true, driver: { verification: 'VERIFIED', user: { status: 'ACTIVE', role: 'DRIVER' } } },
      select: { id: true, vehicleNumber: true, vehicleType: true, capacityKg: true, driverId: true },
      orderBy: { vehicleNumber: 'asc' },
      take: 500,
    }),
  ]);
  return success(res, 200, 'Dispatch options fetched', {
    drivers: drivers.map(d => ({ id: d.id, userId: d.user.id, name: d.user.fullName, mobile: d.user.mobile })),
    vehicles,
  });
});

const assignBooking = asyncHandler(async (req, res) => {
  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: { load: true, trip: true },
  });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.trip) throw new ApiError(409, 'Booking already has an active trip');
  if (!['REQUESTED', 'ACCEPTED'].includes(booking.status)) throw new ApiError(409, 'Booking is not available for dispatch');

  const driverId = String(req.body.driverId || '').trim();
  const vehicleId = String(req.body.vehicleId || '').trim();
  if (!driverId || !vehicleId) throw new ApiError(400, 'Driver and vehicle are required');

  const [driver, vehicle] = await Promise.all([
    prisma.driverProfile.findUnique({ where: { id: driverId }, include: { user: true } }),
    prisma.vehicle.findUnique({ where: { id: vehicleId } }),
  ]);
  if (!driver || driver.verification !== 'VERIFIED' || driver.user.status !== 'ACTIVE' || driver.user.role !== 'DRIVER') {
    throw new ApiError(409, 'Selected driver is not available');
  }
  if (!vehicle || vehicle.driverId !== driver.id || vehicle.isVerified !== true || vehicle.status !== 'AVAILABLE') {
    throw new ApiError(409, 'Selected vehicle is not available for this driver');
  }

  const result = await prisma.$transaction(async (tx) => {
    const updatedBooking = await tx.booking.update({
      where: { id: booking.id },
      data: { driverId: driver.id, vehicleId: vehicle.id, status: 'ACCEPTED' },
    });
    await tx.load.update({ where: { id: booking.loadId }, data: { status: 'ASSIGNED' } });
    const trip = await tx.trip.create({
      data: {
        bookingId: booking.id,
        loadId: booking.loadId,
        driverId: driver.id,
        vehicleId: vehicle.id,
        pickup: booking.load.pickupAddress,
        destination: booking.load.destinationAddress,
        status: 'ASSIGNED',
      },
    });
    await tx.vehicle.update({ where: { id: vehicle.id }, data: { status: 'BUSY' } });
    return { booking: updatedBooking, trip };
  });

  await audit(req, 'DISPATCH_ASSIGNED', 'Booking', booking.id, { driverId: driver.id, vehicleId: vehicle.id, tripId: result.trip.id });
  await notify(driver.userId, 'BOOKING_ACCEPTED', 'Booking assigned', 'Aapko LoadLink par ek booking assign ki gayi hai.');
  await notify(booking.customerId, 'BOOKING_ACCEPTED', 'Booking assigned', 'Aapki booking driver aur vehicle ko assign kar di gayi hai.');
  return success(res, 200, 'Booking dispatched successfully', result);
});


// PATCH /api/admin/operations/bookings/:id/approve
const approveDeal = asyncHandler(async (req, res) => {
  const booking = await prisma.booking.findUnique({ where: { id: req.params.id }, include: { load: true } });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (!['REQUESTED','ACCEPTED'].includes(booking.status)) throw new ApiError(409, 'Booking is not pending approval');
  const updated = await prisma.booking.update({ where: { id: booking.id }, data: { status: 'ACCEPTED' } });
  await prisma.load.update({ where: { id: booking.loadId }, data: { status: 'ASSIGNED' } });
  await audit(req, 'DEAL_APPROVED', 'Booking', booking.id, { loadId: booking.loadId });
  await notify(booking.customerId, 'BOOKING_ACCEPTED', 'Deal approved', 'LoadLink Operations ne aapki deal approve kar di hai.');
  return success(res, 200, 'Deal approved', { booking: updated });
});

// PATCH /api/admin/operations/trips/:id
const operationalTripUpdate = asyncHandler(async (req, res) => {
  const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
  if (!trip) throw new ApiError(404, 'Trip not found');
  const allowed = ['ASSIGNED','PICKED_UP','IN_TRANSIT','NEAR_DESTINATION','DELIVERED'];
  const status = String(req.body.status || '').toUpperCase();
  if (!allowed.includes(status)) throw new ApiError(400, 'Invalid trip status');
  if (status === 'DELIVERED') {
    const updated = await prisma.$transaction(async (tx) => {
      const t = await tx.trip.update({ where: { id: trip.id }, data: { status, completedAt: new Date(), trackingEnabled: false } });
      await tx.booking.update({ where: { id: trip.bookingId }, data: { status: 'COMPLETED' } });
      await tx.load.update({ where: { id: trip.loadId }, data: { status: 'DELIVERED' } });
      await tx.vehicle.update({ where: { id: trip.vehicleId }, data: { status: 'AVAILABLE' } });
      return t;
    });
    await audit(req, 'TRIP_DELIVERED_BY_OPERATIONS', 'Trip', trip.id, { status });
    await notify((await prisma.load.findUnique({where:{id:trip.loadId}})).customerId, 'TRIP_DELIVERED', 'Trip delivered', 'Trip ko Operations ne delivered mark kiya hai.');
    return success(res, 200, 'Trip delivered', { trip: updated });
  }
  const data = { status };
  if (status === 'PICKED_UP' && !trip.startedAt) data.startedAt = new Date();
  const updated = await prisma.trip.update({ where: { id: trip.id }, data });
  await audit(req, 'TRIP_STATUS_UPDATED_BY_OPERATIONS', 'Trip', trip.id, { status });
  return success(res, 200, 'Trip status updated', { trip: updated });
});

const roleWorkspace = asyncHandler(async (req, res) => {
  const role = req.user.role;
  const workspace = {
    role,
    title: {
      MANAGER: 'Manager Operations',
      FLEET_OWNER: 'Fleet Operations',
      DISPATCHER: 'Dispatch Control',
      FREIGHT_BROKER: 'Broker Workspace',
      FREIGHT_FORWARDER: 'Forwarder Workspace',
      CUSTOMS_AGENT: 'Customs Operations',
      PORT_AGENT: 'Port Operations',
      WAREHOUSE_OPERATOR: 'Warehouse Operations',
      FINANCE: 'Finance Operations',
      OPERATIONS: 'Operations Control',
      SUPPORT: 'Support Desk',
      ADMIN: 'Admin Operations',
    }[role] || 'Operations Workspace',
    metrics: {},
    rows: [],
  };

  if (role === 'FLEET_OWNER') {
    const [vehicles, trips, drivers] = await Promise.all([
      prisma.vehicle.findMany({
        include: { driver: { include: { user: { select: { id: true, fullName: true, mobile: true, status: true } } } } },
        orderBy: { updatedAt: 'desc' }, take: 200,
      }),
      prisma.trip.findMany({
        include: { driver: { include: { user: { select: { fullName: true } } } }, vehicle: { select: { vehicleNumber: true, vehicleType: true } } },
        orderBy: { updatedAt: 'desc' }, take: 100,
      }),
      prisma.user.count({ where: { role: 'DRIVER', status: 'ACTIVE' } }),
    ]);
    workspace.metrics = { vehicles: vehicles.length, activeVehicles: vehicles.filter(v => v.status === 'AVAILABLE').length, activeDrivers: drivers, activeTrips: trips.filter(t => t.status !== 'DELIVERED').length };
    workspace.rows = vehicles.map(v => ({ id: v.id, vehicleNumber: v.vehicleNumber, vehicleType: v.vehicleType, capacityKg: v.capacityKg, status: v.status, driver: v.driver?.user?.fullName || '—', driverStatus: v.driver?.user?.status || '—' }));
  } else if (role === 'DISPATCHER') {
    const [bookings, trips, loads] = await Promise.all([
      prisma.booking.findMany({ include: { load: { select: { pickupAddress: true, destinationAddress: true } }, customer: { select: { fullName: true } }, driver: { include: { user: { select: { fullName: true } } } }, vehicle: { select: { vehicleNumber: true } } }, orderBy: { updatedAt: 'desc' }, take: 200 }),
      prisma.trip.findMany({ include: { load: { select: { id: true } }, driver: { include: { user: { select: { fullName: true } } } }, vehicle: { select: { vehicleNumber: true } } }, orderBy: { updatedAt: 'desc' }, take: 100 }),
      prisma.load.count({ where: { status: { in: ['POSTED','SEARCHING','ASSIGNED','PICKED_UP','IN_TRANSIT'] } } }),
    ]);
    workspace.metrics = { pendingLoads: loads, bookings: bookings.length, activeTrips: trips.filter(t => t.status !== 'DELIVERED').length };
    workspace.rows = bookings.map(b => ({ id: b.id, type: 'BOOKING', status: b.status, pickup: b.load?.pickupAddress, destination: b.load?.destinationAddress, customer: b.customer?.fullName, driver: b.driver?.user?.fullName, vehicle: b.vehicle?.vehicleNumber }));
  } else if (role === 'FINANCE') {
    const [payments, paid, pending] = await Promise.all([
      prisma.payment.findMany({ include: { user: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' }, take: 200 }),
      prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
      prisma.payment.count({ where: { status: 'PENDING' } }),
    ]);
    workspace.metrics = { payments: payments.length, paidAmount: paid._sum.amount || 0, pendingPayments: pending };
    workspace.rows = payments.map(p => ({ id: p.id, amount: p.amount, currency: p.currency, method: p.method, status: p.status, user: p.user?.fullName, date: p.createdAt }));
  } else if (role === 'SUPPORT') {
    const [disputes, sos, suspended] = await Promise.all([
      prisma.dispute.findMany({ include: { raisedBy: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' }, take: 150 }),
      prisma.sOSAlert.findMany({ include: { raisedBy: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' }, take: 150 }),
      prisma.user.count({ where: { status: 'SUSPENDED' } }),
    ]);
    workspace.metrics = { disputes: disputes.length, openDisputes: disputes.filter(d => d.status !== 'RESOLVED' && d.status !== 'REJECTED').length, sosAlerts: sos.filter(a => a.status !== 'RESOLVED' && a.status !== 'CANCELLED').length, suspendedAccounts: suspended };
    workspace.rows = disputes.map(d => ({ id: d.id, type: 'DISPUTE', status: d.status, category: d.category, raisedBy: d.raisedBy?.fullName, createdAt: d.createdAt }))
      .concat(sos.map(a => ({ id: a.id, type: 'SOS', status: a.status, category: a.type, raisedBy: a.raisedBy?.fullName, createdAt: a.createdAt })));
  } else {
    const [loads, bookings, trips] = await Promise.all([
      prisma.load.findMany({ include: { customer: { select: { fullName: true } } }, orderBy: { updatedAt: 'desc' }, take: 100 }),
      prisma.booking.findMany({ include: { customer: { select: { fullName: true } }, driver: { include: { user: { select: { fullName: true } } } }, vehicle: { select: { vehicleNumber: true } } } }, orderBy: { updatedAt: 'desc' }, take: 100 }),
      prisma.trip.findMany({ include: { driver: { include: { user: { select: { fullName: true } } } }, vehicle: { select: { vehicleNumber: true } } }, orderBy: { updatedAt: 'desc' }, take: 100 }),
    ]);
    workspace.metrics = { loads: loads.length, bookings: bookings.length, activeTrips: trips.filter(t => t.status !== 'DELIVERED').length };
    workspace.rows = loads.map(l => ({ id: l.id, type: 'LOAD', status: l.status, pickup: l.pickupAddress, destination: l.destinationAddress, customer: l.customer?.fullName }))
      .concat(bookings.map(b => ({ id: b.id, type: 'BOOKING', status: b.status, customer: b.customer?.fullName, driver: b.driver?.user?.fullName, vehicle: b.vehicle?.vehicleNumber })))
      .concat(trips.map(t => ({ id: t.id, type: 'TRIP', status: t.status, driver: t.driver?.user?.fullName, vehicle: t.vehicle?.vehicleNumber, pickup: t.pickup, destination: t.destination })));
  }

  return success(res, 200, 'Role workspace fetched', { workspace });
});

module.exports = { approveDeal, operationalTripUpdate, ROLE_DEFINITIONS, roleCatalog, dispatchOptions, assignBooking, listSOSAlerts, updateSOSAlert, managerAuditTimeline, setCustomerAccountStatus, setDriverAccountStatus, updateCustomer, updateLoad, updateBooking, updatePayment, listCustomers, listDrivers, listLoads, listBookings, listPayments, listTrips, reports, unlockLocation, listDisputes, updateDispute, dashboard, roleWorkspace, listUsers, pendingTransporters, verifyTransporter, rejectTransporter, suspendUser, listAuditLogs, paymentSummary, expiringDocuments, listManagers, createManager, updateManager, MANAGER_PERMISSIONS };
