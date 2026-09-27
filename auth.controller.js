const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { randomToken, hashToken, sendEmail, sendSms, sendOtpSms } = require('./delivery.service');
const prisma = require('./prisma');
const asyncHandler = require('./asyncHandler');
const { success, fail } = require('./apiResponse');
const { signToken } = require('./jwt');
const { sanitizeUser } = require('./sanitizeUser');
const ApiError = require('./ApiError');

// POST /api/auth/register  (customer registration)
const register = asyncHandler(async (req, res) => {
  const { fullName, mobile, email, password, city } = req.body;

  const existing = await prisma.user.findFirst({
    where: { OR: [{ mobile }, ...(email ? [{ email }] : [])] },
  });
  if (existing) throw new ApiError(409, 'Mobile or email is already registered');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { fullName, mobile, email: email || null, passwordHash, city, role: 'CUSTOMER' },
  });

  const otp = String(crypto.randomInt(100000, 1000000));
  await prisma.otpVerification.deleteMany({ where: { userId: user.id, purpose: 'SIGNUP', usedAt: null } });
  await prisma.otpVerification.create({
    data: { userId: user.id, purpose: 'SIGNUP', codeHash: hashToken(otp), expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
  });
  const sent = await sendOtpSms(user.mobile, otp).catch(() => false);
  return success(res, 201, sent ? 'OTP sent to your mobile number' : 'Account created. OTP SMS is not configured yet.', {
    verificationRequired: true,
    otpDeliveryConfigured: sent,
    user: sanitizeUser(user),
    ...(process.env.NODE_ENV !== 'production' && !sent ? { developmentOtp: otp } : {}),
  });
});

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { mobile, email, password } = req.body;
  if (!mobile && !email) throw new ApiError(400, 'Mobile or email is required');

  const user = await prisma.user.findFirst({
    where: mobile ? { mobile } : { email },
    include: { driverProfile: true },
  });
  if (!user) throw new ApiError(401, 'Invalid credentials');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new ApiError(401, 'Invalid credentials');
  if (!user.mobileVerified) throw new ApiError(403, 'Mobile number verify karein. OTP required hai.');
  if (user.status === 'SUSPENDED') throw new ApiError(403, 'This account has been suspended');

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const token = signToken({ id: user.id, role: user.role });
  return success(res, 200, 'Login successful', { token, user: sanitizeUser(user) });
});

// POST /api/auth/forgot-password
const forgotPassword = asyncHandler(async (req, res) => {
  const { mobile, email } = req.body;
  if (!mobile && !email) throw new ApiError(400, 'Mobile or email is required');
  const user = await prisma.user.findFirst({ where: mobile ? { mobile } : { email } });
  // Always return the same message to prevent account enumeration.
  if (!user) return success(res, 200, 'If the account exists, reset instructions have been sent');

  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  const raw = randomToken();
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 15 * 60 * 1000) },
  });

  const resetUrl = `${process.env.PUBLIC_APP_URL || ''}/?reset=${raw}`;
  const message = `LoadLink Pakistan password reset. Link valid for 15 minutes: ${resetUrl}`;
  let delivered = false;
  if (user.email) delivered = await sendEmail(user.email, 'LoadLink Pakistan password reset', message).catch(() => false);
  if (!delivered && user.mobile) delivered = await sendSms(user.mobile, message).catch(() => false);

  const data = process.env.NODE_ENV === 'production' ? {} : { developmentResetToken: raw };
  return success(res, 200, delivered ? 'Reset instructions sent' : 'Reset token created. Configure email/SMS delivery for production.', data);
});

// POST /api/auth/reset-password
const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password || password.length < 8) throw new ApiError(422, 'Token and a password of at least 8 characters are required');
  const record = await prisma.passwordResetToken.findFirst({ where: { tokenHash: hashToken(token), usedAt: null, expiresAt: { gt: new Date() } } });
  if (!record) throw new ApiError(400, 'Reset token is invalid or expired');
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await tx.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    return u;
  });
  return success(res, 200, 'Password reset successfully', { user: sanitizeUser(user) });
});

// POST /api/auth/verify-otp
const verifyOtp = asyncHandler(async (req, res) => {
  const { mobile, otp } = req.body;
  if (!mobile || !/^\d{6}$/.test(String(otp || ''))) throw new ApiError(400, 'Mobile aur 6-digit OTP required hai');
  const user = await prisma.user.findUnique({ where: { mobile } });
  if (!user) throw new ApiError(404, 'Account not found');
  if (user.mobileVerified) return success(res, 200, 'Mobile already verified', { user: sanitizeUser(user) });

  const record = await prisma.otpVerification.findFirst({
    where: { userId: user.id, purpose: 'SIGNUP', usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) throw new ApiError(400, 'OTP expired or not found. Resend OTP karein.');
  if (record.attempts >= 5) throw new ApiError(429, 'Too many OTP attempts. Resend OTP karein.');
  const validOtp = hashToken(String(otp)) === record.codeHash;
  if (!validOtp) {
    await prisma.otpVerification.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    throw new ApiError(400, 'Invalid OTP');
  }
  const verifiedUser = await prisma.$transaction(async (tx) => {
    await tx.otpVerification.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    return tx.user.update({ where: { id: user.id }, data: { mobileVerified: true } });
  });
  const token = signToken({ id: verifiedUser.id, role: verifiedUser.role });
  return success(res, 200, 'Mobile verified successfully', { token, user: sanitizeUser(verifiedUser) });
});

// POST /api/auth/resend-otp
const resendOtp = asyncHandler(async (req, res) => {
  const { mobile } = req.body;
  if (!mobile) throw new ApiError(400, 'Mobile is required');
  const user = await prisma.user.findUnique({ where: { mobile } });
  if (!user) throw new ApiError(404, 'Account not found');
  if (user.mobileVerified) return success(res, 200, 'Mobile already verified');
  const recent = await prisma.otpVerification.findFirst({ where: { userId: user.id, purpose: 'SIGNUP', createdAt: { gt: new Date(Date.now() - 60 * 1000) } } });
  if (recent) throw new ApiError(429, '1 minute baad OTP dobara bhejein');
  const otp = String(crypto.randomInt(100000, 1000000));
  await prisma.otpVerification.deleteMany({ where: { userId: user.id, purpose: 'SIGNUP', usedAt: null } });
  await prisma.otpVerification.create({ data: { userId: user.id, purpose: 'SIGNUP', codeHash: hashToken(otp), expiresAt: new Date(Date.now() + 10 * 60 * 1000) } });
  const sent = await sendOtpSms(user.mobile, otp).catch(() => false);
  return success(res, 200, sent ? 'OTP resent' : 'OTP generated but SMS delivery is not configured', {
    otpDeliveryConfigured: sent,
    ...(process.env.NODE_ENV !== 'production' && !sent ? { developmentOtp: otp } : {}),
  });
});

// POST /api/auth/logout  (JWTs are stateless; client discards the token)
const logout = asyncHandler(async (req, res) => {
  return success(res, 200, 'Logged out successfully');
});

// GET /api/auth/me
const me = asyncHandler(async (req, res) => {
  return success(res, 200, 'Current user', { user: sanitizeUser(req.user) });
});

module.exports = { register, login, logout, me, forgotPassword, resetPassword, verifyOtp, resendOtp };
