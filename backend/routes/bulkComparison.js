// backend/routes/bulkComparison.js
const express = require('express');
const router = express.Router();
const bulkComparisonService = require('../services/bulkComparisonService');
const logger = require('../utils/logger');

// Create a new bulk comparison job
router.post('/create', async (req, res) => {
  try {
    const filters = req.body;

    // Security check: Block oracle/api comparisons if internal features disabled
    const enableInternalFeatures = process.env.ENABLE_INTERNAL_FEATURES === 'true';
    if ((filters.source === 'oracle' || filters.source === 'api') && !enableInternalFeatures) {
      return res.status(403).json({
        error: 'Oracle and API bulk comparisons are only available in internal mode. Use source="baseline" for web access.'
      });
    }

    // Validate required fields
    if (!filters.league && (!filters.teams || filters.teams.length === 0)) {
      return res.status(400).json({
        error: 'Must specify either league or specific teams'
      });
    }

    const result = await bulkComparisonService.createJob(filters);

    res.json({
      success: true,
      message: 'Bulk comparison job created',
      ...result
    });
  } catch (error) {
    logger.error('Error creating bulk comparison job:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start a bulk comparison job
router.post('/start/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = await bulkComparisonService.executeJob(jobId);

    res.json({
      success: true,
      message: 'Bulk comparison job started',
      ...result
    });
  } catch (error) {
    logger.error('Error starting bulk comparison job:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get job status
router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await bulkComparisonService.getJobStatus(jobId);

    res.json({
      success: true,
      job
    });
  } catch (error) {
    logger.error('Error getting job status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel a job
router.delete('/cancel/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = await bulkComparisonService.cancelJob(jobId);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Error cancelling job:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get recent jobs
router.get('/jobs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const jobs = await bulkComparisonService.getRecentJobs(limit);

    res.json({
      success: true,
      jobs
    });
  } catch (error) {
    logger.error('Error getting recent jobs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create and start a job in one request (convenience endpoint)
router.post('/run', async (req, res) => {
  try {
    const filters = req.body;

    logger.info('🔍 Bulk comparison filters received:', JSON.stringify(filters, null, 2));
    logger.info(`📅 Date filters - startDate: "${filters.startDate}" (${typeof filters.startDate}), endDate: "${filters.endDate}" (${typeof filters.endDate})`);

    // Validate required fields
    if (!filters.league && (!filters.teams || filters.teams.length === 0)) {
      return res.status(400).json({
        error: 'Must specify either league or specific teams'
      });
    }

    // Create job
    const createResult = await bulkComparisonService.createJob(filters);

    // Start job immediately
    await bulkComparisonService.executeJob(createResult.jobId);

    res.json({
      success: true,
      message: 'Bulk comparison job created and started',
      ...createResult
    });
  } catch (error) {
    logger.error('Error running bulk comparison:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
