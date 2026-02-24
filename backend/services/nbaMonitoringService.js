const cron = require('node-cron');
const NBAGame = require('../models/NBAGame');
const nbaScheduleModule = require('../modules/nba-schedule');
const nbaPlayByPlayService = require('./nbaPlayByPlayService');
const logger = require('../utils/logger');

class NBAMonitoringService {
  constructor() {
    this.isRunning = false;
    this.cronJob = null;
    this.pollingInterval = null;
    this.currentPollInterval = 30000; // Start with 30 seconds
    this.stats = {
      lastRun: null,
      totalRuns: 0,
      gamesMonitored: 0,
      totalPolls: 0,
      errors: 0
    };
  }

  /**
   * Get smart polling interval based on monitored game count
   * - If games are being monitored: 30 seconds
   * - If no games monitored: 5 minutes (just to check if any were started)
   */
  getSmartPollInterval(hasActiveGames) {
    // If we have games being monitored, poll frequently
    if (hasActiveGames) {
      return 30000; // 30 seconds
    }

    // No games monitored, check infrequently
    return 300000; // 5 minutes
  }

  /**
   * Start the monitoring service
   * Syncs today's games and starts polling every 30 seconds
   */
  async start() {
    if (this.isRunning) {
      logger.debug('NBA Monitoring Service is already running');
      return;
    }

    logger.debug('Starting NBA Monitoring Service...');
    this.isRunning = true;

    // Initial sync of today's games
    try {
      await this.syncTodaysGames();
    } catch (error) {
      logger.error('Error during initial game sync:', error.message);
    }

    // Start polling with smart intervals
    this.schedulePoll();

    // Schedule daily sync at midnight to refresh today's games
    this.cronJob = cron.schedule('0 0 * * *', async () => {
      logger.debug('Daily sync: Refreshing today\'s games...');
      await this.syncTodaysGames();
    });

    logger.debug('NBA Monitoring Service started successfully');
    logger.debug('- Polling active games every 30 seconds');
    logger.debug('- Daily game sync scheduled for midnight');
  }

  /**
   * Stop the monitoring service
   */
  stop() {
    if (!this.isRunning) {
      logger.debug('NBA Monitoring Service is not running');
      return;
    }

    logger.debug('Stopping NBA Monitoring Service...');

    if (this.pollingInterval) {
      clearTimeout(this.pollingInterval);
      this.pollingInterval = null;
    }

    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }

