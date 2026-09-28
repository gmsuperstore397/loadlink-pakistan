const prisma = require('./prisma');
const asyncHandler = require('./asyncHandler');
const { success } = require('./apiResponse');
const ApiError = require('./ApiError');
const notify = require('./notification.service');

const listSpaceListings = asyncHandler(async (req, res) => {
  const { from, to, date } = req.query;
  const where = { status: 'OPEN', availableWeightKg: { gt: 0 } };
  if (from) where.fromLocation = { contains: from, mode: 'insensitive' };
  if (to) where.toLocation = { contains: to, mode: 'insensitive' };
  if (date) { const start = new Date(date); const end = new Date(start); end.setDate(end.getDate() + 1); where.travelDate = { gte: start, lt: end }; }
  const listings = await prisma.spaceListing.findMany({ where, include: { vehicle: true, driver: { include: { user: { select: { id: true, fullName: true, city: true } } } } }, orderBy: { travelDate: 'asc' }, take: 100 });
  return success(res, 200, 'Available vehicle space fetched', { listings });
});

const listSpaceRequests = asyncHandler(async (req, res) => {
  const { pickup, destination, date } = req.query;
  const where = { status: 'OPEN' };
  if (pickup) where.pickupLocation = { contains: pickup, mode: 'insensitive' };
  if (destination) where.destination = { contains: destination, mode: 'insensitive' };
  if (date) { const start = new Date(date); const end = new Date(start); end.setDate(end.getDate() + 1); where.travelDate = { gte: start, lt: end }; }
  const requests = await prisma.spaceRequest.findMany({ where, include: { customer: { select: { id: true, fullName: true, city: true } } }, orderBy: { travelDate: 'asc' }, take: 100 });
  return success(res, 200, 'Cargo space requests fetched', { requests });
});

const createSpaceListing = asyncHandler(async (req, res) => {
  if (!req.user.driverProfile) throw new ApiError(403, 'Driver profile required');
  const { vehicleId, fromLocation, toLocation, travelDate, totalCapacityKg, availableWeightKg, cargoType, expectedCharges, exactPickupAddress, exactPickupLatitude, exactPickupLongitude } = req.body;
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle || vehicle.driverId !== req.user.driverProfile.id) throw new ApiError(400, 'Invalid vehicle');
  if (!vehicle.isVerified) throw new ApiError(403, 'Vehicle must be verified before posting space');
  const total = Number(totalCapacityKg); const available = Number(availableWeightKg);
  if (!fromLocation || !toLocation || !travelDate || !Number.isFinite(total) || total <= 0 || !Number.isFinite(available) || available <= 0 || available > total) throw new ApiError(422, 'Valid route, date, total capacity and available space are required');
  const listing = await prisma.spaceListing.create({ data: { driverId: req.user.driverProfile.id, vehicleId, fromLocation, toLocation, travelDate: new Date(travelDate), totalCapacityKg: total, availableWeightKg: available, cargoType: cargoType || null, expectedCharges: expectedCharges ? Number(expectedCharges) : null, exactPickupAddress: exactPickupAddress || null, exactPickupLatitude: exactPickupLatitude != null ? Number(exactPickupLatitude) : null, exactPickupLongitude: exactPickupLongitude != null ? Number(exactPickupLongitude) : null } });
  return success(res, 201, 'Vehicle space posted', { listing });
});

const createSpaceRequest = asyncHandler(async (req, res) => {
  const { pickupLocation, destination, travelDate, cargoWeightKg, cargoType, vehicleRequirement, expectedBudget, description } = req.body;
  const weight = Number(cargoWeightKg);
  if (!pickupLocation || !destination || !travelDate || !Number.isFinite(weight) || weight <= 0) throw new ApiError(422, 'Pickup, destination, date and cargo weight are required');
  const request = await prisma.spaceRequest.create({ data: { customerId: req.user.id, pickupLocation, destination, travelDate: new Date(travelDate), cargoWeightKg: weight, cargoType: cargoType || null, vehicleRequirement: vehicleRequirement || null, expectedBudget: expectedBudget ? Number(expectedBudget) : null, description: description || null } });
  return success(res, 201, 'Cargo space request posted', { request });
});

const matchListings = asyncHandler(async (req, res) => {
  const request = await prisma.spaceRequest.findUnique({ where: { id: req.params.id } });
  if (!request) throw new ApiError(404, 'Space request not found');
  if (request.customerId !== req.user.id) throw new ApiError(403, 'Not your space request');
  const start = new Date(request.travelDate); start.setDate(start.getDate() - 1); const end = new Date(request.travelDate); end.setDate(end.getDate() + 2);
  const listings = await prisma.spaceListing.findMany({ where: { status: 'OPEN', availableWeightKg: { gte: request.cargoWeightKg }, fromLocation: { contains: request.pickupLocation, mode: 'insensitive' }, toLocation: { contains: request.destination, mode: 'insensitive' }, travelDate: { gte: start, lt: end } }, include: { vehicle: true, driver: { include: { user: { select: { fullName: true, city: true } } } } }, orderBy: { travelDate: 'asc' } });
  return success(res, 200, 'Matching vehicle spaces fetched', { listings });
});

