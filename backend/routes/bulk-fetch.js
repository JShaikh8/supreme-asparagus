// backend/routes/bulk-fetch.js
const express = require('express');
const router = express.Router();
const bulkFetchService = require('../services/bulkFetchService');
const logger = require('../utils/logger');

// Create a new bulk fetch job
router.post('/create', async (req, res) => {
  try {
    const { league, conference, division, teams, modules, targetDate, startDate, endDate, createBaseline, forceRefresh } = req.body;

    logger.info(`📥 Bulk fetch /create request - startDate: ${startDate}, endDate: ${endDate}, league: ${league}`);

    const result = await bulkFetchService.createJob({
      league,
      conference,
      division,
      teams,
      modules,
      targetDate,
      startDate,
      endDate,
      createBaseline: createBaseline || false,
      forceRefresh: forceRefresh || false
    });
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start a job
router.post('/start/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = await bulkFetchService.executeJob(jobId);
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get job status
router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await bulkFetchService.getJobStatus(jobId);
    res.json(job);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Cancel a job
router.post('/cancel/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = await bulkFetchService.cancelJob(jobId);
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get recent jobs
router.get('/recent', async (req, res) => {
  try {
    const jobs = await bulkFetchService.getRecentJobs();
    res.json(jobs);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create and start a job in one request (convenience endpoint)
router.post('/run', async (req, res) => {
  try {
    const { league, conference, division, teams, modules, targetDate, startDate, endDate, createBaseline, forceRefresh } = req.body;

    // Validate required fields
    if (!league && (!teams || teams.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'Must specify either league or specific teams'
      });
    }

    // Create job
    const createResult = await bulkFetchService.createJob({
      league,
      conference,
      division,
      teams,
      modules,
      targetDate,
      startDate,
      endDate,
      createBaseline: createBaseline || false,
      forceRefresh: forceRefresh || false
    });

    // Start job immediately
    await bulkFetchService.executeJob(createResult.jobId);

    res.json({
      success: true,
      message: 'Bulk fetch job created and started',
      ...createResult
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;