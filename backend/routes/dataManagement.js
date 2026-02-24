// backend/routes/dataManagement.js
const express = require('express');
const router = express.Router();
const Team = require('../models/Team');
const ScrapedData = require('../models/ScrapedData');
const DataMapping = require('../models/DataMapping');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const fs = require('fs').promises;
const path = require('path');
const { validateDangerZoneOperation, validateClearCache } = require('../middleware/validation');
const logger = require('../utils/logger');

// Export all data as JSON
router.get('/export', async (req, res) => {
  try {
    const { format = 'json' } = req.query;
    
    // Gather all data
    const [teams, scrapedData, mappings] = await Promise.all([
      Team.find({}),
      ScrapedData.find({}),
      DataMapping.find({})
    ]);
    
    const exportData = {
      exportDate: new Date().toISOString(),
      version: '1.0.0',
      counts: {
        teams: teams.length,
        scrapedData: scrapedData.length,
        mappings: mappings.length
      },
      data: {
        teams,
        scrapedData,
        mappings
      }
    };
    
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=sportsdata_export_${Date.now()}.json`);
      res.json(exportData);
    } else if (format === 'csv') {
      // For CSV, we'll just export teams for simplicity
      const csv = convertToCSV(teams);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=teams_export_${Date.now()}.csv`);
      res.send(csv);
    }
  } catch (error) {
    logger.error('Export error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Import data from JSON file
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const filePath = req.file.path;
    const fileContent = await fs.readFile(filePath, 'utf8');
    const importData = JSON.parse(fileContent);
    
    let results = {
      teams: { added: 0, updated: 0, failed: 0 },
      scrapedData: { added: 0, failed: 0 },
      mappings: { added: 0, failed: 0 }
    };
    
    // Import teams
    if (importData.data?.teams) {
      for (const team of importData.data.teams) {
        try {
          const existingTeam = await Team.findOne({ teamId: team.teamId });
          if (existingTeam) {
            await Team.findByIdAndUpdate(existingTeam._id, team);
            results.teams.updated++;
          } else {
            await Team.create(team);
            results.teams.added++;
          }
        } catch (err) {
          results.teams.failed++;
          logger.error('Failed to import team:', err);
        }
      }
    }
    
    // Clean up uploaded file
    await fs.unlink(filePath);
    
    res.json({
      success: true,
      message: 'Import completed',
      results
    });
  } catch (error) {
    logger.error('Import error:', error);
    // Clean up file if exists
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    res.status(500).json({ error: error.message });
  }
});

