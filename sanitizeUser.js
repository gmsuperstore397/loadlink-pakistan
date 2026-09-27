// Strips sensitive fields before a user object ever reaches an API response.
function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}
module.exports = { sanitizeUser };
