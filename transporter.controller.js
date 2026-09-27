const bcrypt = require('bcryptjs');
const prisma = require('./prisma');
const asyncHandler = require('./asyncHandler');
const { success } = require('./apiResponse');
const { signToken } = require('./jwt');
const { sanitizeUser } = require('./sanitizeUser');
const ApiError = require('./ApiError');

// POST /api/transporters/register  (driver + first vehicle, in one step)
const registerTransporter = asyncHandler(async (req, res) => {
  const {
    fullName, mobile, city, password,
    cnic, drivingLicense, cnicExpiryDate, licenseExpiryDate,
    vehicleType, vehicleNumber, capacityKg, brand, model, year,
  } = req.body;

  const existingUser = await prisma.user.findUnique({ where: { mobile } });
  if (existingUser) throw new ApiError(409, 'Mobile number is already registered');

  const existingVehicle = await prisma.vehicle.findUnique({ where: { vehicleNumber } });
  if (existingVehicle) throw new ApiError(409, 'A vehicle with this number is already registered');

  // req.files (multer.fields) may carry cnicDoc / licenseDoc / vehicleDoc
  const cnicDocUrl = req.files?.cnicDoc?.[0] ? `/uploads/${req.files.cnicDoc[0].filename}` : null;
  const licenseDocUrl = req.files?.licenseDoc?.[0] ? `/uploads/${req.files.licenseDoc[0].filename}` : null;
  const vehicleDocUrl = req.files?.vehicleDoc?.[0] ? `/uploads/${req.files.vehicleDoc[0].filename}` : null;

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      fullName,
      mobile,
      city,
      passwordHash,
      role: 'DRIVER',
      driverProfile: {
        create: {
          cnic,
          cnicDocUrl,
          drivingLicense,
          cnicExpiryDate: cnicExpiryDate ? new Date(cnicExpiryDate) : null,
          licenseExpiryDate: licenseExpiryDate ? new Date(licenseExpiryDate) : null,
          licenseDocUrl,
          verification: 'PENDING_VERIFICATION',
          vehicles: {
            create: {
              vehicleType,
              vehicleNumber,
              capacityKg: Number(capacityKg),
              brand: brand || null,
              model: model || null,
              year: year ? Number(year) : null,
              documentUrl: vehicleDocUrl,
              status: 'OFFLINE',
              isVerified: false,
            },
          },
        },
      },
    },
    include: { driverProfile: { include: { vehicles: true } } },
  });

  const token = signToken({ id: user.id, role: user.role });
  return success(res, 201, 'Driver account created. Pending admin verification.', {
    token,
    user: sanitizeUser(user),
  });
});

// GET /api/transporters/:id
const getTransporter = asyncHandler(async (req, res) => {
  const driver = await prisma.driverProfile.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { id: true, fullName: true, city: true, mobile: true } },
      vehicles: true,
    },
  });
  if (!driver) throw new ApiError(404, 'Transporter not found');
  return success(res, 200, 'Transporter fetched', { driver });
});

module.exports = { registerTransporter, getTransporter };
