// backend/modules/ncaa-basketball-stats/index.js
// UNIFIED VERSION using adaptive_components + boxscore API for both NEW and OLD Sidearm
const BaseModule = require('../BaseModule');
const axios = require('axios');
const { retryWithBackoff, UserAgentRotator, cleanPlayerName, getAxiosConfig } = require('../../utils/httpUtils');
const logger = require('../../utils/logger');

class NCAABasketballStatsModule extends BaseModule {
  constructor(sport = 'mensBasketball') {
    super({
      id: `ncaa_${sport}_stats`,
      name: `NCAA ${sport === 'mensBasketball' ? "Men's" : "Women's"} Basketball Stats`,
      league: 'NCAA',
      sport: sport, // mensBasketball or womensBasketball
      dataType: 'stats',

      validation: {
        requiredFields: ['gameId', 'season'],
      },

      cacheHours: 2
    });

    this.sport = sport;
    // Initialize user-agent rotator
    this.userAgentRotator = new UserAgentRotator();
  }

  // Helper: Retry individual game fetch with exponential backoff
  async retryGameFetch(fn, gameId, maxRetries = 3, baseDelay = 2000) {
    return retryWithBackoff(fn, `Game ${gameId}`, maxRetries, baseDelay);
  }

  generateMatchKey(record) {
    // Extract teamId (should be included in transformed data)
    const teamId = record.teamId || 'UNKNOWN';

    // Parse date from gameInfo.date (format: "01/15/2025" -> "2025-01-15")
    let formattedDate = 'UNKNOWN_DATE';
    if (record.gameInfo && record.gameInfo.date) {
      try {
        const dateStr = record.gameInfo.date;
        const [month, day, year] = dateStr.split('/');
        formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      } catch (err) {
        logger.warn(`Failed to parse date: ${record.gameInfo.date}`, err);
      }
    }

    // Format: TeamID_Sport_Date (e.g., "NCAA_NORTHWESTERN_MBB_2025-01-15")
    const sportAbbrev = this.sport === 'mensBasketball' ? 'MBB' : 'WBB';
    return `${teamId}_${sportAbbrev}_${formattedDate}`.toUpperCase().replace(/\s+/g, '_');
  }

  // Fetch games using unified adaptive_components endpoint (works for both NEW and OLD Sidearm)
  async fetchGames(baseUrl, sportId, count = 50) {
    const gamesUrl = `${baseUrl}/services/adaptive_components.ashx?type=results&count=${count}&sport_id=${sportId}`;
    logger.debug(`📋 Fetching games from unified endpoint: ${gamesUrl}`);

    const response = await axios.get(gamesUrl, getAxiosConfig(this.userAgentRotator.getNext(), 15000));

    const games = response.data;

    if (!Array.isArray(games)) {
      logger.warn('⚠️ Games response is not an array:', typeof games);
      return [];
    }

    // Helper: Check if game is likely an exhibition or scrimmage
    const isExhibitionOrScrimmage = (game) => {
      const opponentName = game.opponent?.name || '';

      // Common patterns for exhibition/scrimmage games that often lack boxscore data
      const exhibitionPatterns = [
        /scrimmage/i,
        /exhibition/i,
        /practice/i,
        /closed\s+scrimmage/i,
        /red.*white/i,
        /blue.*gold/i,
        /cardinal.*white/i,
        // D-II and D-III schools (common exhibition opponents)
        /platteville/i,
        /whitewater/i,
        /eau claire/i,
        /la crosse/i,
        /stevens point/i,
        /stout/i,
        /superior/i,
        /river falls/i,
        /oshkosh/i
      ];

      return exhibitionPatterns.some(pattern => pattern.test(opponentName));
    };

    // Filter games that have results with bid
    const gamesWithBid = games.filter(game =>
      game.result &&
      game.result.bid &&
      game.status === 'O' // Only completed games
    );

    // Separate exhibition/scrimmage games from regular games
    const regularGames = gamesWithBid.filter(game => !isExhibitionOrScrimmage(game));
    const exhibitionGames = gamesWithBid.filter(game => isExhibitionOrScrimmage(game));

    if (exhibitionGames.length > 0) {
      logger.debug(`ℹ️  Skipping ${exhibitionGames.length} exhibition/scrimmage game(s): ${exhibitionGames.map(g => g.opponent?.name).join(', ')}`);
    }

    logger.debug(`✅ Found ${regularGames.length} regular season games with bid out of ${games.length} total games`);

    const mappedGames = regularGames.map(game => ({
      id: game.id,
      bid: game.result.bid,
      date: game.date,
      opponent: game.opponent?.name || 'Unknown',
      location: game.location_indicator, // 'H', 'A', or 'N'
      score: `${game.result.team_score}-${game.result.opponent_score}`,
      teamScore: game.result.team_score,
      opponentScore: game.result.opponent_score,
      status: game.result.status // 'W' or 'L'
    }));

    // Debug: log first game to verify structure
    if (mappedGames.length > 0) {
      logger.debug('Sample game data:', JSON.stringify(mappedGames[0], null, 2));
    }

    return mappedGames;
  }

