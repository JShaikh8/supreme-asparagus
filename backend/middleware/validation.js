// backend/middleware/validation.js
const { body, param, query, validationResult } = require('express-validator');
const {
  VALID_LEAGUES,
  VALID_SPORTS,
  VALID_DATA_TYPES,
  VALID_COMPARISON_SOURCES,
  HTTP_STATUS,
  ERROR_MESSAGES
} = require('../constants');

// Valid scrape types (specific to this middleware)
const VALID_SCRAPE_TYPES = ['sidearm', 'presto', 'custom', 'mlb', 'nba'];

/**
 * Middleware to handle validation errors
 * Returns 400 with detailed error messages if validation fails
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: ERROR_MESSAGES.VALIDATION_FAILED,
      details: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
};

/**
 * Sanitize string to prevent NoSQL injection
 * Removes $ and . characters which are used in MongoDB operators
 * Uses global flag to remove ALL occurrences, not just the first
 */
const sanitizeString = (value) => {
  if (typeof value !== 'string') return value;
  return value.replace(/[$\.]/g, '');
};

// ==================== TEAM ROUTES VALIDATION ====================

const validateCreateTeam = [
  body('teamId')
    .trim()
    .notEmpty().withMessage('teamId is required')
    .isLength({ max: 100 }).withMessage('teamId must be less than 100 characters')
    .customSanitizer(sanitizeString),
  body('teamName')
    .trim()
    .notEmpty().withMessage('teamName is required')
    .isLength({ max: 200 }).withMessage('teamName must be less than 200 characters'),
  body('league')
    .trim()
    .notEmpty().withMessage('league is required')
    .isIn(VALID_LEAGUES).withMessage(`league must be one of: ${VALID_LEAGUES.join(', ')}`),
  body('baseUrl')
    .trim()
    .notEmpty().withMessage('baseUrl is required')
    .isURL({ require_protocol: true }).withMessage('baseUrl must be a valid URL'),
  body('teamAbbrev')
    .optional()
    .trim()
    .isLength({ max: 10 }).withMessage('teamAbbrev must be less than 10 characters'),
  body('scrapeType')
    .optional()
    .isIn(VALID_SCRAPE_TYPES).withMessage(`scrapeType must be one of: ${VALID_SCRAPE_TYPES.join(', ')}`),
  body('active')
    .optional()
    .isBoolean().withMessage('active must be a boolean'),
  handleValidationErrors
];

const validateUpdateTeam = [
  param('teamId')
    .trim()
    .notEmpty().withMessage('teamId parameter is required')
    .customSanitizer(sanitizeString),
  body('teamName')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('teamName must be less than 200 characters'),
  body('league')
    .optional()
    .isIn(VALID_LEAGUES).withMessage(`league must be one of: ${VALID_LEAGUES.join(', ')}`),
  body('baseUrl')
    .optional()
    .isURL({ require_protocol: true }).withMessage('baseUrl must be a valid URL'),
  body('active')
    .optional()
    .isBoolean().withMessage('active must be a boolean'),
  handleValidationErrors
];

const validateTeamIdParam = [
  param('teamId')
    .trim()
    .notEmpty().withMessage('teamId parameter is required')
    .customSanitizer(sanitizeString),
  handleValidationErrors
];

// ==================== FETCH ROUTES VALIDATION ====================

const validateModuleFetch = [
  param('moduleId')
    .trim()
    .notEmpty().withMessage('moduleId is required')
    .customSanitizer(sanitizeString),
  body('teamId')
    .trim()
    .notEmpty().withMessage('teamId is required')
    .customSanitizer(sanitizeString),
  body('season')
    .optional()
    .isInt({ min: 2000, max: 2100 }).withMessage('season must be a year between 2000 and 2100'),
  body('targetDate')
    .optional()
    .isISO8601().withMessage('targetDate must be a valid ISO 8601 date'),
  body('startDate')
    .optional()
    .isISO8601().withMessage('startDate must be a valid ISO 8601 date'),
  body('endDate')
    .optional()
    .isISO8601().withMessage('endDate must be a valid ISO 8601 date'),
  body('createBaseline')
    .optional()
    .isBoolean().withMessage('createBaseline must be a boolean'),
  body('forceRefresh')
    .optional()
    .isBoolean().withMessage('forceRefresh must be a boolean'),
  handleValidationErrors
];

const validateBulkFetch = [
  param('moduleId')
    .trim()
    .notEmpty().withMessage('moduleId is required')
    .customSanitizer(sanitizeString),
  body('teamIds')
    .isArray({ min: 1 }).withMessage('teamIds must be a non-empty array')
    .custom((value) => {
      if (!value.every(id => typeof id === 'string' && id.length > 0)) {
        throw new Error('All teamIds must be non-empty strings');
      }
      return true;
    }),
  handleValidationErrors
];

// ==================== COMPARISON ROUTES VALIDATION ====================

const validateComparison = [
  body('teamId')
    .trim()
    .notEmpty().withMessage('teamId is required')
    .customSanitizer(sanitizeString),
  body('moduleId')
    .trim()
    .notEmpty().withMessage('moduleId is required')
    .customSanitizer(sanitizeString),
  body('source')
    .optional()
    .isIn(VALID_COMPARISON_SOURCES).withMessage(`source must be one of: ${VALID_COMPARISON_SOURCES.join(', ')}`),
  body('season')
    .optional()
    .isInt({ min: 2000, max: 2100 }).withMessage('season must be a year between 2000 and 2100'),
  body('startDate')
    .optional()
    .isISO8601().withMessage('startDate must be a valid ISO 8601 date'),
  handleValidationErrors
];

// ==================== DATA MANAGEMENT VALIDATION ====================

const validateDangerZoneOperation = [
  body('password')
    .notEmpty().withMessage('Password is required for danger zone operations'),
  body('confirm')
    .notEmpty().withMessage('Confirmation string is required'),
  handleValidationErrors
];

const validateClearCache = [
  body('type')
    .optional()
    .isIn(['all', 'scraped', 'temp']).withMessage('type must be one of: all, scraped, temp'),
  handleValidationErrors
];

// ==================== QUERY VALIDATION ====================

const validateTeamQuery = [
  query('league')
    .optional()
    .isIn(VALID_LEAGUES).withMessage(`league must be one of: ${VALID_LEAGUES.join(', ')}`),
  query('conference')
    .optional()
    .trim()
    .customSanitizer(sanitizeString),
  query('active')
    .optional()
    .isIn(['true', 'false']).withMessage('active must be true or false'),
  handleValidationErrors
];

module.exports = {
  // Utility
  handleValidationErrors,
  sanitizeString,

  // Team routes
  validateCreateTeam,
  validateUpdateTeam,
  validateTeamIdParam,
  validateTeamQuery,

  // Fetch routes
  validateModuleFetch,
  validateBulkFetch,

  // Comparison routes
  validateComparison,

  // Data management
  validateDangerZoneOperation,
  validateClearCache
};
