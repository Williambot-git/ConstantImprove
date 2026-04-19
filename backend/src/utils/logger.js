/**
 * logger.js — minimal structured logger for the backend
 *
 * WHY THIS EXISTS:
 * Direct console.log calls lack severity levels, making it hard to filter
 * production noise. This thin wrapper adds levels and consistent formatting
 * so logs can be routed to appropriate outputs (stdout, file, external service).
 *
 * LEVELS:
 *   ERROR (0) — errors requiring operator attention
 *   WARN  (1) — degraded states, unexpected-but-handled conditions
 *   INFO  (2) — significant business events (commission credited, payment processed)
 *   DEBUG (3) — detailed diagnostic info (not shown in production by default)
 *
 * USAGE:
 *   const log = require('../utils/logger');
 *   log.info('Payment processed', { subscriptionId: 123 });
 *   log.error('VPN API failed', { error: err.message });
 *
 * PRODUCTION ENV:
 *   In production (NODE_ENV=production), DEBUG and INFO logs are suppressed.
 *   Set LOG_LEVEL=debug in .env to enable verbose output.
 */

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

// Read LOG_LEVEL from env; default to 'info' in production, 'debug' in development
const currentLevel = process.env.LOG_LEVEL
  ? LOG_LEVELS[process.env.LOG_LEVEL] ?? LOG_LEVELS.info
  : (process.env.NODE_ENV === 'production' ? LOG_LEVELS.info : LOG_LEVELS.debug);

const formatMessage = (level, message, meta = {}) => {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
};

const logger = {
  error(message, meta = {}) {
    if (currentLevel >= LOG_LEVELS.error) {
      console.error(formatMessage('error', message, meta));
    }
  },

  warn(message, meta = {}) {
    if (currentLevel >= LOG_LEVELS.warn) {
      console.warn(formatMessage('warn', message, meta));
    }
  },

  info(message, meta = {}) {
    if (currentLevel >= LOG_LEVELS.info) {
      console.log(formatMessage('info', message, meta));
    }
  },

  debug(message, meta = {}) {
    if (currentLevel >= LOG_LEVELS.debug) {
      console.log(formatMessage('debug', message, meta));
    }
  },
};

module.exports = logger;
