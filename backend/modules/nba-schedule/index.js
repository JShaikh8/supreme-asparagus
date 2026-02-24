const axios = require('axios');
const NBAGame = require('../../models/NBAGame');
const ScrapedData = require('../../models/ScrapedData');
const ScrapedDataHistory = require('../../models/ScrapedDataHistory');
const crypto = require('crypto');
const logger = require('../../utils/logger');

class NBAScheduleModule {
  constructor() {
    this.config = {
      id: 'nba_schedule',
      name: 'NBA Schedule',
      league: 'NBA',
      sport: 'basketball',
      dataType: 'schedule'
    };
    this.scheduleUrl = 'https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json';
    this.cacheDuration = 5 * 60 * 1000; // 5 minutes cache
    this.lastFetch = null;
    this.cachedSchedule = null;
  }

  /**
   * Fetch full season schedule from NBA API
   * @returns {Promise<Object>} Schedule data with meta and leagueSchedule
   */
  async fetchSchedule() {
    try {
      logger.debug('Fetching NBA schedule from API...');
      const response = await axios.get(this.scheduleUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });

      this.lastFetch = Date.now();
      this.cachedSchedule = response.data;

      logger.debug(`Fetched NBA schedule: ${response.data.leagueSchedule.gameDates.length} game dates`);
      return response.data;
    } catch (error) {
      logger.error('Error fetching NBA schedule:', error.message);
      throw new Error(`Failed to fetch NBA schedule: ${error.message}`);
    }
  }

  /**
   * Get cached schedule or fetch if cache expired
   * @returns {Promise<Object>} Schedule data
   */
  async getSchedule() {
    const now = Date.now();
    if (this.cachedSchedule && this.lastFetch && (now - this.lastFetch) < this.cacheDuration) {
      logger.debug('Returning cached NBA schedule');
      return this.cachedSchedule;
    }

    return await this.fetchSchedule();
  }

  /**
   * Get games for a specific date
   * @param {Date|string} date - Date to get games for
   * @returns {Promise<Array>} Array of games
   */
  async getGamesForDate(date) {
    const schedule = await this.getSchedule();
    const targetDate = new Date(date);
    const targetDateStr = this.formatDateForComparison(targetDate);

    const gameDateEntry = schedule.leagueSchedule.gameDates.find(gd => {
      const gameDate = this.parseNBADate(gd.gameDate);
      return this.formatDateForComparison(gameDate) === targetDateStr;
    });

    return gameDateEntry ? gameDateEntry.games : [];
  }

  /**
   * Get today's games
   * @returns {Promise<Array>} Array of today's games
   */
  async getTodaysGames() {
    const today = new Date();
    return await this.getGamesForDate(today);
  }

  /**
   * Parse NBA date format (MM/DD/YYYY HH:MM:SS) to Date object
   * @param {string} nbaDateString - Date string from NBA API
   * @returns {Date} Parsed date
   */
  parseNBADate(nbaDateString) {
    if (!nbaDateString) return new Date();

    // NBA API format: "10/02/2025 00:00:00"
    // Split into date and time parts
    const [datePart, timePart] = nbaDateString.split(' ');
    const [month, day, year] = datePart.split('/');
    const [hours, minutes, seconds] = (timePart || '00:00:00').split(':');

    // Create date with explicit values (months are 0-indexed in JS)
    return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hours),
      parseInt(minutes),
      parseInt(seconds)
    );
  }

  /**
   * Format date for comparison (YYYY-MM-DD)
   * @param {Date} date
   * @returns {string}
   */
  formatDateForComparison(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Save or update game in database
   * @param {Object} gameData - Game data from API
   * @returns {Promise<Object>} Saved game document
   */
  async saveGame(gameData) {
    try {
      let game = await NBAGame.findOne({ gameId: gameData.gameId });

      if (game) {
        // Update existing game
        game.updateFromApiData(gameData);
        game.lastPolledAt = new Date();
        game.pollCount += 1;
      } else {
        // Create new game - parse NBA date format properly
        game = new NBAGame({
          gameId: gameData.gameId,
          gameDate: this.parseNBADate(gameData.gameDate),
          lastPolledAt: new Date(),
          pollCount: 1
        });
        game.updateFromApiData(gameData);
      }

      await game.save();
      return game;
    } catch (error) {
      logger.error(`Error saving game ${gameData.gameId}:`, error.message);
      logger.error('Game data:', JSON.stringify(gameData, null, 2));
      throw error;
    }
  }

  /**
   * Sync today's games to database
   * @returns {Promise<Array>} Array of saved game documents
   */
  async syncTodaysGames() {
    try {
      const games = await this.getTodaysGames();
      logger.debug(`Syncing ${games.length} games for today...`);

      const savedGames = [];
      for (const gameData of games) {
        const savedGame = await this.saveGame(gameData);
        savedGames.push(savedGame);
      }

      logger.debug(`Synced ${savedGames.length} games to database`);
      return savedGames;
    } catch (error) {
      logger.error('Error syncing today\'s games:', error.message);
      throw error;
    }
  }

  /**
   * Sync games for a specific date to database
   * @param {Date|string} date
   * @returns {Promise<Array>} Array of saved game documents
   */
  async syncGamesForDate(date) {
    try {
      const games = await this.getGamesForDate(date);
      const dateStr = this.formatDateForComparison(new Date(date));
      logger.debug(`Syncing ${games.length} games for ${dateStr}...`);

      const savedGames = [];
      for (const gameData of games) {
        const savedGame = await this.saveGame(gameData);
        savedGames.push(savedGame);
      }

      logger.debug(`Synced ${savedGames.length} games to database for ${dateStr}`);
      return savedGames;
    } catch (error) {
      logger.error(`Error syncing games for date:`, error.message);
      throw error;
    }
  }

  /**
   * Get games from database for a specific date
   * @param {Date|string} date
   * @returns {Promise<Array>} Array of game documents from DB
   */
  async getGamesFromDatabase(date) {
    const targetDate = new Date(date);
    const startOfDay = new Date(targetDate);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    return await NBAGame.find({
      gameDate: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    }).sort({ gameDateTimeEst: 1 });
  }

  /**
   * Get today's games from database
   * @param {number} timezoneOffset - Minutes offset from UTC (e.g., -360 for CST)
   * @returns {Promise<Array>} Array of game documents from DB
   */
  async getTodaysGamesFromDatabase(timezoneOffset = 0) {
    // Get current UTC time
    const now = new Date();
    // Adjust for user's timezone (offset is in minutes)
    const localTime = new Date(now.getTime() - (timezoneOffset * 60 * 1000));
    return await this.getGamesFromDatabase(localTime);
  }

  /**
   * Clear old games from database
   * @param {number} daysToKeep - Number of days of games to keep
   * @returns {Promise<Object>} Delete result
   */
  async clearOldGames(daysToKeep = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await NBAGame.deleteMany({
      gameDate: { $lt: cutoffDate }
    });

    logger.debug(`Cleared ${result.deletedCount} old games (older than ${daysToKeep} days)`);
    return result;
  }

  /**
   * Extract ALL TV broadcaster abbreviations from game broadcasters object
   * Returns both individual array and combined string for backward compatibility
   * @param {Object} broadcasters - Broadcasters object from NBA API
   * @returns {Object} Object with tvArray (sorted array) and tv (comma-separated string)
   */
  extractTVInfo(broadcasters) {
    if (!broadcasters) {
      logger.debug('❌ No broadcasters object provided');
      return { tvArray: [], tv: null };
    }

    // Log the full broadcasters object to see its actual structure
    logger.debug('📺 Full broadcasters object:', JSON.stringify(broadcasters, null, 2));

    const allTvBroadcasters = [];

    // API uses different field names: nationalBroadcasters (not nationalTvBroadcasters)
    const tvArrays = {
      national: broadcasters.nationalBroadcasters || broadcasters.nationalTvBroadcasters,
      home: broadcasters.homeTvBroadcasters,
      away: broadcasters.awayTvBroadcasters,
      intl: broadcasters.intlBroadcasters || broadcasters.intlTvBroadcasters
    };

    // Process each broadcaster type
    for (const [type, arr] of Object.entries(tvArrays)) {
      logger.debug(`📡 ${type} broadcasters:`, Array.isArray(arr) ? `${arr.length} items` : 'not an array');

      if (Array.isArray(arr) && arr.length > 0) {
        arr.forEach(b => {
          const rawValue = b.broadcasterAbbreviation || b.broadcasterDisplay;
          logger.debug(`  ✓ Found ${type}:`, rawValue);

          if (rawValue) {
            // Split on '/' in case multiple channels are combined (e.g., "FDSNFL/WESH")
            // Also handle ', ' separators just in case
            const channels = rawValue.split(/[\/,]/).map(ch => ch.trim()).filter(ch => ch);
            channels.forEach(channel => {
              allTvBroadcasters.push(channel);
            });
          }
        });
      }
    }

    // Sort alphabetically for consistent comparison
    const sortedBroadcasters = [...new Set(allTvBroadcasters)].sort();
    const tvString = sortedBroadcasters.length > 0 ? sortedBroadcasters.join(', ') : null;

    logger.debug('✅ Final extracted TV broadcasters:', tvString || 'NONE');

    // Return both array and string for flexibility
    return {
      tvArray: sortedBroadcasters,
      tv: tvString
    };
  }

  /**
   * ADAPTER METHOD for fetch route compatibility
   * Fetch schedule for a specific team (filters league-wide schedule)
   * @param {Object} team - Team object with nbaTeamId
   * @param {Object} options - Options including startDate, endDate, createBaseline
   * @returns {Promise<Array>} Array of ScrapedData documents
   */
  async fetchTeamSchedule(team, options = {}) {
    if (!team.nbaTeamId) {
      throw new Error(`Team ${team.teamId} does not have an nbaTeamId configured`);
    }

    const { createBaseline = false } = options;

    // Default to current season if no dates provided
    const now = new Date();
    const startDate = options.startDate || new Date(now.getFullYear(), 9, 1).toISOString().slice(0, 10); // Oct 1
    const endDate = options.endDate || new Date(now.getFullYear() + 1, 5, 30).toISOString().slice(0, 10); // June 30

    logger.debug(`Fetching NBA schedule for team ${team.teamName} (${team.nbaTeamId}) from ${startDate} to ${endDate}${createBaseline ? ' [Creating Baseline]' : ''}`);

    // Calculate date range for filtering
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1);

    // BASELINE LOGIC: If createBaseline is enabled, save existing data to history before deleting
    if (createBaseline) {
      try {
        // Find all existing schedule data for this team within date range
        const existingData = await ScrapedData.find({
          teamId: team.teamId,
          moduleId: this.config.id,
          'data.date': {
            $gte: start.toISOString().slice(0, 10),
            $lt: end.toISOString().slice(0, 10)
          }
        });

        if (existingData.length > 0) {
          logger.debug(`📦 Creating baseline for ${existingData.length} existing NBA schedule entries`);

          // Delete any old baselines for these matchKeys
          const matchKeys = existingData.map(d => d.matchKey);
          await ScrapedDataHistory.deleteMany({
            matchKey: { $in: matchKeys },
            moduleId: this.config.id
          });

          // Copy existing data to history
          for (const data of existingData) {
            await ScrapedDataHistory.create({
              matchKey: data.matchKey,
              moduleId: data.moduleId,
              teamId: data.teamId,
              sport: data.sport,
              league: data.league,
              dataType: data.dataType,
              source: data.source,
              data: data.data,
              dataHash: data.dataHash,
              version: data.version,
              validation: data.validation,
              savedAt: new Date(),
              originalCreatedAt: data.createdAt,
              originalUpdatedAt: data.updatedAt
            });
          }
          logger.debug(`📦 Baseline saved: ${existingData.length} schedule entries`);
        } else {
          logger.debug(`📦 No existing data to baseline for ${team.teamName}`);
        }
      } catch (baselineError) {
        // Don't fail the main fetch if baseline fails
        logger.warn(`⚠️  Failed to save baseline for ${team.teamName}:`, baselineError.message);
      }
    }

    // Date-scoped delete: Only clear schedule data within the specified date range
    const deleteResult = await ScrapedData.deleteMany({
      teamId: team.teamId,
      moduleId: this.config.id,
      'data.date': {
        $gte: start.toISOString().slice(0, 10),
        $lt: end.toISOString().slice(0, 10)
      }
    });
    logger.debug(`Cleared ${deleteResult.deletedCount} existing schedule entries for ${team.teamName} between ${startDate} and ${endDate}`);

    // Fetch full schedule
    const schedule = await this.getSchedule();

    // Filter games for this team and save to ScrapedData
    const savedGames = [];
    for (const dateEntry of schedule.leagueSchedule.gameDates) {
      for (const game of dateEntry.games) {
        const gameDate = new Date(game.gameDateTimeEst);

        // Check if game is in date range and involves this team
        if (gameDate >= start && gameDate < end) {
          const isHomeTeam = String(game.homeTeam.teamId) === String(team.nbaTeamId);
          const isAwayTeam = String(game.awayTeam.teamId) === String(team.nbaTeamId);

          if (isHomeTeam || isAwayTeam) {
            // Save to NBAGame collection
            await this.saveGame(game);

            // Also save to ScrapedData for frontend compatibility
            const matchKey = `${team.teamId}_${game.gameId}`;

            // Extract time from gameDateTimeEst or use gameStatusText
            let timeDisplay = '';
            if (game.gameStatus === 3) {
              // Game completed - show "Final"
              timeDisplay = 'Final';
            } else if (game.gameStatusText && game.gameStatusText !== 'Final') {
              // Use the status text which includes game time (e.g., "7:30 pm ET")
              timeDisplay = game.gameStatusText;
            } else if (game.gameTimeEst) {
              // Use gameTimeEst field which is already in ET
              // Format: "1900-01-01T19:00:00Z" - extract just the time part
              try {
                const timeDate = new Date(game.gameTimeEst);
                let hours = timeDate.getUTCHours();
                const minutes = String(timeDate.getUTCMinutes()).padStart(2, '0');
                const ampm = hours >= 12 ? 'pm' : 'am';
                hours = hours % 12 || 12; // Convert to 12-hour format
                timeDisplay = `${hours}:${minutes} ${ampm} ET`;
              } catch (e) {
                timeDisplay = '-';
              }
            } else {
              timeDisplay = 'TBD';
            }

            // Build location string
            const locationParts = [];
            if (game.arenaCity) locationParts.push(game.arenaCity);
            if (game.arenaState) locationParts.push(game.arenaState);
            const location = locationParts.length > 0 ? locationParts.join(', ') : '';

            // Build result if game is complete
            let result = null;
            let resultStatus = null;
            if (game.gameStatus === 3) {
              const teamScore = isHomeTeam ? game.homeTeam.score : game.awayTeam.score;
              const opponentScore = isHomeTeam ? game.awayTeam.score : game.homeTeam.score;
              if (teamScore > opponentScore) {
                result = `W ${teamScore}-${opponentScore}`;
                resultStatus = 'W';
              } else {
                result = `L ${teamScore}-${opponentScore}`;
                resultStatus = 'L';
              }
            }

            // Extract date in YYYY-MM-DD format from EST datetime
            let gameDate = null;
            if (game.gameDateTimeEst) {
              const estDate = new Date(game.gameDateTimeEst);
              const year = estDate.getUTCFullYear();
              const month = String(estDate.getUTCMonth() + 1).padStart(2, '0');
              const day = String(estDate.getUTCDate()).padStart(2, '0');
              gameDate = `${year}-${month}-${day}`;
            }

            // Extract TV info (returns object with tvArray and tv string)
            const tvInfo = this.extractTVInfo(game.broadcasters);

            const transformedData = {
              gameId: game.gameId,
              date: gameDate,
              time: timeDisplay,
              status: game.gameStatusText,
              opponent: isHomeTeam ? game.awayTeam.teamCity : game.homeTeam.teamCity,
              opponentNickname: isHomeTeam ? game.awayTeam.teamName : game.homeTeam.teamName,
              opponentTricode: isHomeTeam ? game.awayTeam.teamTricode : game.homeTeam.teamTricode,
              isHome: isHomeTeam,
              isAway: isAwayTeam,
              isNeutral: game.isNeutral || false,
              locationIndicator: game.isNeutral ? 'N' : (isHomeTeam ? 'H' : 'A'),
              venue: game.arenaName,
              location: location,
              result: result,
              resultStatus: resultStatus,
              // TV info from broadcasters - store both array and string
              tv: tvInfo.tv,
              tvArray: tvInfo.tvArray,
              // NBA doesn't have conference games flag or tournament in regular schedule
              isConferenceGame: false,
              tournament: null,
              gameLabel: game.gameLabel || 'Regular Season',
              // Keep full team data for reference
              homeTeam: {
                name: game.homeTeam.teamName,
                tricode: game.homeTeam.teamTricode,
                score: game.homeTeam.score,
                wins: game.homeTeam.wins,
                losses: game.homeTeam.losses
              },
              awayTeam: {
                name: game.awayTeam.teamName,
                tricode: game.awayTeam.teamTricode,
                score: game.awayTeam.score,
                wins: game.awayTeam.wins,
                losses: game.awayTeam.losses
              }
            };

            const dataHash = crypto.createHash('sha256')
              .update(JSON.stringify(transformedData))
              .digest('hex');

            // Create new schedule entry
            const scrapedData = await ScrapedData.create({
              matchKey,
              moduleId: this.config.id,
              teamId: team.teamId,
              sport: this.config.sport,
              league: this.config.league,
              dataType: this.config.dataType,
              source: {
                url: this.scheduleUrl,
                name: 'NBA CDN API',
                fetchedAt: new Date()
              },
              data: transformedData,
              dataHash,
              validation: { isValid: true, errors: [], warnings: [] },
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
              version: 1
            });

            savedGames.push(scrapedData);
          }
        }
      }
    }

    logger.debug(`Found ${savedGames.length} games for ${team.teamName}`);
    return savedGames;
  }
}

module.exports = new NBAScheduleModule();
