const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/apiResponse');
const { signToken } = require('../utils/jwt');
const { sanitizeUser } = require('../utils/sanitizeUser');
const ApiError = require('../utils/ApiError');

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

// POST /api/auth/logout  (JWTs are stateless; client discards the token)
const logout = asyncHandler(async (req, res) => {
  return success(res, 200, 'Logged out successfully');
});

// GET /api/auth/me
const me = asyncHandler(async (req, res) => {
  return success(res, 200, 'Current user', { user: sanitizeUser(req.user) });
});

module.exports = { register, login, logout, me };
