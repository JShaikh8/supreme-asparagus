// backend/routes/autoPopulate.js
const express = require('express');
const router = express.Router();
const autoPopulateService = require('../services/autoPopulateService');
const Team = require('../models/Team');

// Auto-populate single team
router.post('/team/:teamId', async (req, res) => {
  try {
    const result = await autoPopulateService.autoPopulateTeam(req.params.teamId);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Auto-populate multiple teams
router.post('/bulk', async (req, res) => {
  try {
    const { teamIds } = req.body;
    
    if (!teamIds || !Array.isArray(teamIds)) {
      return res.status(400).json({
        success: false,
        error: 'teamIds array required'
      });
    }

    const results = await autoPopulateService.autoPopulateBulk(teamIds);
    
    res.json({
      success: true,
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Auto-populate all NCAA teams
router.post('/ncaa/all', async (req, res) => {
  try {
    const results = await autoPopulateService.autoPopulateAllNCAA();
    
    res.json({
      success: true,
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;