  // Parse boxscore API response and transform to our data structure
  transformBoxscoreData(boxscoreData, teamId, gameId, season, teamName, gameDate = null, scheduleLocation = null, scheduleTeamScore = null, scheduleOpponentScore = null) {
    const data = boxscoreData.data;
    const venue = data.venue;

    // Determine if this team is home or away
    // TRUST SCHEDULE LOCATION FIRST (more reliable than boxscore API which can be wrong)
    let thisTeamIsHomeTeam;

    if (scheduleLocation === 'H') {
      thisTeamIsHomeTeam = true;
      logger.debug(`🏀 Using SCHEDULE location: This team is HOME (location='H')`);
    } else if (scheduleLocation === 'A') {
      thisTeamIsHomeTeam = false;
      logger.debug(`🏀 Using SCHEDULE location: This team is AWAY (location='A')`);
    } else if (scheduleLocation === 'N') {
      // Neutral site - use SCORE MATCHING to determine which team we are
      logger.debug(`🏀 Neutral site detected (location='N'), using score matching...`);

      const ourScoreMatchesHome = scheduleTeamScore === data.home_team_score;
      const ourScoreMatchesVisiting = scheduleTeamScore === data.visiting_team_score;

      if (ourScoreMatchesVisiting && !ourScoreMatchesHome) {
        thisTeamIsHomeTeam = false;
        logger.debug(`🏀 Score match: Our score (${scheduleTeamScore}) matches visiting team → We are AWAY`);
      } else if (ourScoreMatchesHome && !ourScoreMatchesVisiting) {
        thisTeamIsHomeTeam = true;
        logger.debug(`🏀 Score match: Our score (${scheduleTeamScore}) matches home team → We are HOME`);
      } else {
        // Fallback to boxscore if scores are tied or don't match
        thisTeamIsHomeTeam = data.this_team_is_home_team;
        logger.debug(`🏀 Score matching inconclusive (tied game or mismatch), falling back to boxscore: ${thisTeamIsHomeTeam ? 'HOME' : 'AWAY'}`);
      }
    } else {
      // No schedule location provided, fall back to boxscore
      thisTeamIsHomeTeam = data.this_team_is_home_team;
      logger.debug(`🏀 No schedule location, using boxscore: This team is ${thisTeamIsHomeTeam ? 'HOME' : 'AWAY'} team`);
    }

    const thisTeam = thisTeamIsHomeTeam ? data.home_team : data.visiting_team;
    const opponentTeam = thisTeamIsHomeTeam ? data.visiting_team : data.home_team;

    // Use schedule date if provided (same logic as football)
    let actualGameDate = venue.date;
    if (gameDate) {
      const scheduleDate = new Date(gameDate);
      const formattedScheduleDate = `${String(scheduleDate.getMonth() + 1).padStart(2, '0')}/${String(scheduleDate.getDate()).padStart(2, '0')}/${scheduleDate.getFullYear()}`;

      if (venue.date !== formattedScheduleDate) {
        logger.warn(`⚠️ DATE MISMATCH for game ${gameId}:`);
        logger.warn(`  - Schedule (adaptive_components): ${gameDate} -> ${formattedScheduleDate}`);
        logger.warn(`  - Boxscore API (venue.date): ${venue.date}`);
        logger.warn(`  ✅ Using schedule date as authoritative source`);
        actualGameDate = formattedScheduleDate;
      }
    }

    // Game info
    const gameInfo = {
      date: actualGameDate,
      venueDate: venue.date,
      location: venue.location,
      stadium: venue.stadium,
      attendance: venue.attendance,
      startTime: venue.start,
      endTime: venue.end,
      duration: venue.duration,
      officials: venue.officials,
      isLeagueGame: venue.is_a_league_game === true,
      isNightGame: venue.is_a_nitegame === true,
      isNeutralSite: venue.is_neutral === true,
      isPostSeason: venue.is_a_postseason_game === true
    };

    const teamInfo = {
      thisTeamIsHomeTeam,
      homeName: data.home_team_name,
      visitorName: data.visiting_team_name,
      homeScore: data.home_team_score,
      visitorScore: data.visiting_team_score,
      homeRecord: data.home_team_record,
      visitorRecord: data.visiting_team_record,
      lineScores: {
        home: data.period_scores_home || [],
        visitor: data.period_scores_away || []
      },
      periods: data.periods || [],
      periodLabel: data.period_label || 'Half'
    };

    // Helper function to check if all stats are null/empty
    const hasNullStats = (player) => {
      if (!player.stats) return true;
      const stats = player.stats;

      // Check if all meaningful stats are null or 0
      const allNull =
        (!stats.minutes_played || stats.minutes_played === '0') &&
        (!stats.total_field_goals_made || stats.total_field_goals_made === '0') &&
        (!stats.total_field_goals_attempted || stats.total_field_goals_attempted === '0') &&
        (!stats.three_point_field_goals_made || stats.three_point_field_goals_made === '0') &&
        (!stats.free_throws_made || stats.free_throws_made === '0') &&
        (!stats.total_rebounds || stats.total_rebounds === '0') &&
        (!stats.assists || stats.assists === '0') &&
        (!stats.total_points_scored || stats.total_points_scored === '0');

      return allNull;
    };

    // Parse players from the players array
    // Use roster_player_id for deduplication to handle cases where same player appears twice
    const playerMap = new Map();

    logger.debug(`📋 Processing ${thisTeam.players.length} players from boxscore`);

    thisTeam.players.forEach(player => {
      const jersey = player.uniform;
      const playerName = cleanPlayerName(player.name);

      // Skip team stats (not individual players)
      if (!playerName || playerName.toUpperCase() === 'TEAM' || playerName.toUpperCase() === 'TM') {
        return;
      }

      // Skip players who didn't play (game_played=0) AND have no stats
      // This handles duplicates where same player appears with different jersey/name but game_played=0
      if (player.game_played === '0' && hasNullStats(player)) {
        logger.debug(`⏭️  Skipping ${playerName} (${jersey}) - game_played=0 with no stats`);
        return;
      }

      // Use roster_player_id as primary key for deduplication
      // Fall back to jersey_name if roster_player_id not available
      const key = player.roster_player_id || `${jersey}_${playerName}`;

      // If we already have this player, decide whether to replace
      if (playerMap.has(key)) {
        const existing = playerMap.get(key);

        // Prioritize entries with game_played="1" over game_played="0"
        if (player.game_played === '1' && existing.gamesPlayed === '0') {
          logger.debug(`🔄 Replacing duplicate for roster_player_id ${key}: ${existing.fullName} (${existing.jersey}) -> ${playerName} (${jersey})`);
          // Fall through to replace the entry
        } else if (player.game_played === '0' && existing.gamesPlayed === '1') {
          // Keep existing entry (which has game_played="1")
          logger.debug(`⏭️  Skipping duplicate for roster_player_id ${key}: keeping ${existing.fullName} (played), ignoring ${playerName} (did not play)`);
          return;
        } else {
          // Both have same game_played status, keep first one
          logger.debug(`⚠️  Duplicate roster_player_id ${key}: ${playerName} (${jersey}) - keeping first entry`);
          return;
        }
      }

      // Initialize or replace player object
      playerMap.set(key, {
        jersey: jersey,
        fullName: playerName,
        checkName: player.checkname,
        class: player.class_year,
        gamesPlayed: player.game_played,
        gamesStarted: player.game_started,
        minutesPlayed: 0,
        fieldGoals: null,
        threePointers: null,
        freeThrows: null,
        rebounds: null,
        assists: null,
        turnovers: null,
        steals: null,
        blocks: null,
        fouls: null,
        points: null
      });

      const playerObj = playerMap.get(key);

      // Basketball stats are directly in player.stats (not in a Plays array)
      if (player.stats) {
        const stats = player.stats;

        // Minutes played (store as integer to match Oracle format for comparison)
        const minutes = parseInt(stats.minutes_played || 0);
        playerObj.minutesPlayed = minutes;

        // Field goals
        playerObj.fieldGoals = {
          made: parseInt(stats.total_field_goals_made || 0),
          attempts: parseInt(stats.total_field_goals_attempted || 0),
          percentage: parseFloat(stats.field_goal_percentage || 0)
        };

        // Three pointers
        playerObj.threePointers = {
          made: parseInt(stats.three_point_field_goals_made || 0),
          attempts: parseInt(stats.three_point_field_goals_attempted || 0),
          percentage: parseFloat(stats.three_point_percentage || 0)
        };

        // Free throws
        playerObj.freeThrows = {
          made: parseInt(stats.free_throws_made || 0),
          attempts: parseInt(stats.free_throws_attempted || 0),
          percentage: parseFloat(stats.free_throw_percentage || 0)
        };

        // Rebounds
        playerObj.rebounds = {
          offensive: parseInt(stats.offensive_rebounds || 0),
          defensive: parseInt(stats.defensive_rebounds || 0),
          total: parseInt(stats.total_rebounds || 0)
        };

        // Other stats
        playerObj.assists = parseInt(stats.assists || 0);
        playerObj.turnovers = parseInt(stats.turnovers || 0);
        playerObj.steals = parseInt(stats.steals || 0);
        playerObj.blocks = parseInt(stats.blocked_shots || 0);
        playerObj.fouls = parseInt(stats.personal_fouls || 0);
        playerObj.points = parseInt(stats.total_points_scored || 0);
      }
    });

    // Convert map to array
    const players = Array.from(playerMap.values());

    logger.debug(`✅ Extracted stats for ${players.length} players from boxscore API`);

    return {
      teamId,
      gameId,
      season,
      gameInfo,
      teamInfo,
      players
    };
  }

