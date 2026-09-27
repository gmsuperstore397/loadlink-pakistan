const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { randomToken, hashToken, sendEmail, sendSms } = require('./delivery.service');
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

  const token = signToken({ id: user.id, role: user.role });
  return success(res, 201, 'Account created successfully', { token, user: sanitizeUser(user) });
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

// POST /api/auth/logout  (JWTs are stateless; client discards the token)
const logout = asyncHandler(async (req, res) => {
  return success(res, 200, 'Logged out successfully');
});

// GET /api/auth/me
const me = asyncHandler(async (req, res) => {
  return success(res, 200, 'Current user', { user: sanitizeUser(req.user) });
});

module.exports = { register, login, logout, me, forgotPassword, resetPassword };
