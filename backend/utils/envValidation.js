// backend/utils/envValidation.js
//
// Environment variable validation on startup
// Ensures required config is present before the app starts

const logger = require('./logger');

/**
 * Environment variable definitions
 * - required: App won't start without this
 * - optional: Has a default or is feature-specific
 */
const ENV_SCHEMA = {
  // Required variables
  MONGODB_URI: {
    required: true,
    description: 'MongoDB connection string',
    validate: (val) => val.startsWith('mongodb')
  },
  DANGER_ZONE_PASSWORD: {
    required: true,
    description: 'Password for destructive operations'
  },

  // Optional with defaults
  PORT: {
    required: false,
    default: '5000',
    description: 'Server port',
    validate: (val) => !isNaN(parseInt(val)) && parseInt(val) > 0 && parseInt(val) < 65536
  },
  NODE_ENV: {
    required: false,
    default: 'development',
    description: 'Environment mode',
    validate: (val) => ['development', 'production', 'test'].includes(val)
  },
  CORS_ORIGINS: {
    required: false,
    default: 'http://localhost:3000',
    description: 'Comma-separated allowed CORS origins'
  },
  LOG_LEVEL: {
    required: false,
    default: 'debug',
    description: 'Logging level',
    validate: (val) => ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'].includes(val)
  },
  LOG_TO_FILE: {
    required: false,
    default: 'false',
    description: 'Enable file logging',
    validate: (val) => ['true', 'false'].includes(val)
  },
  LOG_DIR: {
    required: false,
    description: 'Directory for log files'
  },

  // Internal features (Oracle/Stats API)
  ENABLE_INTERNAL_FEATURES: {
    required: false,
    default: 'false',
    description: 'Enable Oracle/Stats API comparisons',
    validate: (val) => ['true', 'false'].includes(val)
  },

  // Conditional requirements (only if internal features enabled)
  ORACLE_USER: {
    required: false,
    conditionalRequired: () => process.env.ENABLE_INTERNAL_FEATURES === 'true',
    description: 'Oracle database username'
  },
  ORACLE_PASSWORD: {
    required: false,
    conditionalRequired: () => process.env.ENABLE_INTERNAL_FEATURES === 'true',
    description: 'Oracle database password'
  },
  ORACLE_CONNECTION_STRING: {
    required: false,
    conditionalRequired: () => process.env.ENABLE_INTERNAL_FEATURES === 'true',
    description: 'Oracle connection string'
  },
  STATS_API_URL: {
    required: false,
    conditionalRequired: () => process.env.ENABLE_INTERNAL_FEATURES === 'true',
    description: 'Stats.com API base URL',
    validate: (val) => val.startsWith('http')
  }
};

/**
 * Validate all environment variables
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateEnv() {
  const errors = [];
  const warnings = [];
  const missing = [];

  for (const [key, schema] of Object.entries(ENV_SCHEMA)) {
    const value = process.env[key];
    const isRequired = schema.required || (schema.conditionalRequired && schema.conditionalRequired());

    // Check if required variable is missing
    if (isRequired && !value) {
      missing.push(key);
      errors.push(`Missing required environment variable: ${key} - ${schema.description}`);
      continue;
    }

    // Skip validation if optional and not set
    if (!value) {
      if (schema.default) {
        // Apply default value
        process.env[key] = schema.default;
      }
      continue;
    }

    // Validate value if validator exists
    if (schema.validate && !schema.validate(value)) {
      errors.push(`Invalid value for ${key}: "${value}" - ${schema.description}`);
    }
  }

  // Security warnings
  if (process.env.NODE_ENV === 'production') {
    if (process.env.DANGER_ZONE_PASSWORD === 'changeme' ||
        process.env.DANGER_ZONE_PASSWORD?.length < 8) {
      warnings.push('DANGER_ZONE_PASSWORD should be a strong password in production');
    }
    if (process.env.LOG_LEVEL === 'debug') {
      warnings.push('LOG_LEVEL is set to debug in production - consider using info or warn');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    missing
  };
}

/**
 * Run validation and log results
 * Exits process if critical errors found
 */
function validateAndStart() {
  const result = validateEnv();

  // Log warnings
  if (result.warnings.length > 0) {
    result.warnings.forEach(warning => {
      logger.warn(`Config warning: ${warning}`);
    });
  }

  // Log errors and exit if invalid
  if (!result.valid) {
    logger.error('Environment validation failed:');
    result.errors.forEach(error => {
      logger.error(`  - ${error}`);
    });

    if (result.missing.length > 0) {
      logger.error('\nMissing variables can be set in .env file or environment');
      logger.error('See .env.example for template');
    }

    logger.error('\nExiting due to configuration errors...');
    process.exit(1);
  }

  logger.success('Environment validation passed');
  return result;
}

/**
 * Get current config (non-sensitive values only)
 * Useful for debugging
 */
function getSafeConfig() {
  const sensitiveKeys = ['PASSWORD', 'SECRET', 'KEY', 'TOKEN', 'URI', 'CONNECTION'];
  const config = {};

  for (const key of Object.keys(ENV_SCHEMA)) {
    const value = process.env[key];
    const isSensitive = sensitiveKeys.some(s => key.toUpperCase().includes(s));

    if (isSensitive && value) {
      config[key] = '[REDACTED]';
    } else {
      config[key] = value || ENV_SCHEMA[key].default || '(not set)';
    }
  }

  return config;
}

module.exports = {
  validateEnv,
  validateAndStart,
  getSafeConfig,
  ENV_SCHEMA
};