// Sync all teams data
router.post('/sync-all', async (req, res) => {
  try {
    const teams = await Team.find({});
    const results = [];
    
    // Import the fetch service
    const { fetchTeamData } = require('../services/fetchService');

    
    for (const team of teams) {
      try {
        // Trigger fetch for each team's roster
        const result = await fetchTeamData(team.teamId, 'roster');
        results.push({
          teamId: team.teamId,
          status: 'success',
          message: `Synced ${result.count || 0} players`
        });
      } catch (error) {
        results.push({
          teamId: team.teamId,
          status: 'failed',
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      message: `Synced ${teams.length} teams`,
      results
    });
  } catch (error) {
    logger.error('Sync all error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clear cache/temporary data
router.post('/clear-cache', validateClearCache, async (req, res) => {
  try {
    const { type = 'all' } = req.body;
    
    let cleared = {};
    
    if (type === 'all' || type === 'scraped') {
      // Clear old scraped data (older than 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const result = await ScrapedData.deleteMany({
        updatedAt: { $lt: thirtyDaysAgo }
      });
      
      cleared.oldScrapedData = result.deletedCount;
    }
    
    if (type === 'all' || type === 'temp') {
      // Clear any temporary files in uploads directory
      const uploadsDir = path.join(__dirname, '../../uploads');
      try {
        const files = await fs.readdir(uploadsDir);
        for (const file of files) {
          await fs.unlink(path.join(uploadsDir, file));
        }
        cleared.tempFiles = files.length;
      } catch (err) {
        cleared.tempFiles = 0;
      }
    }
    
    res.json({
      success: true,
      message: 'Cache cleared successfully',
      cleared
    });
  } catch (error) {
    logger.error('Clear cache error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to verify danger zone password
function verifyDangerZonePassword(password) {
  const dangerZonePassword = process.env.DANGER_ZONE_PASSWORD;

  logger.debug('🔒 Password verification:');
  logger.debug('  - Environment password set:', !!dangerZonePassword);
  logger.debug('  - Environment password value:', dangerZonePassword ? `[${dangerZonePassword.length} chars]` : '[not set]');
  logger.debug('  - Request password provided:', !!password);
  logger.debug('  - Request password value:', password ? `[${password.length} chars]` : '[not provided]');

  if (!dangerZonePassword || dangerZonePassword === 'your_secure_password_here') {
    logger.debug('  ❌ Password not configured on server');
    return { valid: false, error: 'Danger zone password not configured on server' };
  }

  if (!password) {
    logger.debug('  ❌ No password provided in request');
    return { valid: false, error: 'Password required for danger zone operations' };
  }

  if (password !== dangerZonePassword) {
    logger.debug('  ❌ Password mismatch');
    return { valid: false, error: 'Incorrect password' };
  }

  logger.debug('  ✅ Password verified successfully');
  return { valid: true };
}

// Reset database (danger zone)
router.post('/reset-database', validateDangerZoneOperation, async (req, res) => {
  try {
    const { confirm, password } = req.body;

    // Verify password first
    const passwordCheck = verifyDangerZonePassword(password);
    if (!passwordCheck.valid) {
      return res.status(403).json({ error: passwordCheck.error });
    }

    if (confirm !== 'RESET_ALL_DATA') {
      return res.status(400).json({
        error: 'Safety check failed. Must confirm with "RESET_ALL_DATA"'
      });
    }

    // Delete all data from all collections
    const results = await Promise.all([
      Team.deleteMany({}),
      ScrapedData.deleteMany({}),
      DataMapping.deleteMany({})
    ]);
    
    res.json({
      success: true,
      message: 'Database reset completed',
      deleted: {
        teams: results[0].deletedCount,
        scrapedData: results[1].deletedCount,
        mappings: results[2].deletedCount
      }
    });
  } catch (error) {
    logger.error('Reset database error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete all data except teams (selective deletion)
router.post('/delete-all-data', validateDangerZoneOperation, async (req, res) => {
  try {
    const { confirm, password, excludeCollections = [] } = req.body;

    // Verify password first
    const passwordCheck = verifyDangerZonePassword(password);
    if (!passwordCheck.valid) {
      return res.status(403).json({ error: passwordCheck.error });
    }

    if (confirm !== 'DELETE_ALL_DATA') {
      return res.status(400).json({
        error: 'Safety check failed. Must confirm with "DELETE_ALL_DATA"'
      });
    }

    const deletionResults = {};

    // Always delete scraped data
    const scrapedResult = await ScrapedData.deleteMany({});
    deletionResults.scrapedData = scrapedResult.deletedCount;

    // Delete comparisons (if collection exists)
    try {
      const ComparisonResult = require('../models/ComparisonResult');
      if (!excludeCollections.includes('comparisons')) {
        const comparisonResult = await ComparisonResult.deleteMany({});
        deletionResults.comparisons = comparisonResult.deletedCount;
      } else {
        deletionResults.comparisons = 'excluded';
      }
    } catch (e) {
      deletionResults.comparisons = 0;
    }

    // Delete comparison jobs (if collection exists)
    try {
      const ComparisonJob = require('../models/ComparisonJob');
      if (!excludeCollections.includes('comparisonJobs')) {
        const jobResult = await ComparisonJob.deleteMany({});
        deletionResults.comparisonJobs = jobResult.deletedCount;
      } else {
        deletionResults.comparisonJobs = 'excluded';
      }
    } catch (e) {
      deletionResults.comparisonJobs = 0;
    }

    // Delete fetch jobs (if collection exists)
    try {
      const FetchJob = require('../models/FetchJob');
      if (!excludeCollections.includes('fetchJobs')) {
        const fetchJobResult = await FetchJob.deleteMany({});
        deletionResults.fetchJobs = fetchJobResult.deletedCount;
      } else {
        deletionResults.fetchJobs = 'excluded';
      }
    } catch (e) {
      deletionResults.fetchJobs = 0;
    }

    // Optionally delete data mappings
    if (!excludeCollections.includes('dataMappings')) {
      const mappingResult = await DataMapping.deleteMany({});
      deletionResults.dataMappings = mappingResult.deletedCount;
    } else {
      deletionResults.dataMappings = 'excluded';
    }

    res.json({
      success: true,
      message: 'All data deleted successfully (teams preserved)',
      deleted: deletionResults
    });
  } catch (error) {
    logger.error('Delete all data error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to convert to CSV
function convertToCSV(data) {
  if (!data || data.length === 0) return '';
  
  const headers = Object.keys(data[0].toObject ? data[0].toObject() : data[0]);
  const csvHeaders = headers.join(',');
  
  const csvRows = data.map(item => {
    const obj = item.toObject ? item.toObject() : item;
    return headers.map(header => {
      const value = obj[header];
      return typeof value === 'string' ? `"${value}"` : value;
    }).join(',');
  });
  
  return [csvHeaders, ...csvRows].join('\n');
}

module.exports = router;