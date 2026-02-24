const axios = require('axios');
const ScrapedData = require('../../models/ScrapedData');
const ScrapedDataHistory = require('../../models/ScrapedDataHistory');
const crypto = require('crypto');
const logger = require('../../utils/logger');

/**
 * MLB Schedule Module
 * Fetches MLB schedule data from the MLB Stats API
 */
class MLBScheduleModule {
  constructor() {
    this.config = {
      id: 'mlb_schedule',
      name: 'MLB Schedule',
      league: 'MLB',
      sport: 'baseball',
      dataType: 'schedule'
    };
    this.baseUrl = 'https://statsapi.mlb.com/api/v1';
    this.cacheDuration = 5 * 60 * 1000; // 5 minutes cache
    this.lastFetch = null;
    this.cachedSchedule = null;
    this.cachedDateRange = null;

    // MLB game status mapping
    this.statusMap = {
      'S': 'Scheduled',
      'P': 'Pre-Game',
      'PW': 'Warmup',
      'I': 'In Progress',
      'MA': 'Manager Challenge',
      'MC': 'Review',
      'MF': 'Manager Challenge',
      'PD': 'Postponed',
      'DR': 'Delayed: Rain',
      'DI': 'Delayed',
      'F': 'Final',
      'FT': 'Final (Extra Innings)',
      'FR': 'Final (Rain)',
      'FO': 'Final (Official)',
      'O': 'Final',
      'CR': 'Critical',
      'CO': 'Completed Early',
      'TR': 'Temporary Rain Delay',
      'UR': 'Under Review'
    };
  }

  /**
   * Get readable status from status code
   * @param {string} statusCode - MLB status code
   * @param {string} detailedState - Detailed state string
   * @returns {string} Human readable status
   */
  getReadableStatus(statusCode, detailedState) {
    if (detailedState) return detailedState;
    return this.statusMap[statusCode] || statusCode || 'Unknown';
  }

