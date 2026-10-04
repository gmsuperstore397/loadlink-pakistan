const bcrypt = require('bcryptjs');
const prisma = require('./prisma');
const asyncHandler = require('./asyncHandler');
const { success } = require('./apiResponse');
const { signToken } = require('./jwt');
const { sanitizeUser } = require('./sanitizeUser');
const { randomInt } = require('crypto');
const { hashToken, sendOtpEmail } = require('./delivery.service');
const ApiError = require('./ApiError');
const { generateReferralCode, attachReferral, validateReferralCode } = require('./referral.service');

// POST /api/transporters/register  (driver account only; vehicles are added separately)
const registerTransporter = asyncHandler(async (req, res) => {
  const {
    fullName, mobile, email, city, password,
    cnic, drivingLicense, cnicExpiryDate, licenseExpiryDate, referralCode,
  } = req.body;

  const normalizedMobile = String(mobile || '').replace(/\s+/g, '');
  const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
  if (referralCode) await validateReferralCode(referralCode);

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { mobile: normalizedMobile },
        ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
      ],
    },
    include: { driverProfile: { include: { vehicles: true } } },
  });

  // If the first signup created the driver before email delivery failed,
  // allow the same unverified driver to continue instead of saying "already registered".
  const reusableDriver = existingUser &&
    existingUser.role === 'DRIVER' &&
    !existingUser.emailVerified;

  if (existingUser) {
    console.log('DRIVER_SIGNUP_EXISTING_ACCOUNT', JSON.stringify({
      role: existingUser.role,
      emailVerified: !!existingUser.emailVerified,
      hasDriverProfile: !!existingUser.driverProfile,
      hasVehicle: !!existingUser.driverProfile?.vehicles?.length,
    }));
  }

  const cnicDocUrl = req.files?.cnicDoc?.[0] ? `/api/documents/${req.files.cnicDoc[0].filename}` : null;
  const licenseDocUrl = req.files?.licenseDoc?.[0] ? `/api/documents/${req.files.licenseDoc[0].filename}` : null;

  let user;

  if (reusableDriver && existingUser.driverProfile) {
    const passwordHash = await bcrypt.hash(password, 10);
    user = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        fullName,
        mobile: normalizedMobile,
        email: normalizedEmail,
        city,
        passwordHash,
        status: 'ACTIVE',
        driverProfile: {
          update: {
            cnic,
            drivingLicense,
            cnicDocUrl: cnicDocUrl || undefined,
            licenseDocUrl: licenseDocUrl || undefined,
            cnicExpiryDate: cnicExpiryDate ? new Date(cnicExpiryDate) : null,
            licenseExpiryDate: licenseExpiryDate ? new Date(licenseExpiryDate) : null,
          },
        },
      },
      include: { driverProfile: { include: { vehicles: true } } },
    });
  } else if (existingUser) {
    if (existingUser.role === 'DRIVER' && existingUser.emailVerified) {
      throw new ApiError(409, 'Driver account already exists. Please login instead of signing up again.');
    }
    if (existingUser.role === 'CUSTOMER') {
      const passwordHash = await bcrypt.hash(password, 10);
      user = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          fullName,
          mobile: normalizedMobile,
          email: normalizedEmail,
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
            },
          },
        },
        include: { driverProfile: { include: { vehicles: true } } },
      });
    } else {
      throw new ApiError(409, 'Mobile or email is already registered');
    }
  } else {
    const passwordHash = await bcrypt.hash(password, 10);
    user = await prisma.user.create({
      data: {
        fullName,
        mobile: normalizedMobile,
        email: normalizedEmail,
        city,
        passwordHash,
        role: 'DRIVER',
        referralCode: await generateReferralCode(fullName),
        driverProfile: {
          create: {
            cnic,
            cnicDocUrl,
            drivingLicense,
            cnicExpiryDate: cnicExpiryDate ? new Date(cnicExpiryDate) : null,
            licenseExpiryDate: licenseExpiryDate ? new Date(licenseExpiryDate) : null,
            licenseDocUrl,
            verification: 'PENDING_VERIFICATION',
          },
        },
      },
      include: { driverProfile: { include: { vehicles: true } } },
    });
  }


  if (referralCode) await attachReferral(user.id, referralCode);

  const otp = String(randomInt(100000, 1000000));
  await prisma.otpVerification.deleteMany({
    where: { userId: user.id, purpose: 'SIGNUP', usedAt: null },
  });
  await prisma.otpVerification.create({
    data: {
      userId: user.id,
      purpose: 'SIGNUP',
      codeHash: hashToken(otp),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  const sent = user.email ? await sendOtpEmail(user.email, otp).catch(() => false) : false;
  const devOtpMode = String(process.env.OTP_DEV_MODE || '').toLowerCase() === 'true';

  return success(res, 201, sent
    ? 'Driver account created. OTP sent to email.'
    : 'Driver account created. Email OTP is not configured yet.', {
    verificationRequired: true,
    otpDeliveryConfigured: sent,
    user: sanitizeUser(user),
    ...(devOtpMode && !sent ? { developmentOtp: otp } : {}),
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
