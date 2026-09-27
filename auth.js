const { verifyToken } = require('./utils/jwt');
const { fail } = require('./utils/apiResponse');
const prisma = require('./config/prisma');

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

module.exports = { authenticateUser, requireRole };
