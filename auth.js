const { verifyToken } = require('./jwt');
const { fail } = require('./apiResponse');
const prisma = require('./prisma');

// Verifies the Bearer JWT and attaches the current user (with driverProfile) to req.user.
async function authenticateUser(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return fail(res, 401, 'Authentication required');
    }
    const token = header.slice(7);
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

// Restricts a route to one or more roles. Use after authenticateUser.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return fail(res, 401, 'Authentication required');
    if (!roles.includes(req.user.role)) {
      return fail(res, 403, 'You do not have permission to perform this action');
    }
    next();
  };
}


// Granular permission middleware for MANAGER accounts.
// ADMIN bypasses permission checks; MANAGER permissions are stored as JSON in User.permissions.
function hasPermission(user, permission) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role !== 'MANAGER') return false;
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
