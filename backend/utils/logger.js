// backend/utils/logger.js
//
// Structured logging with Winston
// Replaces console.log with structured, level-based logging

const winston = require('winston');
const path = require('path');

// Custom format for console output (development-friendly)
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    // Handle objects in message
    let msg = message;
    if (typeof message === 'object') {
      msg = JSON.stringify(message, null, 2);
    }

    // Add metadata if present
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';

    return `${timestamp} ${level}: ${msg}${metaStr}`;
  })
);

// JSON format for file output (production/structured)
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Determine log level from environment
const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

// Create transports array
const transports = [
  // Console transport (always enabled)
  new winston.transports.Console({
    format: consoleFormat
  })
];

// Add file transports in production or if LOG_TO_FILE is set
if (process.env.NODE_ENV === 'production' || process.env.LOG_TO_FILE === 'true') {
  // Use LOG_DIR env var, or fallback to a writable location
  // (path.join(__dirname, '..', 'logs') fails inside Electron's asar archive)
  const logsDir = process.env.LOG_DIR || path.join(process.env.APPDATA || process.env.HOME || __dirname, 'sportsdata-pro-desktop', 'logs');

  transports.push(
    // Error log file
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Combined log file
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  );
}

// Create the logger
const logger = winston.createLogger({
  level: logLevel,
  defaultMeta: { service: 'sports-data-platform' },
  transports
});

// Add convenience methods that match common console patterns
logger.success = (message, meta = {}) => {
  logger.info(`✅ ${message}`, meta);
};

logger.fail = (message, meta = {}) => {
  logger.error(`❌ ${message}`, meta);
};

logger.api = (message, meta = {}) => {
  logger.info(`📡 ${message}`, meta);
};

logger.security = (message, meta = {}) => {
  logger.warn(`🔒 ${message}`, meta);
};

logger.db = (message, meta = {}) => {
  logger.info(`🗄️ ${message}`, meta);
};

logger.perf = (message, meta = {}) => {
  logger.debug(`⚡ ${message}`, meta);
};

// Request logging middleware
logger.requestLogger = (req, res, next) => {
  const start = Date.now();

  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip
    };

    // Log level based on status code
    if (res.statusCode >= 500) {
      logger.error('Request failed', logData);
    } else if (res.statusCode >= 400) {
      logger.warn('Request error', logData);
    } else {
      logger.debug('Request completed', logData);
    }
  });

  next();
};

// Error logging helper
logger.logError = (error, context = {}) => {
  logger.error(error.message, {
    stack: error.stack,
    code: error.code,
    ...context
  });
};

// Startup banner
logger.startupBanner = (port, config = {}) => {
  logger.info('═'.repeat(50));
  logger.info('🚀 Sports Data Platform API Starting');
  logger.info('═'.repeat(50));
  logger.info(`Port: ${port}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Log Level: ${logLevel}`);
  if (config.corsOrigins) {
    logger.info(`CORS Origins: ${config.corsOrigins.join(', ')}`);
  }
  if (config.internalFeatures !== undefined) {
    logger.info(`Internal Features: ${config.internalFeatures ? 'ENABLED' : 'DISABLED'}`);
  }
  logger.info('═'.repeat(50));
};

module.exports = logger;