const createSpaceBooking = asyncHandler(async (req, res) => {
  const listing = await prisma.spaceListing.findUnique({ where: { id: req.body.spaceListingId } });
  const request = await prisma.spaceRequest.findUnique({ where: { id: req.body.spaceRequestId } });
  if (!listing || !request) throw new ApiError(404, 'Space listing/request not found');
  if (request.customerId !== req.user.id) throw new ApiError(403, 'Not your space request');
  if (listing.driverId === req.user.driverProfile?.id) throw new ApiError(400, 'You cannot book your own space');
  if (listing.status !== 'OPEN' || request.status !== 'OPEN') throw new ApiError(400, 'Space is no longer available');
  if (request.cargoWeightKg > listing.availableWeightKg) throw new ApiError(400, 'Remaining space is not enough');
  const duplicate = await prisma.spaceBooking.findFirst({ where: { spaceListingId: listing.id, spaceRequestId: request.id, status: 'REQUESTED' } });
  if (duplicate) throw new ApiError(400, 'Booking request already sent');
  const booking = await prisma.spaceBooking.create({ data: { spaceListingId: listing.id, spaceRequestId: request.id, customerId: req.user.id, driverId: listing.driverId, vehicleId: listing.vehicleId, bookedWeightKg: request.cargoWeightKg } });
  const driver = await prisma.driverProfile.findUnique({ where: { id: listing.driverId } });
  await notify(driver.userId, 'BOOKING_REQUEST', 'New space booking request', request.pickupLocation + ' → ' + request.destination + ': ' + request.cargoWeightKg + ' kg cargo request.');
  return success(res, 201, 'Space booking request sent', { booking });
});

const mySpaceBookings = asyncHandler(async (req, res) => {
  const where = req.user.role === 'DRIVER' && req.user.driverProfile ? { driverId: req.user.driverProfile.id } : { customerId: req.user.id };
  const bookings = await prisma.spaceBooking.findMany({ where, include: { spaceListing: { include: { vehicle: true } }, spaceRequest: true, driver: { include: { user: true } }, customer: true }, orderBy: { createdAt: 'desc' } });
  return success(res, 200, 'Space bookings fetched', { bookings });
});

const acceptSpaceBooking = asyncHandler(async (req, res) => {
  const booking = await prisma.spaceBooking.findUnique({ where: { id: req.params.id }, include: { spaceListing: true, spaceRequest: true } });
  if (!booking) throw new ApiError(404, 'Space booking not found');
  if (!req.user.driverProfile || booking.driverId !== req.user.driverProfile.id) throw new ApiError(403, 'Not your booking');
  if (req.user.driverProfile.verification !== 'VERIFIED') throw new ApiError(403, 'Your account must be verified before accepting bookings');
  const agreedFare = req.body.agreedFare !== undefined && req.body.agreedFare !== '' ? Number(req.body.agreedFare) : null;
  if (agreedFare !== null && (!Number.isFinite(agreedFare) || agreedFare <= 0)) throw new ApiError(422, 'Invalid agreed fare');
  const updated = await prisma.$transaction(async (tx) => {
    const fresh = await tx.spaceBooking.findUnique({ where: { id: booking.id } });
    if (!fresh || fresh.status !== 'REQUESTED') throw new ApiError(400, 'Booking is no longer pending');
    const changed = await tx.spaceListing.updateMany({ where: { id: fresh.spaceListingId, status: 'OPEN', availableWeightKg: { gte: fresh.bookedWeightKg } }, data: { availableWeightKg: { decrement: fresh.bookedWeightKg } } });
    if (changed.count !== 1) throw new ApiError(400, 'Remaining space is not enough');
    const listingAfter = await tx.spaceListing.findUnique({ where: { id: fresh.spaceListingId } });
    if (listingAfter.availableWeightKg <= 0) await tx.spaceListing.update({ where: { id: fresh.spaceListingId }, data: { status: 'FULL' } });
    return tx.spaceBooking.update({ where: { id: fresh.id }, data: { status: 'ACCEPTED', agreedFare, exactPickupUnlocked: true } });
  });
  await notify(booking.customerId, 'BOOKING_ACCEPTED', 'Space booking accepted', 'Driver ne aapki cargo space booking accept kar li hai. Exact pickup location ab unlock ho gayi hai.');
  return success(res, 200, 'Space booking accepted and space reduced', { booking: updated });
});

const rejectSpaceBooking = asyncHandler(async (req, res) => {
  const booking = await prisma.spaceBooking.findUnique({ where: { id: req.params.id } });
  if (!booking) throw new ApiError(404, 'Space booking not found');
  if (!req.user.driverProfile || booking.driverId !== req.user.driverProfile.id) throw new ApiError(403, 'Not your booking');
  if (booking.status !== 'REQUESTED') throw new ApiError(400, 'Booking is no longer pending');
  await prisma.spaceBooking.update({ where: { id: booking.id }, data: { status: 'REJECTED' } });
  await notify(booking.customerId, 'BOOKING_REJECTED', 'Space booking rejected', 'Driver ne space request accept nahi ki.');
  return success(res, 200, 'Space booking rejected');
});

const getSpaceBooking = asyncHandler(async (req, res) => {
  const booking = await prisma.spaceBooking.findUnique({ where: { id: req.params.id }, include: { spaceListing: { include: { vehicle: true } }, spaceRequest: true, driver: { include: { user: true } }, customer: true } });
  if (!booking) throw new ApiError(404, 'Space booking not found');
  if (booking.customerId !== req.user.id && booking.driver.userId !== req.user.id && req.user.role !== 'ADMIN') throw new ApiError(403, 'Not allowed');
  if (booking.status !== 'ACCEPTED') { booking.spaceListing.exactPickupAddress = null; booking.spaceListing.exactPickupLatitude = null; booking.spaceListing.exactPickupLongitude = null; }
  return success(res, 200, 'Space booking fetched', { booking });
});

module.exports = { listSpaceListings, listSpaceRequests, createSpaceListing, createSpaceRequest, matchListings, createSpaceBooking, mySpaceBookings, acceptSpaceBooking, rejectSpaceBooking, getSpaceBooking };