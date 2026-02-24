// backend/routes/fetch.js
const express = require('express');
const router = express.Router();
const Team = require('../models/Team');
const sidearmFetcher = require('../services/sidearmFetcher');
const { validateModuleFetch, validateBulkFetch, validateTeamIdParam } = require('../middleware/validation');
const { parallelProcess } = require('../utils/rateLimiter');
const { RATE_LIMITS, HTTP_STATUS, ERROR_MESSAGES } = require('../constants');

// Import modules
const NCAAFootballRosterModule = require('../modules/ncaa-football-roster');
const NCAAFootballScheduleModule = require('../modules/ncaa-football-schedule');
const NCAAFootballStatsModule = require('../modules/ncaa-football-stats');
const NCAABasketballRosterModule = require('../modules/ncaa-basketball-roster');
const NCAABasketballScheduleModule = require('../modules/ncaa-basketball-schedule');
const NCAABasketballStatsModule = require('../modules/ncaa-basketball-stats');
const MLBRosterModule = require('../modules/mlb-roster');
const MLBScheduleFetchModule = require('../modules/mlb-schedule-fetch');
const NBAScheduleFetchModule = require('../modules/nba-schedule-fetch');
const NBABoxscoreFetchModule = require('../modules/nba-boxscore-fetch');
const ESPNNCAAMBBScheduleModule = require('../modules/espn-ncaa-mbb-schedule');
const ESPNNCAAWBBScheduleModule = require('../modules/espn-ncaa-wbb-schedule');
const ESPNNCAAFBScheduleModule = require('../modules/espn-ncaa-cfb-schedule');
const NCAABaseballScheduleModule = require('../modules/ncaa-baseball-schedule');
const logger = require('../utils/logger');

// Initialize modules
const modules = {
  'ncaa_football_roster': new NCAAFootballRosterModule(),
  'ncaa_football_schedule': new NCAAFootballScheduleModule(),
  'ncaa_football_stats': new NCAAFootballStatsModule(),
  'ncaa_mensBasketball_roster': new NCAABasketballRosterModule('mensBasketball'),
  'ncaa_mensBasketball_schedule': new NCAABasketballScheduleModule('mensBasketball'),
  'ncaa_mensBasketball_stats': new NCAABasketballStatsModule('mensBasketball'),
  'ncaa_womensBasketball_roster': new NCAABasketballRosterModule('womensBasketball'),
  'ncaa_womensBasketball_schedule': new NCAABasketballScheduleModule('womensBasketball'),
  'ncaa_womensBasketball_stats': new NCAABasketballStatsModule('womensBasketball'),
  'ncaa_baseball_schedule': new NCAABaseballScheduleModule(),
  'mlb_roster': new MLBRosterModule(),
  'mlb_schedule': new MLBScheduleFetchModule(),
  'nba_schedule': new NBAScheduleFetchModule(),
  'nba_boxscore': new NBABoxscoreFetchModule(),
  'espn_ncaa_mbb_schedule': new ESPNNCAAMBBScheduleModule(),
  'espn_ncaa_wbb_schedule': new ESPNNCAAWBBScheduleModule(),
  'espn_ncaa_cfb_schedule': new ESPNNCAAFBScheduleModule()
};

// GET available modules
router.get('/modules', (req, res) => {
  const availableModules = Object.keys(modules).map(key => ({
    id: key,
    name: modules[key].config.name,
    league: modules[key].config.league,
    sport: modules[key].config.sport,
    dataType: modules[key].config.dataType
  }));
  
  res.json({
    success: true,
    modules: availableModules
  });
});

