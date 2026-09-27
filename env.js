require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT || 5000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('JWT_SECRET must be set in production'); })() : 'dev-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  frontendUrl: process.env.FRONTEND_URL || '*',
  geocodingApiKey: process.env.GEOCODING_API_KEY || '',
  baseFare: Number(process.env.BASE_FARE || 500),
  perKmRate: Number(process.env.PER_KM_RATE || 45),
  platformCommissionRate: Number(process.env.PLATFORM_COMMISSION_RATE || 0.10),
  nodeEnv: process.env.NODE_ENV || 'development',
  adminMobile: process.env.ADMIN_MOBILE || '03000000000',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@loadlink.pk',
  adminPassword: process.env.ADMIN_PASSWORD || 'ChangeMe123!',
  publicAppUrl: process.env.PUBLIC_APP_URL || '',
  easyPaisaCheckoutUrl: process.env.EASYPAISA_CHECKOUT_URL || '',
  jazzCashCheckoutUrl: process.env.JAZZCASH_CHECKOUT_URL || '',
};
