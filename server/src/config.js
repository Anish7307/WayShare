import dotenv from 'dotenv';
dotenv.config();
export const config = {
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vehicle_pooling',
  jwtSecret: process.env.JWT_SECRET || '',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  cookieSameSite: process.env.COOKIE_SAME_SITE || 'lax',
  locationMinInterval: Number(process.env.LOCATION_UPDATE_MIN_INTERVAL_MS || 4000),
  maxLocationAccuracy: Number(process.env.LOCATION_MAX_ACCURACY_METERS || 250),
  clientUrl: process.env.CLIENT_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  mailFrom: process.env.MAIL_FROM || process.env.SMTP_USER || ''
};
if (!config.jwtSecret && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be configured in production');
}
if (!config.jwtSecret) config.jwtSecret = 'local-development-secret-change-before-deploy';