// POST - Fetch data using specific module (UPDATED TO HANDLE STATS)
router.post('/module/:moduleId', validateModuleFetch, async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { teamId, season, targetDate, startDate, endDate, createBaseline, forceRefresh } = req.body;

    logger.debug(`Fetching module: ${moduleId} for team: ${teamId}${season ? `, season: ${season}` : ''}${targetDate ? `, targetDate: ${targetDate}` : ''}${startDate ? `, startDate: ${startDate}` : ''}${endDate ? `, endDate: ${endDate}` : ''}${createBaseline ? `, createBaseline: true` : ''}${forceRefresh ? `, forceRefresh: true` : ''}`);

    const module = modules[moduleId];

    if (!module) {
      return res.status(404).json({
        success: false,
        error: `Module ${moduleId} not found. Available modules: ${Object.keys(modules).join(', ')}`
      });
    }

    if (!teamId) {
      return res.status(400).json({
        success: false,
        error: 'teamId is required'
      });
    }

    const team = await Team.findOne({ teamId });
    if (!team) {
      return res.status(404).json({
        success: false,
        error: `Team ${teamId} not found`
      });
    }

    let result;
    // Route to appropriate method based on module type and data type

    // ESPN modules use fetchForTeam(teamId) - different method signature
    if (moduleId.startsWith('espn_')) {
      // ESPN modules use team ID and look up ESPN ID internally
      if (!team.espnId) {
        return res.status(400).json({
          success: false,
          error: `Team ${teamId} does not have an ESPN ID configured`
        });
      }
      result = await module.fetchForTeam(teamId, { createBaseline, forceRefresh });
      // Result is array of games - handled by standard response below
    } else if (module.config.dataType === 'schedule') {
      result = await module.fetchTeamSchedule(team, { startDate, endDate, createBaseline, forceRefresh });
    } else if (module.config.dataType === 'stats') {
      // Stats module accepts season, targetDate, startDate, endDate, createBaseline, and forceRefresh parameters
      result = await module.fetchTeamStats(team, season || new Date().getFullYear(), targetDate, { startDate, endDate, createBaseline, forceRefresh });
    } else if (module.config.dataType === 'roster') {
      result = await module.fetchTeamRoster(team, { createBaseline, forceRefresh });
    } else {
      // Generic fetch method for other data types
      if (module.fetch) {
        result = await module.fetch(team, { createBaseline, forceRefresh });
      } else {
        throw new Error(`Module ${moduleId} does not support fetch operation`);
      }
    }
    
    res.json({
      success: true,
      module: moduleId,
      team: teamId,
      count: result.length,
      data: result
    });
    
  } catch (error) {
    logger.error(`Error in module fetch:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST - ESPN Schedule bulk fetch (week range based, not team based)
// Uses the scoreboard endpoint which is more efficient for bulk data
router.post('/espn/schedule', async (req, res) => {
  try {
    const { moduleId, startWeek, endWeek, createBaseline } = req.body;

    if (!moduleId) {
      return res.status(400).json({
        success: false,
        error: 'moduleId is required (e.g., espn_ncaa_mbb_schedule)'
      });
    }

    // Validate week parameters
    const start = parseInt(startWeek);
    const end = parseInt(endWeek);

    if (isNaN(start) || isNaN(end) || start < 1 || end < 1) {
      return res.status(400).json({
        success: false,
        error: 'startWeek and endWeek are required (positive integers)'
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        error: 'startWeek must be less than or equal to endWeek'
      });
    }

    if (end - start > 25) {
      return res.status(400).json({
        success: false,
        error: 'Maximum range is 25 weeks at a time'
      });
    }

    const module = modules[moduleId];
    if (!module) {
      return res.status(404).json({
        success: false,
        error: `Module ${moduleId} not found`
      });
    }

    // Verify it's an ESPN module
    if (!moduleId.startsWith('espn_')) {
      return res.status(400).json({
        success: false,
        error: 'This endpoint is only for ESPN modules'
      });
    }

    // Verify the module has the fetchByWeeks method
    if (typeof module.fetchByWeeks !== 'function') {
      return res.status(400).json({
        success: false,
        error: `Module ${moduleId} does not support week-based bulk fetching`
      });
    }

    logger.info(`📺 ESPN Schedule bulk fetch: ${moduleId} weeks ${start} to ${end}`);

    const result = await module.fetchByWeeks({
      startWeek: start,
      endWeek: end,
      createBaseline: createBaseline || false
    });

    res.json({
      success: true,
      module: moduleId,
      ...result
    });

  } catch (error) {
    logger.error(`Error in ESPN schedule bulk fetch:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST - Special MLB route with parameters
router.post('/mlb/roster/:teamId', validateTeamIdParam, async (req, res) => {
  try {
    const { teamId } = req.params;
    const { season, rosterType, createBaseline, forceRefresh } = req.body;

    logger.debug(`Fetching MLB roster for team: ${teamId}, season: ${season}, type: ${rosterType}${createBaseline ? `, createBaseline: true` : ''}${forceRefresh ? `, forceRefresh: true` : ''}`);

    const team = await Team.findOne({ teamId });
    if (!team) {
      return res.status(404).json({
        success: false,
        error: `Team ${teamId} not found`
      });
    }

    const module = modules.mlb_roster;
    const result = await module.fetchTeamRoster(team, {
      season: season || new Date().getFullYear(),
      rosterType: rosterType || 'active',
      createBaseline: createBaseline || false,
      forceRefresh: forceRefresh || false
    });
    
    res.json({
      success: true,
      team: teamId,
      season,
      rosterType,
      count: result.length,
      data: result
    });
  } catch (error) {
    logger.error(`Error fetching MLB roster:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST - Fetch roster from a single URL (original)
router.post('/roster', async (req, res) => {
  try {
    const { baseUrl, teamId } = req.body;
    
    if (!baseUrl) {
      return res.status(400).json({ 
        success: false, 
        error: 'baseUrl is required' 
      });
    }
    
    // If teamId provided, verify it exists
    let team = null;
    if (teamId) {
      team = await Team.findOne({ teamId: teamId });
      if (!team) {
        return res.status(404).json({ 
          success: false, 
          error: 'Team not found' 
        });
      }
    }
    
    const result = await sidearmFetcher.fetchRosterFromUrl(
      baseUrl, 
      teamId || baseUrl.replace(/[^a-zA-Z0-9]/g, '_')
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// POST - Bulk fetch for multiple teams with same module
// Supports parallel processing with rate limiting
router.post('/module/:moduleId/bulk', validateBulkFetch, async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { teamIds, concurrency = 3, delayMs = RATE_LIMITS.BULK_FETCH_DELAY_MS } = req.body;

    if (!teamIds || !Array.isArray(teamIds)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: 'teamIds array is required'
      });
    }

    const module = modules[moduleId];

    if (!module) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: `Module type ${moduleId} not found`
      });
    }

    logger.debug(`Bulk fetch: ${moduleId} for ${teamIds.length} teams (concurrency: ${concurrency}, delay: ${delayMs}ms)`);

    // Process teams using parallel processor with rate limiting
    const processedResults = await parallelProcess(
      teamIds,
      async (teamId) => {
        const team = await Team.findOne({ teamId });

        if (!team) {
          throw new Error(ERROR_MESSAGES.TEAM_NOT_FOUND);
        }

        let data;
        if (module.config.dataType === 'schedule') {
          data = await module.fetchTeamSchedule(team);
        } else if (module.config.dataType === 'stats') {
          data = await module.fetchTeamStats(team);
        } else if (module.config.dataType === 'roster') {
          data = await module.fetchTeamRoster(team);
        } else if (module.fetch) {
          data = await module.fetch(team);
        }

        return { count: data.length, data };
      },
      {
        concurrency: Math.min(concurrency, 5), // Max 5 concurrent to prevent overload
        delayMs: Math.max(delayMs, 1000), // Min 1 second between batches
        onProgress: (index, total, result) => {
          logger.debug(`Bulk fetch progress: ${index + 1}/${total} - ${result.success ? 'success' : 'failed'}`);
        }
      }
    );

    // Transform results to expected format
    const results = processedResults.map(r => ({
      teamId: r.item,
      success: r.success,
      ...(r.success ? { count: r.result.count, data: r.result.data } : { error: r.error })
    }));

    const summary = {
      module: moduleId,
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      concurrency,
      delayMs,
      results
    };

    res.json(summary);

  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: error.message
    });
  }
});

// GET - Health check for fetch service
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Fetch service is running',
    availableModules: Object.keys(modules),
    timestamp: new Date()
  });
});

module.exports = router;