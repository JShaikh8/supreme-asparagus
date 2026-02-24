// backend/routes/settings.js
const express = require('express');
const router = express.Router();
const AppSettings = require('../models/AppSettings');
const { body, validationResult } = require('express-validator');
const { HTTP_STATUS, ERROR_MESSAGES } = require('../constants');
const logger = require('../utils/logger');

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: ERROR_MESSAGES.VALIDATION_FAILED,
      details: errors.array()
    });
  }
  next();
};

// GET current settings
router.get('/', async (req, res) => {
  try {
    const settings = await AppSettings.getSettings();
    res.json({
      success: true,
      settings
    });
  } catch (error) {
    logger.error('Error fetching settings:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: error.message
    });
  }
});

// PUT update settings
router.put('/', [
  body('requestTimeout')
    .optional()
    .isInt({ min: 5, max: 300 })
    .withMessage('Request timeout must be between 5 and 300 seconds'),
  body('maxRetryAttempts')
    .optional()
    .isInt({ min: 0, max: 10 })
    .withMessage('Max retry attempts must be between 0 and 10'),
  body('autoRefreshInterval')
    .optional()
    .isIn([0, 30, 60, 180, 360])
    .withMessage('Auto refresh interval must be 0 (never), 30, 60, 180, or 360 minutes'),
  body('dataRetentionPeriod')
    .optional()
    .isIn([7, 30, 90, 365])
    .withMessage('Data retention period must be 7, 30, 90, or 365 days'),
  body('bulkFetchConcurrency')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Bulk fetch concurrency must be between 1 and 5'),
  body('bulkFetchDelay')
    .optional()
    .isInt({ min: 1000, max: 10000 })
    .withMessage('Bulk fetch delay must be between 1000 and 10000 ms'),
  handleValidationErrors
], async (req, res) => {
  try {
    const allowedFields = [
      'requestTimeout',
      'maxRetryAttempts',
      'autoRefreshInterval',
      'dataRetentionPeriod',
      'bulkFetchConcurrency',
      'bulkFetchDelay'
    ];

    // Filter to only allowed fields
    const updates = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: 'No valid settings to update'
      });
    }

    const settings = await AppSettings.updateSettings(updates);

    res.json({
      success: true,
      message: 'Settings updated successfully',
      settings
    });
  } catch (error) {
    logger.error('Error updating settings:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: error.message
    });
  }
});

// POST reset settings to defaults
router.post('/reset', async (req, res) => {
  try {
    const defaults = {
      requestTimeout: 30,
      maxRetryAttempts: 3,
      autoRefreshInterval: 60,
      dataRetentionPeriod: 30,
      bulkFetchConcurrency: 3,
      bulkFetchDelay: 2000
    };

    const settings = await AppSettings.updateSettings(defaults);

    res.json({
      success: true,
      message: 'Settings reset to defaults',
      settings
    });
  } catch (error) {
    logger.error('Error resetting settings:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
