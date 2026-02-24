const axios = require('axios');
const NBAGame = require('../models/NBAGame');
const NBAPlayByPlayAction = require('../models/NBAPlayByPlayAction');
const logger = require('../utils/logger');

class NBAPlayByPlayService {
  constructor() {
    this.playByPlayUrlTemplate = 'https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_{gameId}.json';
    this.boxscoreUrlTemplate = 'https://cdn.nba.com/static/json/liveData/boxscore/boxscore_{gameId}.json';
  }

  /**
   * Fetch play-by-play data from NBA API
   * @param {string} gameId - NBA game ID
   * @returns {Promise<Object>} Play-by-play data
   */
  async fetchPlayByPlay(gameId) {
    try {
      const url = this.playByPlayUrlTemplate.replace('{gameId}', gameId);
      logger.debug(`Fetching play-by-play for game ${gameId}...`);

      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });

      logger.debug(`Fetched ${response.data.game.actions.length} actions for game ${gameId}`);
      return response.data;
    } catch (error) {
      // If 404, game might not have started yet or play-by-play not available
      if (error.response && error.response.status === 404) {
        logger.debug(`Play-by-play not available yet for game ${gameId}`);
        return null;
      }

      logger.error(`Error fetching play-by-play for game ${gameId}:`, error.message);
      throw new Error(`Failed to fetch play-by-play: ${error.message}`);
    }
  }

  /**
   * Fetch boxscore data from NBA API
   * @param {string} gameId - NBA game ID
   * @returns {Promise<Object>} Boxscore data
   */
  async fetchBoxscore(gameId) {
    try {
      const url = this.boxscoreUrlTemplate.replace('{gameId}', gameId);
      logger.debug(`Fetching boxscore for game ${gameId}...`);

      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });

      logger.debug(`Fetched boxscore for game ${gameId}`);
      return response.data;
    } catch (error) {
      // If 404, game might not have started yet or boxscore not available
      if (error.response && error.response.status === 404) {
        logger.debug(`Boxscore not available yet for game ${gameId}`);
        return null;
      }

      logger.error(`Error fetching boxscore for game ${gameId}:`, error.message);
      throw new Error(`Failed to fetch boxscore: ${error.message}`);
    }
  }

  /**
   * Save or update a single action in database
   * @param {string} gameId - NBA game ID
   * @param {Object} actionData - Action data from API
   * @returns {Promise<Object>} Saved action document
   */
  async saveAction(gameId, actionData) {
    try {
      let action = await NBAPlayByPlayAction.findOne({
        gameId: gameId,
        actionNumber: actionData.actionNumber
      });

      if (action) {
        // Update existing action and detect changes
        const hasChanges = action.updateFromApiData(actionData);
        await action.save();

        if (hasChanges) {
          logger.debug(`Action ${actionData.actionNumber} updated for game ${gameId} (${action.hasSignificantEdit ? 'SIGNIFICANT EDIT' : 'minor update'})`);
        }

        return action;
      } else {
        // Create new action
        action = new NBAPlayByPlayAction({
          gameId: gameId,
          actionNumber: actionData.actionNumber
        });
        action.updateFromApiData(actionData);
        await action.save();

        return action;
      }
    } catch (error) {
      logger.error(`Error saving action ${actionData.actionNumber} for game ${gameId}:`, error.message);
      throw error;
    }
  }

  /**
   * Sync play-by-play data to database
   * @param {string} gameId - NBA game ID
   * @returns {Promise<Object>} Sync results with stats
   */
  async syncPlayByPlay(gameId) {
    try {
      const playByPlayData = await this.fetchPlayByPlay(gameId);

      if (!playByPlayData || !playByPlayData.game || !playByPlayData.game.actions) {
        return {
          success: false,
          gameId: gameId,
          message: 'Play-by-play data not available',
          actionsProcessed: 0,
          actionsUpdated: 0,
          actionsCreated: 0,
          significantEdits: 0
        };
      }

      const actions = playByPlayData.game.actions;
      let actionsCreated = 0;
      let actionsUpdated = 0;
      let significantEdits = 0;
      let actionsDeleted = 0;

      logger.debug(`Syncing ${actions.length} actions for game ${gameId}...`);

      // Get action numbers from API
      const apiActionNumbers = new Set(actions.map(a => a.actionNumber));

      // Check for deleted actions (in DB but not in API)
      const existingActions = await NBAPlayByPlayAction.find({
        gameId: gameId,
        isDeleted: false
      });

      for (const existingAction of existingActions) {
        if (!apiActionNumbers.has(existingAction.actionNumber)) {
          // Action was deleted by NBA
          existingAction.isDeleted = true;
          existingAction.deletedAt = new Date();
          existingAction.hasSignificantEdit = true; // Flag deletions for review
          await existingAction.save();
          actionsDeleted++;
          logger.debug(`🗑️  Action ${existingAction.actionNumber} was DELETED by NBA`);
        }
      }

      // Sync actions from API
      for (const actionData of actions) {
        const existingAction = await NBAPlayByPlayAction.findOne({
          gameId: gameId,
          actionNumber: actionData.actionNumber
        });

        const isNew = !existingAction;
        const action = await this.saveAction(gameId, actionData);

        // If action was previously marked as deleted but now exists, undelete it
        if (action.isDeleted) {
          action.isDeleted = false;
          action.deletedAt = null;
          await action.save();
          logger.debug(`♻️  Action ${action.actionNumber} was RESTORED by NBA`);
        }

        if (isNew) {
          actionsCreated++;
        } else {
          actionsUpdated++;
        }

        if (action.hasSignificantEdit) {
          significantEdits++;
        }
      }

      logger.debug(`Synced game ${gameId}: ${actionsCreated} created, ${actionsUpdated} updated, ${actionsDeleted} deleted, ${significantEdits} significant edits`);

      return {
        success: true,
        gameId: gameId,
        message: 'Play-by-play synced successfully',
        actionsProcessed: actions.length,
        actionsCreated: actionsCreated,
        actionsUpdated: actionsUpdated,
        actionsDeleted: actionsDeleted,
        significantEdits: significantEdits,
        meta: playByPlayData.meta
      };
    } catch (error) {
      logger.error(`Error syncing play-by-play for game ${gameId}:`, error.message);
      return {
        success: false,
        gameId: gameId,
        message: error.message,
        actionsProcessed: 0,
        actionsCreated: 0,
        actionsUpdated: 0,
        significantEdits: 0
      };
    }
  }

  /**
   * Sync boxscore data to database
   * @param {string} gameId - NBA game ID
   * @returns {Promise<Object>} Sync results
   */
  async syncBoxscore(gameId) {
    try {
      const boxscoreData = await this.fetchBoxscore(gameId);

      if (!boxscoreData) {
        return {
          success: false,
          gameId: gameId,
          message: 'Boxscore data not available'
        };
      }

      // Find game in database
      const game = await NBAGame.findOne({ gameId: gameId });

      if (!game) {
        logger.debug(`Game ${gameId} not found in database, cannot update boxscore`);
        return {
          success: false,
          gameId: gameId,
          message: 'Game not found in database'
        };
      }

      // Update game with boxscore data
      game.updateFromBoxscore(boxscoreData);
      await game.save();

      logger.debug(`Updated boxscore for game ${gameId}: Period ${game.period}, Clock: ${game.gameClock}, Score: ${game.awayTeam?.score}-${game.homeTeam?.score}`);

      return {
        success: true,
        gameId: gameId,
        message: 'Boxscore synced successfully',
        period: game.period,
        gameClock: game.gameClock,
        score: `${game.awayTeam?.score}-${game.homeTeam?.score}`,
        attendance: game.attendance,
        officials: game.officials?.length || 0
      };
    } catch (error) {
      logger.error(`Error syncing boxscore for game ${gameId}:`, error.message);
      return {
        success: false,
        gameId: gameId,
        message: error.message
      };
    }
  }

  /**
   * Get play-by-play actions from database
   * @param {string} gameId - NBA game ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of action documents
   */
  async getPlayByPlayFromDatabase(gameId, options = {}) {
    const query = { gameId: gameId };

    if (options.period) {
      query.period = options.period;
    }

    if (options.onlyEdited) {
      query.hasSignificantEdit = true;
    }

    return await NBAPlayByPlayAction.find(query)
      .sort({ period: 1, orderNumber: 1 })
      .lean();
  }

  /**
   * Get play-by-play actions grouped by period
   * @param {string} gameId - NBA game ID
   * @returns {Promise<Object>} Actions grouped by period
   */
  async getPlayByPlayByPeriod(gameId) {
    const actions = await this.getPlayByPlayFromDatabase(gameId);

    const byPeriod = {};
    for (const action of actions) {
      if (!byPeriod[action.period]) {
        byPeriod[action.period] = [];
      }
      byPeriod[action.period].push(action);
    }

    return byPeriod;
  }

  /**
   * Get only edited actions for a game
   * @param {string} gameId - NBA game ID
   * @returns {Promise<Array>} Array of edited actions
   */
  async getEditedActions(gameId) {
    return await NBAPlayByPlayAction.find({
      gameId: gameId,
      hasSignificantEdit: true
    })
      .sort({ period: 1, orderNumber: 1 })
      .lean();
  }

  /**
   * Get edit statistics for a game
   * @param {string} gameId - NBA game ID
   * @returns {Promise<Object>} Edit statistics
   */
  async getEditStats(gameId) {
    const totalActions = await NBAPlayByPlayAction.countDocuments({ gameId: gameId });
    const editedActions = await NBAPlayByPlayAction.countDocuments({
      gameId: gameId,
      hasSignificantEdit: true
    });

    const actionsWithEdits = await NBAPlayByPlayAction.find({
      gameId: gameId,
      hasSignificantEdit: true
    }).lean();

    const totalEdits = actionsWithEdits.reduce((sum, action) => {
      return sum + (action.editHistory ? action.editHistory.length : 0);
    }, 0);

    const avgTimeDiff = actionsWithEdits.length > 0
      ? actionsWithEdits.reduce((sum, action) => sum + (action.lastEditTimeDiff || 0), 0) / actionsWithEdits.length
      : 0;

    return {
      gameId: gameId,
      totalActions: totalActions,
      editedActions: editedActions,
      totalEdits: totalEdits,
      editPercentage: totalActions > 0 ? ((editedActions / totalActions) * 100).toFixed(2) : 0,
      averageEditTimeDiff: Math.round(avgTimeDiff)
    };
  }

  /**
   * Delete play-by-play data for a game
   * @param {string} gameId - NBA game ID
   * @returns {Promise<Object>} Delete result
   */
  async deletePlayByPlay(gameId) {
    const result = await NBAPlayByPlayAction.deleteMany({ gameId: gameId });
    logger.debug(`Deleted ${result.deletedCount} actions for game ${gameId}`);
    return result;
  }

  /**
   * Clear old play-by-play data
   * @param {number} daysToKeep - Number of days to keep
   * @returns {Promise<Object>} Delete result
   */
  async clearOldPlayByPlay(daysToKeep = 7) {
    // Get game IDs to keep
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const gamesToKeep = await NBAGame.find({
      gameDate: { $gte: cutoffDate }
    }).distinct('gameId');

    const result = await NBAPlayByPlayAction.deleteMany({
      gameId: { $nin: gamesToKeep }
    });

    logger.debug(`Cleared ${result.deletedCount} old play-by-play actions (older than ${daysToKeep} days)`);
    return result;
  }

  /**
   * Get full game data with play-by-play
   * @param {string} gameId - NBA game ID
   * @returns {Promise<Object>} Game data with play-by-play
   */
  async getFullGameData(gameId) {
    const game = await NBAGame.findOne({ gameId: gameId }).lean();
    const playByPlay = await this.getPlayByPlayByPeriod(gameId);
    const editStats = await this.getEditStats(gameId);

    return {
      game: game,
      playByPlay: playByPlay,
      editStats: editStats
    };
  }

  /**
   * Update review status for an action
   * @param {string} gameId - NBA game ID
   * @param {number} actionNumber - Action number
   * @param {Object} reviewData - Review data (reviewStatus, reviewNote, reviewTags, flagPriority)
   * @returns {Promise<Object>} Updated action
   */
  async updateReviewStatus(gameId, actionNumber, reviewData) {
    const action = await NBAPlayByPlayAction.findOne({
      gameId: gameId,
      actionNumber: actionNumber
    });

    if (!action) {
      throw new Error(`Action ${actionNumber} not found for game ${gameId}`);
    }

    if (reviewData.reviewStatus) {
      action.reviewStatus = reviewData.reviewStatus;
      action.reviewedAt = new Date();

      // Clear re-edited flag when reviewing
      if (reviewData.reviewStatus === 'approved' || reviewData.reviewStatus === 'flagged') {
        action.wasReEditedAfterApproval = false;
      }
    }

    if (reviewData.reviewNote !== undefined) {
      action.reviewNote = reviewData.reviewNote;
    }

    if (reviewData.reviewTags) {
      action.reviewTags = reviewData.reviewTags;
    }

    if (reviewData.flagPriority) {
      action.flagPriority = reviewData.flagPriority;
    }

    await action.save();
    return action;
  }

  /**
   * Batch approve all unedited actions
   * @param {string} gameId - NBA game ID
   * @returns {Promise<Object>} Result with count
   */
  async batchApproveUnedited(gameId) {
    const result = await NBAPlayByPlayAction.updateMany(
      {
        gameId: gameId,
        hasSignificantEdit: false,
        reviewStatus: 'unreviewed'
      },
      {
        $set: {
          reviewStatus: 'approved',
          reviewedAt: new Date()
        }
      }
    );

    return {
      message: 'Batch approval completed',
      approvedCount: result.modifiedCount
    };
  }

  /**
   * Clear all review statuses for a game
   * @param {string} gameId - NBA game ID
   * @returns {Promise<Object>} Result with count
   */
  async clearAllReviews(gameId) {
    const result = await NBAPlayByPlayAction.updateMany(
      {
        gameId: gameId
      },
      {
        $set: {
          reviewStatus: 'unreviewed',
          reviewedAt: null,
          reviewNote: null,
          reviewTags: [],
          wasReEditedAfterApproval: false
        }
      }
    );

    return {
      message: 'All reviews cleared',
      clearedCount: result.modifiedCount
    };
  }

  /**
   * Get review statistics for a game
   * @param {string} gameId - NBA game ID
   * @returns {Promise<Object>} Review stats
   */
  async getReviewStats(gameId) {
    const total = await NBAPlayByPlayAction.countDocuments({ gameId: gameId });
    const unreviewed = await NBAPlayByPlayAction.countDocuments({
      gameId: gameId,
      reviewStatus: 'unreviewed'
    });
    const approved = await NBAPlayByPlayAction.countDocuments({
      gameId: gameId,
      reviewStatus: 'approved'
    });
    const flagged = await NBAPlayByPlayAction.countDocuments({
      gameId: gameId,
      reviewStatus: 'flagged'
    });
    const reEdited = await NBAPlayByPlayAction.countDocuments({
      gameId: gameId,
      wasReEditedAfterApproval: true
    });
    const multipleEdits = await NBAPlayByPlayAction.countDocuments({
      gameId: gameId,
      editCount: { $gt: 1 }
    });

    return {
      total,
      unreviewed,
      approved,
      flagged,
      reEdited,
      multipleEdits,
      reviewProgress: total > 0 ? Math.round(((approved + flagged) / total) * 100) : 0
    };
  }
}

module.exports = new NBAPlayByPlayService();
