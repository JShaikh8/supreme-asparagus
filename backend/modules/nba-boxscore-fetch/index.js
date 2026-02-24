const nbaBoxscoreModule = require('../nba-boxscore');
const nbaScheduleModule = require('../nba-schedule');
const ScrapedData = require('../../models/ScrapedData');
const logger = require('../../utils/logger');

/**
 * NBA Boxscore Fetch Module - Adapter for FetchDashboard
 * Team-specific boxscore fetching with date-scoped delete
 */
class NBABoxscoreFetchModule {
  constructor() {
    // Use config from main module for consistency
    this.config = nbaBoxscoreModule.config;
  }

  /**
   * Fetch NBA boxscores for a specific team's games
   * @param {Object} team - Team object with nbaTeamId
   * @param {number} season - Season year (not used - NBA uses date-based fetching)
   * @param {string} targetDate - Date to fetch boxscores for (YYYY-MM-DD), or null for date range
   * @param {Object} options - Fetch options including startDate, endDate
   * @returns {Promise<Array>} Array of ScrapedData documents
   */
  async fetchTeamStats(team, season, targetDate, options = {}) {
    try {
      if (!team.nbaTeamId) {
        throw new Error(`Team ${team.teamId} does not have an nbaTeamId configured`);
      }

      logger.info(`🔍 fetchTeamStats called with: targetDate=${targetDate}, options=${JSON.stringify(options)}`);

      // Determine date range
      let startDate, endDate;
      if (targetDate) {
        // Single date specified
        startDate = targetDate;
        endDate = targetDate;
      } else {
        // Use options or default: Oct 22, 2025 to today
        const now = new Date();
        startDate = options.startDate || '2025-10-22'; // Season start
        endDate = options.endDate || now.toISOString().slice(0, 10); // Today
      }

      logger.info(`📦 Fetching NBA boxscores for team ${team.teamName} (${team.nbaTeamId}) from ${startDate} to ${endDate}`);

      // Calculate date range for filtering
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setDate(end.getDate() + 1);

      logger.info(`📅 Date range: start=${start.toISOString()}, end=${end.toISOString()}`);

      // Date-scoped delete: Only clear boxscore data within the specified date range
      const deleteResult = await ScrapedData.deleteMany({
        teamId: team.teamId,
        moduleId: this.config.id,
        'data.gameDate': {
          $gte: start.toISOString().slice(0, 10),
          $lte: end.toISOString().slice(0, 10)
        }
      });
      logger.debug(`Cleared ${deleteResult.deletedCount} existing boxscore entries for ${team.teamName} between ${startDate} and ${endDate}`);

      // Get team's schedule to find their games
      const schedule = await nbaScheduleModule.getSchedule();

      // Filter games for this team in the date range
      const teamGames = [];
      for (const dateEntry of schedule.leagueSchedule.gameDates) {
        for (const game of dateEntry.games) {
          const gameDate = new Date(game.gameDateTimeEst);

          // Check if game is in date range and involves this team
          if (gameDate >= start && gameDate < end) {
            const isHomeTeam = String(game.homeTeam.teamId) === String(team.nbaTeamId);
            const isAwayTeam = String(game.awayTeam.teamId) === String(team.nbaTeamId);

            if (isHomeTeam || isAwayTeam) {
              // Only fetch completed games
              if (game.gameStatus === 3) {
                teamGames.push(game);
              } else {
                logger.debug(`Skipping game ${game.gameId} - not completed (status: ${game.gameStatus})`);
              }
            }
          }
        }
      }

      if (teamGames.length === 0) {
        logger.info(`⚠️ No completed games found for ${team.teamName} between ${startDate} and ${endDate}`);
        return [];
      }

      logger.info(`✅ Found ${teamGames.length} completed games for ${team.teamName}`);

      // Fetch and save boxscore for each game
      const allSavedDocs = [];
      for (const game of teamGames) {
        try {
          logger.debug(`Fetching boxscore for game ${game.gameId}...`);
          const boxscoreData = await nbaBoxscoreModule.fetchBoxscoreFromApi(game.gameId);

          // Always save to ScrapedData
          const savedDocs = await nbaBoxscoreModule.saveToScrapedData(game.gameId, boxscoreData, team.teamId);
          allSavedDocs.push(...savedDocs);

        } catch (error) {
          logger.error(`Error fetching boxscore for game ${game.gameId}:`, error.message);
          // Continue with next game even if one fails
        }
      }

      logger.debug(`Successfully fetched and saved ${allSavedDocs.length} player boxscores for ${team.teamName}`);
      return allSavedDocs;

    } catch (error) {
      logger.error('Error fetching NBA boxscores:', error);
      throw error;
    }
  }
}

module.exports = NBABoxscoreFetchModule;
