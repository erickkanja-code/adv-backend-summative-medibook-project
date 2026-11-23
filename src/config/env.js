// Reads all environment-specific configuration in one place.
// Values come from the process environment (or a local .env file); the
// fallbacks below match .env.example so the app still starts without one.
require('dotenv').config({ quiet: true });

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

module.exports = Object.freeze({
  port: toInt(process.env.PORT, 3000),
  db: Object.freeze({
    host: process.env.DB_HOST || '127.0.0.1',
    port: toInt(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'medibook',
    connectionLimit: toInt(process.env.DB_CONNECTION_LIMIT, 10),
  }),
  redis: Object.freeze({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: toInt(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  }),
  auditLogPath: process.env.AUDIT_LOG_PATH || 'logs/audit.log',
});