  /**
   * Fetch MLB schedule from API for a date range
   * @param {string} startDate - Start date YYYY-MM-DD
   * @param {string} endDate - End date YYYY-MM-DD
   * @returns {Promise<Object>} Schedule data
   */
  async fetchSchedule(startDate, endDate) {
    try {
      const hydrate = 'broadcasts,linescore,decisions,probablePitcher,flags';
      const url = `${this.baseUrl}/schedule?sportId=1&startDate=${startDate}&endDate=${endDate}&hydrate=${hydrate}`;

      logger.debug(`Fetching MLB schedule from API: ${startDate} to ${endDate}`);

      const response = await axios.get(url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });

      this.lastFetch = Date.now();
      this.cachedSchedule = response.data;
      this.cachedDateRange = { startDate, endDate };

      const totalGames = response.data.dates?.reduce((sum, d) => sum + (d.games?.length || 0), 0) || 0;
      logger.debug(`Fetched MLB schedule: ${response.data.dates?.length || 0} dates, ${totalGames} games`);

      return response.data;
    } catch (error) {
      logger.error('Error fetching MLB schedule:', error.message);
      throw new Error(`Failed to fetch MLB schedule: ${error.message}`);
    }
  }

  /**
   * Get cached schedule or fetch if cache expired/invalid
   * @param {string} startDate - Start date YYYY-MM-DD
   * @param {string} endDate - End date YYYY-MM-DD
   * @returns {Promise<Object>} Schedule data
   */
  async getSchedule(startDate, endDate) {
    const now = Date.now();
    const cacheValid = this.cachedSchedule &&
                       this.lastFetch &&
                       (now - this.lastFetch) < this.cacheDuration &&
                       this.cachedDateRange?.startDate === startDate &&
                       this.cachedDateRange?.endDate === endDate;

    if (cacheValid) {
      logger.debug('Returning cached MLB schedule');
      return this.cachedSchedule;
    }

    return await this.fetchSchedule(startDate, endDate);
  }

  /**
   * Extract TV broadcaster info from broadcasts array
   * @param {Array} broadcasts - Broadcasts array from MLB API
   * @returns {Object} Object with tvArray and tv string
   */
  extractTVInfo(broadcasts) {
    if (!broadcasts || !Array.isArray(broadcasts)) {
      return { tvArray: [], tv: null };
    }

    const allBroadcasters = [];

    broadcasts.forEach(broadcast => {
      // Only include TV broadcasts (type === 'TV')
      if (broadcast.type === 'TV' || broadcast.isNational) {
        let name = broadcast.callSign || broadcast.name;

        if (name) {
          // Handle combined channels (e.g., "ABC/ESPN")
          if (name.includes('/')) {
            const parts = name.split('/').map(p => p.trim()).filter(p => p);
            parts.forEach(part => allBroadcasters.push(part));
          } else {
            allBroadcasters.push(name.trim());
          }
        }
      }
    });

    // Deduplicate and sort for consistent comparison
    const sortedBroadcasters = [...new Set(allBroadcasters)].sort();
    const tvString = sortedBroadcasters.length > 0 ? sortedBroadcasters.join(', ') : null;

    return {
      tvArray: sortedBroadcasters,
      tv: tvString
    };
  }

  /**
   * Format date to MM/DD/YYYY for display
   * @param {Date|string} date
   * @returns {string}
   */
  formatDateMMDDYYYY(date) {
    const d = new Date(date);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    return `${month}/${day}/${year}`;
  }

  /**
   * Format date to YYYY-MM-DD
   * @param {Date|string} date
   * @returns {string}
   */
  formatDateYYYYMMDD(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Process MLB API game data into normalized format
   * @param {Object} game - Game object from MLB API
   * @param {Object} team - Team object
   * @param {boolean} isHomeTeam - Whether the team is home
   * @returns {Object} Transformed game data
   */
  processGameData(game, team, isHomeTeam) {
    const gameDateObj = new Date(game.gameDate || game.officialDate);
    const gameDate = this.formatDateYYYYMMDD(gameDateObj);

    // Extract game time
    let gameTime = 'TBD';
    if (game.gameDate) {
      const d = new Date(game.gameDate);
      const hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'pm' : 'am';
      const displayHours = hours % 12 || 12;
      gameTime = `${displayHours}:${minutes} ${ampm} CT`;
    }
    if (game.status?.startTimeTBD) {
      gameTime = 'TBD';
    }

    // Get status
    const status = this.getReadableStatus(
      game.status?.statusCode,
      game.status?.detailedState
    );

    // Extract TV info
    const tvInfo = this.extractTVInfo(game.broadcasts);

    // Get opponent info
    const opponent = isHomeTeam ? game.teams?.away : game.teams?.home;
    const teamData = isHomeTeam ? game.teams?.home : game.teams?.away;

    // Build result if game is final
    let result = null;
    let resultStatus = null;
    if (game.status?.abstractGameState === 'Final' || game.status?.statusCode === 'F') {
      const teamScore = teamData?.score;
      const opponentScore = opponent?.score;
      if (teamScore !== undefined && opponentScore !== undefined) {
        if (teamScore > opponentScore) {
          result = `W ${teamScore}-${opponentScore}`;
          resultStatus = 'W';
        } else if (teamScore < opponentScore) {
          result = `L ${teamScore}-${opponentScore}`;
          resultStatus = 'L';
        } else {
          result = `T ${teamScore}-${opponentScore}`;
          resultStatus = 'T';
        }
      }
    }

    // Get probable pitchers
    const probablePitcherAway = game.teams?.away?.probablePitcher?.fullName || null;
    const probablePitcherHome = game.teams?.home?.probablePitcher?.fullName || null;

    // Get decisions (winner, loser, save)
    const winnerFullName = game.decisions?.winner?.fullName || null;
    const loserFullName = game.decisions?.loser?.fullName || null;
    const saveFullName = game.decisions?.save?.fullName || null;

    // Process linescore if available
    let linescore = null;
    if (game.linescore?.innings && Array.isArray(game.linescore.innings)) {
      linescore = { away: {}, home: {} };
      game.linescore.innings.forEach(inning => {
        const inningNum = inning.num;
        linescore.away[`inning${inningNum}`] = {
          runs: inning.away?.runs ?? null,
          hits: inning.away?.hits ?? null,
          errors: inning.away?.errors ?? null
        };
        linescore.home[`inning${inningNum}`] = {
          runs: inning.home?.runs ?? null,
          hits: inning.home?.hits ?? null,
          errors: inning.home?.errors ?? null
        };
      });
    }

    return {
      gameId: String(game.gamePk),
      gameGuid: game.gameGuid || null,
      date: gameDate,
      time: gameTime,
      status: status,
      statusCode: game.status?.statusCode,
      abstractGameState: game.status?.abstractGameState,
      opponent: opponent?.team?.name || 'Unknown',
      opponentCity: opponent?.team?.name?.split(' ').slice(0, -1).join(' ') || '',
      opponentNickname: opponent?.team?.name?.split(' ').pop() || '',
      opponentId: String(opponent?.team?.id || ''),
      isHome: isHomeTeam,
      isAway: !isHomeTeam,
      isNeutral: false,
      locationIndicator: isHomeTeam ? 'H' : 'A',
      venue: game.venue?.name || null,
      venueId: game.venue?.id || null,
      result: result,
      resultStatus: resultStatus,
      tv: tvInfo.tv,
      tvArray: tvInfo.tvArray,
      dayNight: game.dayNight || null,
      gameType: game.gameType || 'R',
      gameTypeName: this.getGameTypeName(game.gameType),
      doubleHeader: game.doubleHeader === 'Y' || game.doubleHeader === 'S',
      doubleHeaderType: game.doubleHeader === 'S' ? 'Split' : game.doubleHeader === 'Y' ? 'Traditional' : null,
      gameNumber: game.gameNumber || 1,
      scheduledInnings: game.scheduledInnings || 9,
      seriesDescription: game.seriesDescription || null,
      // Probable pitchers
      probablePitcherAway,
      probablePitcherHome,
      // Decisions
      winnerFullName,
      loserFullName,
      saveFullName,
      // Linescore
      linescore,
      // Team records
      homeTeam: {
        id: String(game.teams?.home?.team?.id || ''),
        name: game.teams?.home?.team?.name || '',
        score: game.teams?.home?.score,
        wins: game.teams?.home?.leagueRecord?.wins,
        losses: game.teams?.home?.leagueRecord?.losses,
        probablePitcher: probablePitcherHome
      },
      awayTeam: {
        id: String(game.teams?.away?.team?.id || ''),
        name: game.teams?.away?.team?.name || '',
        score: game.teams?.away?.score,
        wins: game.teams?.away?.leagueRecord?.wins,
        losses: game.teams?.away?.leagueRecord?.losses,
        probablePitcher: probablePitcherAway
      }
    };
  }

  /**
   * Get game type name from code
   * @param {string} gameType
   * @returns {string}
   */
  getGameTypeName(gameType) {
    const types = {
      'S': 'Spring Training',
      'R': 'Regular Season',
      'F': 'Wild Card',
      'D': 'Division Series',
      'L': 'League Championship',
      'W': 'World Series',
      'A': 'All-Star Game',
      'E': 'Exhibition'
    };
    return types[gameType] || 'Regular Season';
  }

  /**
   * ADAPTER METHOD for fetch route compatibility
   * Fetch schedule for a specific team
   * @param {Object} team - Team object with mlbId
   * @param {Object} options - Options including startDate, endDate, createBaseline
   * @returns {Promise<Array>} Array of ScrapedData documents
   */
  async fetchTeamSchedule(team, options = {}) {
    if (!team.mlbId) {
      throw new Error(`Team ${team.teamId} does not have an mlbId configured`);
    }

    const { createBaseline = false } = options;

    // Default to current season (March - November)
    const now = new Date();
    const currentYear = now.getFullYear();
    const startDate = options.startDate || `${currentYear}-03-01`;
    const endDate = options.endDate || `${currentYear}-11-30`;

    logger.debug(`Fetching MLB schedule for team ${team.teamName} (mlbId: ${team.mlbId}) from ${startDate} to ${endDate}${createBaseline ? ' [Creating Baseline]' : ''}`);

    // Calculate date range for filtering
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1);

    // BASELINE LOGIC: If createBaseline is enabled, save existing data to history before deleting
    if (createBaseline) {
      try {
        const existingData = await ScrapedData.find({
          teamId: team.teamId,
          moduleId: this.config.id,
          'data.date': {
            $gte: start.toISOString().slice(0, 10),
            $lt: end.toISOString().slice(0, 10)
          }
        });

        if (existingData.length > 0) {
          logger.debug(`Creating baseline for ${existingData.length} existing MLB schedule entries`);

          const matchKeys = existingData.map(d => d.matchKey);
          await ScrapedDataHistory.deleteMany({
            matchKey: { $in: matchKeys },
            moduleId: this.config.id
          });

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
          logger.debug(`Baseline saved: ${existingData.length} schedule entries`);
        } else {
          logger.debug(`No existing data to baseline for ${team.teamName}`);
        }
      } catch (baselineError) {
        logger.warn(`Failed to save baseline for ${team.teamName}:`, baselineError.message);
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

    // Fetch schedule from MLB API
    const schedule = await this.getSchedule(startDate, endDate);

    // Filter games for this team and save to ScrapedData
    const savedGames = [];
    const mlbTeamId = String(team.mlbId);

    if (schedule.dates && Array.isArray(schedule.dates)) {
      for (const dateEntry of schedule.dates) {
        if (!dateEntry.games) continue;

        for (const game of dateEntry.games) {
          const homeTeamId = String(game.teams?.home?.team?.id || '');
          const awayTeamId = String(game.teams?.away?.team?.id || '');

          const isHomeTeam = homeTeamId === mlbTeamId;
          const isAwayTeam = awayTeamId === mlbTeamId;

          if (isHomeTeam || isAwayTeam) {
            const matchKey = `${team.teamId}_${game.gamePk}`;
            const transformedData = this.processGameData(game, team, isHomeTeam);

            const dataHash = crypto.createHash('sha256')
              .update(JSON.stringify(transformedData))
              .digest('hex');

            const scrapedData = await ScrapedData.create({
              matchKey,
              moduleId: this.config.id,
              teamId: team.teamId,
              sport: this.config.sport,
              league: this.config.league,
              dataType: this.config.dataType,
              source: {
                url: `${this.baseUrl}/schedule`,
                name: 'MLB Stats API',
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

  /**
   * Get games for a specific date
   * @param {Date|string} date - Date to get games for
   * @returns {Promise<Array>} Array of games
   */
  async getGamesForDate(date) {
    const dateStr = this.formatDateYYYYMMDD(new Date(date));
    const schedule = await this.getSchedule(dateStr, dateStr);

    if (schedule.dates && schedule.dates.length > 0) {
      return schedule.dates[0].games || [];
    }
    return [];
  }

  /**
   * Get today's games
   * @returns {Promise<Array>} Array of today's games
   */
  async getTodaysGames() {
    const today = new Date();
    return await this.getGamesForDate(today);
  }
}

module.exports = new MLBScheduleModule();
