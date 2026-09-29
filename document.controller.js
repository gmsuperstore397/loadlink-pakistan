'use strict';

const fs = require('fs');
const path = require('path');
const prisma = require('./prisma');
const asyncHandler = require('./asyncHandler');
const ApiError = require('./ApiError');
const { hasPermission } = require('./auth');

const UPLOADS_DIR = path.resolve(__dirname, 'uploads');

function requestedFilename(value) {
  const filename = path.basename(String(value || ''));
  if (!filename || filename !== String(value || '') || filename.includes('\\') || filename.includes('..')) {
    throw new ApiError(400, 'Invalid document filename');
  }
  return filename;
}

function storedUrl(filename) {
  return '/api/documents/' + filename;
}

// GET /api/documents/:filename
// Private document endpoint. Access is granted only to the owning user,
// the relevant customer/driver, ADMIN, or a MANAGER with document-related view permission.
const getPrivateDocument = asyncHandler(async (req, res) => {
  const filename = requestedFilename(req.params.filename);
  const url = storedUrl(filename);

  const [driverDoc, vehicleDoc, proof] = await Promise.all([
    prisma.driverProfile.findFirst({
      where: { OR: [{ cnicDocUrl: url }, { licenseDocUrl: url }] },
      select: { userId: true },
    }),
    prisma.vehicle.findFirst({
      where: { documentUrl: url },
      select: { driver: { select: { userId: true } } },
    }),
    prisma.deliveryProof.findFirst({
      where: { OR: [{ photoUrl: url }, { signatureUrl: url }] },
      select: {
        submittedById: true,
        trip: {
          select: {
            driver: { select: { userId: true } },
            load: { select: { customerId: true } },
          },
        },
      },
    }),
  ]);

  if (!driverDoc && !vehicleDoc && !proof) {
    throw new ApiError(404, 'Document not found');
  }

  const userId = req.user.id;
  const isAdmin = req.user.role === 'ADMIN';
  const isManager = req.user.role === 'MANAGER' && (
    hasPermission(req.user, 'drivers.view') ||
    hasPermission(req.user, 'vehicles.view') ||
    hasPermission(req.user, 'trips.view')
  );
  const isDriverOwner =
    driverDoc?.userId === userId ||
    vehicleDoc?.driver?.userId === userId ||
    proof?.submittedById === userId ||
    proof?.trip?.driver?.userId === userId;
  const isCustomerOwner = proof?.trip?.load?.customerId === userId;

  if (!isAdmin && !isManager && !isDriverOwner && !isCustomerOwner) {
    throw new ApiError(403, 'You do not have permission to view this document');
  }

  const filePath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filePath)) throw new ApiError(404, 'Document file not found');

  return res.sendFile(filename, { root: UPLOADS_DIR });
});

module.exports = { getPrivateDocument };