    this.isRunning = false;
    logger.debug('NBA Monitoring Service stopped');
  }

  /**
   * Sync today's games from NBA API to database
   */
  async syncTodaysGames() {
    try {
      logger.debug('Syncing today\'s NBA games...');
      const games = await nbaScheduleModule.syncTodaysGames();
      logger.debug(`Synced ${games.length} games for today`);

      // Auto-enable monitoring for games in progress
      const gamesInProgress = games.filter(g => g.gameStatus === 2);
      for (const game of gamesInProgress) {
        if (!game.isMonitoring) {
          await this.startMonitoringGame(game.gameId, true); // true = auto-started
        }
      }

      return games;
    } catch (error) {
      logger.error('Error syncing today\'s games:', error.message);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Schedule the next poll with smart interval
   */
  async schedulePoll() {
    if (!this.isRunning) return;

    // Clear any existing interval
    if (this.pollingInterval) {
      clearTimeout(this.pollingInterval);
    }

    // Get all monitored games to determine interval
    const monitoredGames = await NBAGame.find({
      isMonitoring: true,
      isRefreshing: { $ne: true }
    });

    const hasActiveGames = monitoredGames.length > 0;
    const nextInterval = this.getSmartPollInterval(hasActiveGames);

    // Log interval changes
    if (nextInterval !== this.currentPollInterval) {
      const intervalDesc = nextInterval === 30000 ? '30 seconds' :
                          nextInterval === 60000 ? '1 minute' : '5 minutes';
      logger.debug(`📊 Adjusting poll interval to ${intervalDesc} (${hasActiveGames ? 'active games' : 'no active games'})`);
      this.currentPollInterval = nextInterval;
    }

    // Schedule next poll
    this.pollingInterval = setTimeout(async () => {
      await this.pollActiveGames();
      await this.schedulePoll(); // Reschedule after poll completes
    }, nextInterval);
  }

  /**
   * Poll all active games being monitored
   */
  async pollActiveGames() {
    if (!this.isRunning) return;

    try {
      this.stats.lastRun = new Date();
      this.stats.totalRuns++;

      // Get all games currently being monitored (exclude games being refreshed to avoid race conditions)
      const monitoredGames = await NBAGame.find({
        isMonitoring: true,
        isRefreshing: { $ne: true }
      });

      if (monitoredGames.length === 0) {
        // No games being monitored, nothing to do
        return;
      }

      logger.debug(`🔄 Polling ${monitoredGames.length} monitored games...`);

      for (const game of monitoredGames) {
        await this.pollGame(game);
      }

      this.stats.gamesMonitored = monitoredGames.length;
    } catch (error) {
      logger.error('Error polling active games:', error.message);
      this.stats.errors++;
    }
  }

  /**
   * Poll a single game
   * @param {Object} game - Game document
   */
  async pollGame(game) {
    try {
      this.stats.totalPolls++;

      // Fetch boxscore for live game data (scores, period, clock, officials, attendance)
      const boxscoreResult = await nbaPlayByPlayService.syncBoxscore(game.gameId);

      if (boxscoreResult.success) {
        logger.debug(`Updated boxscore: ${boxscoreResult.score} - Q${boxscoreResult.period} ${boxscoreResult.gameClock}`);
      }

      // Fetch and sync play-by-play
      const syncResult = await nbaPlayByPlayService.syncPlayByPlay(game.gameId);

      if (syncResult.success && syncResult.significantEdits > 0) {
        logger.debug(`🔔 Game ${game.gameId}: ${syncResult.significantEdits} SIGNIFICANT EDITS detected!`);
      }

      // Update poll tracking
      game.lastPolledAt = new Date();
      game.pollCount += 1;
      await game.save();

      // Check if we should stop monitoring
      if (game.gameStatus === 3 && game.shouldStopMonitoring()) {
        logger.debug(`Game ${game.gameId} finished over 20 minutes ago, stopping monitoring`);
        await this.stopMonitoringGame(game.gameId);
      }
    } catch (error) {
      logger.error(`Error polling game ${game.gameId}:`, error.message);
      this.stats.errors++;
    }
  }

  /**
   * Find a game in schedule data
   * @param {Object} scheduleData - Schedule data from API
   * @param {string} gameId - Game ID to find
   * @returns {Object|null} Game data or null
   */
  findGameInSchedule(scheduleData, gameId) {
    for (const gameDate of scheduleData.leagueSchedule.gameDates) {
      const game = gameDate.games.find(g => g.gameId === gameId);
      if (game) return game;
    }
    return null;
  }

  /**
   * Start monitoring a specific game
   * @param {string} gameId - NBA game ID
   * @param {boolean} autoStarted - Whether this was auto-started
   * @param {boolean} startFresh - Whether to delete existing play-by-play data (default: true for manual start)
   * @returns {Promise<Object>} Updated game document
   */
  async startMonitoringGame(gameId, autoStarted = false, startFresh = null) {
    try {
      let game = await NBAGame.findOne({ gameId: gameId });

      if (!game) {
        // Game not in database, need to sync it first
        logger.debug(`Game ${gameId} not in database, syncing from API...`);
        await nbaScheduleModule.syncTodaysGames();
        game = await NBAGame.findOne({ gameId: gameId });

        if (!game) {
          throw new Error(`Game ${gameId} not found`);
        }
      }

      if (game.isMonitoring && !startFresh) {
        logger.debug(`Game ${gameId} is already being monitored`);
        return game;
      }

      // Default: start fresh for manual monitoring, keep data for auto-start
      if (startFresh === null) {
        startFresh = !autoStarted;
      }

      // START FRESH: Use refresh lock to prevent auto-polling race condition
      if (startFresh) {
        logger.debug(`🗑️  Starting fresh: Deleting existing play-by-play data for game ${gameId}`);

        // 1. Set refresh lock and disable monitoring temporarily (prevents auto-polling from interfering)
        game.isRefreshing = true;
        game.isMonitoring = false;
        await game.save();

        // 2. Delete all existing play-by-play data for clean baseline
        await nbaPlayByPlayService.deletePlayByPlay(gameId);

        // 3. Fetch fresh play-by-play data (this becomes the baseline)
        await nbaPlayByPlayService.syncPlayByPlay(gameId);

        // 4. Enable monitoring and remove refresh lock
        game.isMonitoring = true;
        game.isRefreshing = false;
        game.monitoringStartedAt = new Date();
        await game.save();

        logger.debug(`✓ Monitoring manually started (FRESH START) for game ${gameId} (${game.awayTeam?.teamTricode} @ ${game.homeTeam?.teamTricode})`);
      } else {
        // Normal start without fresh data
        game.isMonitoring = true;
        game.monitoringStartedAt = new Date();
        await game.save();

        const startType = autoStarted ? 'auto-started' : 'manually started';
        logger.debug(`✓ Monitoring ${startType} for game ${gameId} (${game.awayTeam?.teamTricode} @ ${game.homeTeam?.teamTricode})`);

        // Immediately fetch play-by-play
        await nbaPlayByPlayService.syncPlayByPlay(gameId);
      }

      return game;
    } catch (error) {
      logger.error(`Error starting monitoring for game ${gameId}:`, error.message);

      // Clean up refresh lock on error
      try {
        const game = await NBAGame.findOne({ gameId: gameId });
        if (game && game.isRefreshing) {
          game.isRefreshing = false;
          await game.save();
        }
      } catch (cleanupError) {
        logger.error(`Error cleaning up refresh lock:`, cleanupError.message);
      }

      throw error;
    }
  }

  /**
   * Stop monitoring a specific game
   * @param {string} gameId - NBA game ID
   * @returns {Promise<Object>} Updated game document
   */
  async stopMonitoringGame(gameId) {
    try {
      const game = await NBAGame.findOne({ gameId: gameId });

      if (!game) {
        throw new Error(`Game ${gameId} not found`);
      }

      if (!game.isMonitoring) {
        logger.debug(`Game ${gameId} is not being monitored`);
        return game;
      }

      game.isMonitoring = false;
      await game.save();

      logger.debug(`✓ Stopped monitoring game ${gameId}`);

      return game;
    } catch (error) {
      logger.error(`Error stopping monitoring for game ${gameId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get currently monitored games
   * @returns {Promise<Array>} Array of monitored game documents
   */
  async getMonitoredGames() {
    return await NBAGame.find({ isMonitoring: true }).sort({ gameDateTimeEst: 1 });
  }

  /**
   * Get monitoring statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      lastRun: null,
      totalRuns: 0,
      gamesMonitored: 0,
      totalPolls: 0,
      errors: 0
    };
    logger.debug('Monitoring statistics reset');
  }

  /**
   * Manually trigger a poll (for testing or manual refresh)
   */
  async triggerPoll() {
    logger.debug('Manual poll triggered');
    await this.pollActiveGames();
  }
}

// Export singleton instance
module.exports = new NBAMonitoringService();
