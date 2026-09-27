const prisma = require('../config/prisma');

// Creates an in-app notification row for a user. Fire-and-forget from controllers;
// failures here should never block the primary request.
async function notify(userId, type, title, message) {
  try {
    return await prisma.notification.create({
      data: { userId, type, title, message },
    });
  } catch (e) {
    console.error('notify() failed:', e.message);
    return null;
  }
}

module.exports = notify;
