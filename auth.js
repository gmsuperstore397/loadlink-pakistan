const { verifyToken } = require('./jwt');
const { fail } = require('./apiResponse');
const prisma = require('./prisma');

function getAuthToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith('ll_auth='));
  return match ? decodeURIComponent(match.slice('ll_auth='.length)) : null;
}

// Verifies the HttpOnly auth cookie (or legacy Bearer token) and attaches the current user.
async function authenticateUser(req, res, next) {
  try {
    const token = getAuthToken(req);
    if (!token) return fail(res, 401, 'Authentication required');
    const payload = verifyToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      include: { driverProfile: true },
    });

    if (!user) return fail(res, 401, 'Invalid or expired token');
    if (user.status === 'SUSPENDED') return fail(res, 403, 'Account suspended');

    req.user = user;
    next();
  } catch (e) {
    return fail(res, 401, 'Invalid or expired token');
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return fail(res, 401, 'Authentication required');
    if (!roles.includes(req.user.role)) {
      return fail(res, 403, 'You do not have permission to perform this action');
    }
    next();
  };
}

function hasPermission(user, permission) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  try {
    const permissions = JSON.parse(user.permissions || '[]');
    return Array.isArray(permissions) && permissions.includes(permission);
  } catch (_) {
    return false;
  }
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return fail(res, 401, 'Authentication required');
    if (!hasPermission(req.user, permission)) {
      return fail(res, 403, 'Manager permission required: ' + permission);
    }
    next();
  };
}

module.exports = { authenticateUser, requireRole, hasPermission, requirePermission };
