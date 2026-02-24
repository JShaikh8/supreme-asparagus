const express = require('express');
const router = express.Router();
const NBAGame = require('../models/NBAGame');
const nbaScheduleModule = require('../modules/nba-schedule');
const nbaBoxscoreModule = require('../modules/nba-boxscore');
const nbaPlayByPlayService = require('../services/nbaPlayByPlayService');
const nbaMonitoringService = require('../services/nbaMonitoringService');
const logger = require('../utils/logger');

/**
 * GET /api/nba/schedule/today
 * Get today's NBA games from database
 * Query params:
 *   - timezoneOffset: Minutes offset from UTC (e.g., -360 for CST)
 */
router.get('/schedule/today', async (req, res) => {
  try {
    // Get timezone offset from query parameter (default to 0 if not provided)
    const timezoneOffset = parseInt(req.query.timezoneOffset) || 0;
    const games = await nbaScheduleModule.getTodaysGamesFromDatabase(timezoneOffset);
    res.json({
      success: true,
      count: games.length,
      games: games
    });
  } catch (error) {
    logger.error('Error getting today\'s schedule:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/nba/schedule/:date
 * Get games for a specific date
 * Date format: YYYY-MM-DD
 */
router.get('/schedule/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const games = await nbaScheduleModule.getGamesFromDatabase(date);
    res.json({
      success: true,
      date: date,
      count: games.length,
      games: games
    });
  } catch (error) {
    logger.error('Error getting schedule for date:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/nba/schedule/sync
 * Manually sync today's games from NBA API
 * Body params:
 *   - date: string (optional) - Date in YYYY-MM-DD format to sync (defaults to today)
 */
router.post('/schedule/sync', async (req, res) => {
  try {
    const { date } = req.body;
    let games;
    let message;

    if (date) {
      games = await nbaScheduleModule.syncGamesForDate(date);
      message = `Games synced successfully for ${date}`;
    } else {
      games = await nbaScheduleModule.syncTodaysGames();
      message = 'Today\'s games synced successfully';
    }

    res.json({
      success: true,
      message: message,
      count: games.length,
      games: games
    });
  } catch (error) {
    logger.error('Error syncing schedule:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/nba/game/:gameId
 * Get details for a specific game
 */
router.get('/game/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    const game = await NBAGame.findOne({ gameId: gameId });

    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found'
      });
    }

    res.json({
      success: true,
      game: game
    });
  } catch (error) {
    logger.error('Error getting game:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/nba/playbyplay/:gameId
 * Get play-by-play data for a game
 */
router.get('/playbyplay/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { period, onlyEdited } = req.query;

    const options = {};
    if (period) options.period = parseInt(period);
    if (onlyEdited === 'true') options.onlyEdited = true;

    const actions = await nbaPlayByPlayService.getPlayByPlayFromDatabase(gameId, options);

    res.json({
      success: true,
      gameId: gameId,
      count: actions.length,
      actions: actions
    });
  } catch (error) {
    logger.error('Error getting play-by-play:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/nba/playbyplay/:gameId/by-period
 * Get play-by-play data grouped by period
 */
router.get('/playbyplay/:gameId/by-period', async (req, res) => {
  try {
    const { gameId } = req.params;
    const playByPlay = await nbaPlayByPlayService.getPlayByPlayByPeriod(gameId);

    res.json({
      success: true,
      gameId: gameId,
      playByPlay: playByPlay
    });
  } catch (error) {
    logger.error('Error getting play-by-play by period:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/nba/playbyplay/:gameId/edited
 * Get only edited actions for a game
 */
router.get('/playbyplay/:gameId/edited', async (req, res) => {
  try {
    const { gameId } = req.params;
    const editedActions = await nbaPlayByPlayService.getEditedActions(gameId);

    res.json({
      success: true,
      gameId: gameId,
      count: editedActions.length,
      actions: editedActions
    });
  } catch (error) {
    logger.error('Error getting edited actions:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/nba/playbyplay/:gameId/stats
 * Get edit statistics for a game
 */
router.get('/playbyplay/:gameId/stats', async (req, res) => {
  try {
    const { gameId } = req.params;
    const stats = await nbaPlayByPlayService.getEditStats(gameId);

    res.json({
      success: true,
      stats: stats
    });
  } catch (error) {
    logger.error('Error getting play-by-play stats:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/nba/playbyplay/:gameId/refresh
 * Manually refresh play-by-play data for a game
 */
router.post('/playbyplay/:gameId/refresh', async (req, res) => {
  try {
    const { gameId } = req.params;

    // Sync play-by-play
    const syncResult = await nbaPlayByPlayService.syncPlayByPlay(gameId);

    res.json({
      success: syncResult.success,
      message: syncResult.message,
      syncResult: syncResult
    });
  } catch (error) {
    logger.error('Error refreshing play-by-play:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/nba/game/:gameId/full
 * Get full game data including play-by-play and stats
 */
router.get('/game/:gameId/full', async (req, res) => {
  try {
    const { gameId } = req.params;
    const fullData = await nbaPlayByPlayService.getFullGameData(gameId);

    if (!fullData.game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found'
      });
    }

    res.json({
      success: true,
      data: fullData
    });
  } catch (error) {
    logger.error('Error getting full game data:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/nba/monitor/:gameId/start
 * Start monitoring a specific game
 * Body params:
 *   - startFresh: boolean (default true) - Whether to delete existing data and start fresh
 */
router.post('/monitor/:gameId/start', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { startFresh } = req.body;
    const game = await nbaMonitoringService.startMonitoringGame(gameId, false, startFresh);

    res.json({
      success: true,
      message: `Monitoring started for game ${gameId}${startFresh !== false ? ' (fresh start)' : ''}`,
      game: game
    });
  } catch (error) {
    logger.error('Error starting game monitoring:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/nba/monitor/:gameId/stop
 * Stop monitoring a specific game
 */
router.post('/monitor/:gameId/stop', async (req, res) => {
  try {
    const { gameId } = req.params;
    const game = await nbaMonitoringService.stopMonitoringGame(gameId);

    res.json({
      success: true,
      message: `Monitoring stopped for game ${gameId}`,
      game: game
    });
  } catch (error) {
    logger.error('Error stopping game monitoring:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/nba/monitoring/active
 * Get all games currently being monitored
 */
router.get('/monitoring/active', async (req, res) => {
  try {
    const monitoredGames = await nbaMonitoringService.getMonitoredGames();

    res.json({
      success: true,
      count: monitoredGames.length,
      games: monitoredGames
    });
  } catch (error) {
    logger.error('Error getting monitored games:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/nba/monitoring/stats
 * Get monitoring service statistics
 */
router.get('/monitoring/stats', async (req, res) => {
  try {
    const stats = nbaMonitoringService.getStats();

    res.json({
      success: true,
      stats: stats
    });
  } catch (error) {
    logger.error('Error getting monitoring stats:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/nba/playbyplay/:gameId/reset-edit-flags
 * Reset all edit flags for a game (clears hasSignificantEdit and editHistory)
 * Useful after fixing edit detection logic
 */
router.post('/playbyplay/:gameId/reset-edit-flags', async (req, res) => {
  try {
    const { gameId } = req.params;
    const NBAPlayByPlayAction = require('../models/NBAPlayByPlayAction');


    const result = await NBAPlayByPlayAction.updateMany(
      { gameId: gameId },
      {
        $set: {
          hasSignificantEdit: false,
          editHistory: [],
          lastEditTimeDiff: null,
          editCount: 0
        }
      }
    );

    res.json({
      success: true,
      message: 'Edit flags reset successfully',
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    logger.error('Error resetting edit flags:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/nba/monitoring/trigger-poll
 * Manually trigger a monitoring poll
 */
router.post('/monitoring/trigger-poll', async (req, res) => {
  try {
    await nbaMonitoringService.triggerPoll();

    res.json({
      success: true,
      message: 'Manual poll triggered successfully'
    });
  } catch (error) {
    logger.error('Error triggering manual poll:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/nba/monitoring/start-service
 * Start the monitoring service
 */
router.post('/monitoring/start-service', async (req, res) => {
  try {
    await nbaMonitoringService.start();

    res.json({
      success: true,
      message: 'Monitoring service started'
    });
  } catch (error) {
    logger.error('Error starting monitoring service:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/nba/monitoring/stop-service
 * Stop the monitoring service
 */
router.post('/monitoring/stop-service', async (req, res) => {
  try {
    nbaMonitoringService.stop();

    res.json({
      success: true,
      message: 'Monitoring service stopped'
    });
  } catch (error) {
    logger.error('Error stopping monitoring service:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/nba/playbyplay/:gameId/action/:actionNumber/review
 * Update review status for an action
 */
router.post('/playbyplay/:gameId/action/:actionNumber/review', async (req, res) => {
  try {
    const { gameId, actionNumber } = req.params;
    const { reviewStatus, reviewNote, reviewTags, flagPriority } = req.body;

    const action = await nbaPlayByPlayService.updateReviewStatus(
      gameId,
      parseInt(actionNumber),
      {
        reviewStatus,
        reviewNote,
        reviewTags,
        flagPriority
      }
    );

    res.json({
      success: true,
      action: action
    });
  } catch (error) {
    logger.error('Error updating review status:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/nba/playbyplay/:gameId/batch-approve
 * Batch approve all unedited actions
 */
router.post('/playbyplay/:gameId/batch-approve', async (req, res) => {
  try {
    const { gameId } = req.params;

    const result = await nbaPlayByPlayService.batchApproveUnedited(gameId);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Error batch approving:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/nba/playbyplay/:gameId/clear-reviewed
 * Clear all review statuses (reset to unreviewed)
 */
router.post('/playbyplay/:gameId/clear-reviewed', async (req, res) => {
  try {
    const { gameId } = req.params;

    const result = await nbaPlayByPlayService.clearAllReviews(gameId);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Error clearing reviews:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/nba/playbyplay/:gameId/review-stats
 * Get review statistics for a game
 */
router.get('/playbyplay/:gameId/review-stats', async (req, res) => {
  try {
    const { gameId } = req.params;

    const stats = await nbaPlayByPlayService.getReviewStats(gameId);

    res.json({
      success: true,
      stats: stats
    });
  } catch (error) {
    logger.error('Error getting review stats:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/nba/boxscore/:gameId
 * Fetch NBA boxscore from PDF
 */
router.get('/boxscore/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { saveToDb } = req.query;

    logger.debug(`Fetching boxscore for game ${gameId}...`);

    const boxscoreData = await nbaBoxscoreModule.fetchBoxscoreFromApi(gameId);

    // Optionally save to ScrapedData for comparison
    if (saveToDb === 'true') {
      await nbaBoxscoreModule.saveToScrapedData(gameId, boxscoreData);
    }

    res.json({
      success: true,
      gameId: gameId,
      data: boxscoreData
    });
  } catch (error) {
    logger.error('Error fetching boxscore:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      error: error.stack
    });
  }
});

/**
 * POST /api/nba/boxscore/:gameId/save
 * Fetch and save NBA boxscore to ScrapedData
 */
router.post('/boxscore/:gameId/save', async (req, res) => {
  try {
    const { gameId } = req.params;

    logger.debug(`Fetching and saving boxscore for game ${gameId}...`);

    const boxscoreData = await nbaBoxscoreModule.fetchBoxscoreFromApi(gameId);
    const saved = await nbaBoxscoreModule.saveToScrapedData(gameId, boxscoreData);

    res.json({
      success: true,
      gameId: gameId,
      saved: saved.length,
      data: boxscoreData
    });
  } catch (error) {
    logger.error('Error saving boxscore:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      error: error.stack
    });
  }
});

module.exports = router;