  async fetchTeamStats(team, season = new Date().getFullYear(), targetDate = null, options = {}) {
    try {
      // Validate sportId exists
      const sportConfig = team.ncaaSportsConfig?.[this.sport];
      if (!sportConfig?.sportId) {
        throw new Error(`Team ${team.teamId} is missing ${this.sport} sportId in ncaaSportsConfig. Run auto-populate first.`);
      }

      const sportId = sportConfig.sportId;
      const baseUrl = team.baseUrl.startsWith('http') ? team.baseUrl : `https://${team.baseUrl}`;

      logger.debug(`📊 Fetching ${this.sport} stats for ${team.teamName} (${season})${targetDate ? ` for date: ${targetDate}` : ''}`);

      // Step 0: Check cache first (skip cache if targetDate is specified or forceRefresh is enabled)
      const { forceRefresh = false } = options;
      if (!targetDate && !forceRefresh) {
        const cachedData = await this.getCachedData(team.teamId);
        if (cachedData && cachedData.length > 0) {
          logger.debug(`✅ Returning ${cachedData.length} games from cache`);
          return cachedData;
        }
      } else if (targetDate) {
        logger.debug(`⏭️ Bypassing cache due to targetDate filter`);
      } else if (forceRefresh) {
        logger.debug(`🔄 Force refresh enabled - bypassing cache`);
      }

      // Step 1: Get games using unified endpoint
      let games = [];
      try {
        games = await this.fetchGames(baseUrl, sportId, 50);
        logger.debug(`Found ${games.length} games to fetch`);
      } catch (fetchGamesError) {
        logger.error(`❌ Failed to fetch games list for ${team.teamName}:`, fetchGamesError.message);
        logger.error(`   Error code: ${fetchGamesError.code || 'N/A'}`);
        logger.error(`   This could be due to:`);
        logger.error(`   - Network connectivity issues`);
        logger.error(`   - Server rate limiting or blocking automated requests`);
        logger.error(`   - Server downtime or maintenance`);
        throw new Error(`Unable to fetch games list: ${fetchGamesError.message}. Please try again later.`);
      }

      // Filter by targetDate if specified
      if (targetDate) {
        const targetDateStr = targetDate; // Expected format: YYYY-MM-DD
        games = games.filter(game => {
          // game.date is in format like "2024-01-06T00:00:00.000Z" or "2024-01-06"
          const gameDate = game.date ? game.date.split('T')[0] : null;
          return gameDate === targetDateStr;
        });
        logger.debug(`📅 Filtered to ${games.length} games on ${targetDate}`);

        if (games.length === 0) {
          logger.debug(`ℹ️ No games found for ${team.teamName} on ${targetDate}`);
          return [];
        }
      }

      if (games.length === 0) {
        logger.warn(`⚠️ No completed games found for ${team.teamName} in ${season}`);
        return [];
      }

      // Step 2: Fetch each game's stats using boxscore API
      const savedGames = [];
      const failedGames = [];

      for (const game of games) {
        try {
          const boxscoreUrl = `${baseUrl}/api/boxscore?bid=${game.bid}`;
          logger.debug(`Fetching game stats: ${game.id} (${game.opponent})`);
          logger.debug(`  URL: ${boxscoreUrl}`);

          // Wrap individual game fetch with retry logic
          const result = await this.retryGameFetch(async () => {
            const response = await axios.get(boxscoreUrl, getAxiosConfig(this.userAgentRotator.getNext(), 15000));

            // Check for API errors
            if (response.data.error) {
              logger.error('API returned error:', JSON.stringify(response.data.error, null, 2));
              throw new Error(`API Error: ${JSON.stringify(response.data.error)}`);
            }

            // Debug: log response structure
            if (!response.data || !response.data.data) {
              logger.error('Unexpected response structure:', JSON.stringify(response.data, null, 2));
              throw new Error('Invalid API response structure');
            }

            const transformedData = this.transformBoxscoreData(
              response.data,
              team.teamId,
              game.id,
              season,
              team.teamName,
              game.date,
              game.location, // Pass schedule location ('H', 'A', or 'N')
              game.teamScore, // Pass our score from schedule
              game.opponentScore // Pass opponent score from schedule
            );

            // Save to database (will upsert based on matchKey - overwrites if game already exists)
            const saved = await this.saveTransformedData(
              team.teamId,
              transformedData,
              { url: boxscoreUrl, name: 'Sidearm Boxscore API' },
              options
            );

            return { response, transformedData, saved };
          }, game.id);

          savedGames.push(result.saved);
          logger.debug(`✅ Game ${game.id} fetched successfully`);

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));

        } catch (gameError) {
          logger.error(`❌ Error fetching game ${game.id}:`, gameError.message);
          failedGames.push({
            gameId: game.id,
            bid: game.bid,
            opponent: game.opponent,
            error: gameError.message,
            retriesAttempted: 3
          });
        }
      }

      const successCount = savedGames.length;
      const failCount = failedGames.length;
      const totalGames = games.length;

      logger.debug(`✅ Successfully saved ${successCount}/${totalGames} games for ${team.teamName}`);
      if (failCount > 0) {
        logger.debug(`❌ Failed to fetch ${failCount}/${totalGames} games`);
        failedGames.forEach(fg => {
          logger.debug(`   - Game ${fg.gameId} vs ${fg.opponent}: ${fg.error}`);
        });
      }

      // Return enhanced result with game-level tracking
      savedGames.gameResults = {
        succeeded: successCount,
        failed: failCount,
        total: totalGames,
        failedGames: failedGames
      };

      return savedGames;

    } catch (error) {
      logger.error(`Error fetching ${this.sport} stats for ${team.teamName}:`, error.message);
      throw error;
    }
  }
}

module.exports = NCAABasketballStatsModule;
