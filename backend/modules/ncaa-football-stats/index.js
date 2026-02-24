// backend/modules/ncaa-football-stats/index.js
// UNIFIED VERSION using adaptive_components + boxscore API for both NEW and OLD Sidearm
const BaseModule = require('../BaseModule');
const axios = require('axios');
const { retryWithBackoff, UserAgentRotator, cleanPlayerName, getAxiosConfig } = require('../../utils/httpUtils');
const logger = require('../../utils/logger');

class NCAAFootballStatsModule extends BaseModule {
  constructor() {
    super({
      id: 'ncaa_football_stats',
      name: 'NCAA Football Stats',
      league: 'NCAA',
      sport: 'football',
      dataType: 'stats',

      validation: {
        requiredFields: ['gameId', 'season'],
      },

      cacheHours: 2
    });

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

    // Parse date from gameInfo.date (format: "10/18/2025" -> "2025-10-18")
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

    // Format: TeamID_Date (e.g., "NCAA_NORTHWESTERN_2025-10-18")
    return `${teamId}_${formattedDate}`.toUpperCase().replace(/\s+/g, '_');
  }

  // Fetch games using unified adaptive_components endpoint (works for both NEW and OLD Sidearm)
  async fetchGames(baseUrl, sportId, count = 50) {
    const gamesUrl = `${baseUrl}/services/adaptive_components.ashx?type=results&count=${count}&sport_id=${sportId}`;
    logger.debug(`📋 Fetching games from unified endpoint: ${gamesUrl}`);

    // Wrap the request with retry logic
    const response = await retryWithBackoff(async () => {
      return await axios.get(gamesUrl, getAxiosConfig(this.userAgentRotator.getNext()));
    }, 'Games list fetch', 4, 2000); // 4 retries: 2s, 4s, 8s, 16s

    const games = response.data;

    if (!Array.isArray(games)) {
      logger.warn('⚠️ Games response is not an array:', typeof games);
      return [];
    }

    // Filter games that have results with bid
    const gamesWithBid = games.filter(game =>
      game.result &&
      game.result.bid &&
      game.status === 'O' // Only completed games
    );

    logger.debug(`✅ Found ${gamesWithBid.length} completed games with bid out of ${games.length} total games`);

    const mappedGames = gamesWithBid.map(game => ({
      id: game.id,
      bid: game.result.bid,
      date: game.date,
      opponent: game.opponent?.name || 'Unknown',
      location: game.location_indicator, // 'H' or 'A'
      score: `${game.result.team_score}-${game.result.opponent_score}`,
      status: game.result.status // 'W' or 'L'
    }));

    // Debug: log first game to verify structure
    if (mappedGames.length > 0) {
      logger.debug('Sample game data:', JSON.stringify(mappedGames[0], null, 2));
    }

    // Debug: Check for duplicate dates
    const dateCount = {};
    mappedGames.forEach(game => {
      dateCount[game.date] = (dateCount[game.date] || 0) + 1;
    });

    const duplicateDates = Object.entries(dateCount).filter(([date, count]) => count > 1);
    if (duplicateDates.length > 0) {
      logger.warn('⚠️ DUPLICATE DATES DETECTED:');
      duplicateDates.forEach(([date, count]) => {
        logger.warn(`  ${date}: ${count} games`);
        const dupeGames = mappedGames.filter(g => g.date === date);
        dupeGames.forEach(g => {
          logger.warn(`    - Game ID: ${g.id}, Opponent: ${g.opponent}, Score: ${g.score}, BID: ${g.bid.substring(0, 20)}...`);
        });
      });
    }

    return mappedGames;
  }

  // Parse boxscore API response and transform to our data structure
  transformBoxscoreData(boxscoreData, teamId, gameId, season, teamName, gameDate = null) {
    const data = boxscoreData.data;
    const venue = data.Venue;

    // Determine if this team is home or away
    const thisTeamIsHomeTeam = data.this_team_is_home_team;
    const thisTeam = thisTeamIsHomeTeam ? data.HomeTeam : data.VisitingTeam;
    const opponentTeam = thisTeamIsHomeTeam ? data.VisitingTeam : data.HomeTeam;

    logger.debug(`🏈 This team is ${thisTeamIsHomeTeam ? 'HOME' : 'AWAY'} team`);

    // Debug: Compare dates and use schedule date as authoritative source
    let actualGameDate = venue.Date;
    if (gameDate) {
      // Parse schedule date to MM/DD/YYYY format to match venue.Date format
      const scheduleDate = new Date(gameDate);
      const formattedScheduleDate = `${String(scheduleDate.getMonth() + 1).padStart(2, '0')}/${String(scheduleDate.getDate()).padStart(2, '0')}/${scheduleDate.getFullYear()}`;

      if (venue.Date !== formattedScheduleDate) {
        logger.warn(`⚠️ DATE MISMATCH for game ${gameId}:`);
        logger.warn(`  - Schedule (adaptive_components): ${gameDate} -> ${formattedScheduleDate}`);
        logger.warn(`  - Boxscore API (venue.Date): ${venue.Date}`);
        logger.warn(`  ✅ Using schedule date as authoritative source`);
        actualGameDate = formattedScheduleDate; // Use schedule date instead
      }
    }

    // Game info
    const gameInfo = {
      date: actualGameDate, // Use the corrected date from schedule
      venueDate: venue.Date, // Original date from boxscore API (for reference)
      location: venue.Location,
      stadium: venue.Stadium,
      attendance: venue.Attendance,
      temperature: venue.Temperature,
      wind: venue.Wind,
      weather: venue.Weather,
      startTime: venue.StartedOn,
      endTime: venue.EndedOn,
      duration: venue.Duration,
      officials: venue.Officials,
      isLeagueGame: venue.LeagueGame === 'Y',
      isNightGame: venue.NightGame === 'Y',
      isNeutralSite: venue.NeutralSiteGame === 'Y',
      isPostSeason: venue.PostSeasonGame === 'Y'
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
      periodLabel: data.period_label || 'Qtr'
    };

    // Parse players from the Players array
    const playerMap = new Map();

    logger.debug(`📋 Processing ${thisTeam.Players.length} players from boxscore`);

    thisTeam.Players.forEach(player => {
      const jersey = player.UniformNumber;
      const playerName = cleanPlayerName(player.ShortName);
      const key = `${jersey}_${playerName}`;

      // Initialize player object
      if (!playerMap.has(key)) {
        playerMap.set(key, {
          jersey: jersey,
          fullName: playerName,
          checkName: player.CheckName,
          class: player.Class,
          gamesPlayed: player.GamesPlayed,
          gamesStarted: player.GamesStarted,
          startingPosition: player.StartingPosition,
          offensivePosition: player.OffensivePosition,
          defensivePosition: player.DefensivePosition,
          // Initialize all stat categories
          passing: null,
          rushing: null,
          receiving: null,
          punting: null,
          kicking: null,
          puntReturns: null,
          kickoffReturns: null,
          interceptionReturns: null,
          fumbleReturns: null,
          defense: null,
          fumbles: null,
          scoring: null
        });
      }

      const playerObj = playerMap.get(key);

      // Process each play in the Plays array
      if (player.Plays && Array.isArray(player.Plays)) {
        player.Plays.forEach(play => {
          const playType = play.type_of;

          if (playType.includes('PassPlay')) {
            // Passing stats
            playerObj.passing = {
              completions: parseInt(play.Completions || 0),
              attempts: parseInt(play.Attempts || 0),
              ints: parseInt(play.Interceptions || 0),
              yards: parseInt(play.Yards || 0),
              tds: parseInt(play.Touchdowns || 0),
              long: parseInt(play.LongestPass || 0),
              sacks: parseInt(play.Sacks || 0),
              sackedYards: parseInt(play.SackedYards || 0)
            };
          } else if (playType.includes('RushPlay')) {
            // Rushing stats
            playerObj.rushing = {
              attempts: parseInt(play.Attempts || 0),
              yards: parseInt(play.Yards || 0),
              yardsGained: parseInt(play.Gain || 0),
              yardsLost: parseInt(play.Loss || 0),
              tds: parseInt(play.Touchdowns || 0),
              long: parseInt(play.LongestRush || 0),
              average: parseFloat(play.Average || 0)
            };
          } else if (playType.includes('ReceptionPlay')) {
            // Receiving stats
            playerObj.receiving = {
              receptions: parseInt(play.Number || 0),
              yards: parseInt(play.Yards || 0),
              tds: parseInt(play.Touchdowns || 0),
              long: parseInt(play.LongestReception || 0)
            };
          } else if (playType.includes('DefensePlay')) {
            // Defensive stats
            if (!playerObj.defense) playerObj.defense = {};
            playerObj.defense.tacklesTotal = parseInt(play.TotalTackles || 0);
            playerObj.defense.tacklesUnassisted = parseInt(play.TacklesUnassisted || 0);
            playerObj.defense.tacklesAssisted = parseInt(play.TacklesAssisted || 0);
            playerObj.defense.tacklesForLossUnassisted = parseInt(play.TacklesUnassistedForLoss || 0);
            playerObj.defense.tacklesForLossAssisted = parseInt(play.TacklesAssistedForLoss || 0);
            playerObj.defense.tackleForLossYards = parseInt(play.TackleForLossYards || 0);
            playerObj.defense.sacks = parseFloat(play.TotalSacks || 0);
            playerObj.defense.sacksUnassisted = parseFloat(play.SacksUnassisted || 0);
            playerObj.defense.sacksAssisted = parseFloat(play.SacksAssisted || 0);
            playerObj.defense.sackYards = parseInt(play.SackYardsForLoss || 0);
            playerObj.defense.passBreakups = parseInt(play.PassBreakups || 0);
            playerObj.defense.fumblesForced = parseInt(play.FumblesForces || 0);
            playerObj.defense.fumblesRecovered = parseInt(play.FumblesRecovered || 0);
            playerObj.defense.fumbleReturnYards = parseInt(play.FumbleReturnYards || 0);
            playerObj.defense.interceptions = parseInt(play.PassesIntercepted || 0);
            playerObj.defense.interceptionYards = parseInt(play.InterceptionYards || 0);
            playerObj.defense.qbHurries = parseInt(play.QuarterbackHurries || 0);
            playerObj.defense.blockedKicks = parseInt(play.BlockedKicks || 0);
            playerObj.defense.safeties = parseInt(play.Safety || 0);
          } else if (playType.includes('PuntPlay')) {
            // Punting stats
            playerObj.punting = {
              punts: parseInt(play.Number || 0),
              yards: parseInt(play.Yards || 0),
              average: parseFloat(play.Average || 0),
              long: parseInt(play.LongestPunt || 0),
              blocked: parseInt(play.Blocked || 0),
              touchbacks: parseInt(play.TouchBacks || 0),
              fairCatches: parseInt(play.FairCatches || 0),
              plus50: parseInt(play.Plus50 || 0),
              inside20: parseInt(play.Inside20 || 0)
            };
          } else if (playType.includes('PuntReturnPlay')) {
            // Punt return stats
            playerObj.puntReturns = {
              returns: parseInt(play.Number || 0),
              yards: parseInt(play.Yards || 0),
              tds: parseInt(play.Touchdowns || 0),
              long: parseInt(play.LongestPuntReturn || 0)
            };
          } else if (playType.includes('KickReturnPlay') || playType.includes('KickoffReturnPlay')) {
            // Kickoff return stats (handles both KickReturnPlay and KickoffReturnPlay)
            playerObj.kickoffReturns = {
              returns: parseInt(play.Number || 0),
              yards: parseInt(play.Yards || 0),
              tds: parseInt(play.Touchdowns || 0),
              long: parseInt(play.LongestKickReturn || 0)
            };
          } else if (playType.includes('InterceptionReturnPlay')) {
            // Interception return stats
            playerObj.interceptionReturns = {
              returns: parseInt(play.Number || 0),
              yards: parseInt(play.Yards || 0),
              tds: parseInt(play.Touchdowns || 0),
              long: parseInt(play.LongestInterceptionReturn || 0)
            };
          } else if (playType.includes('FumbleReturnPlay')) {
            // Fumble return stats
            playerObj.fumbleReturns = {
              returns: parseInt(play.Number || 0),
              yards: parseInt(play.Yards || 0),
              tds: parseInt(play.Touchdowns || 0),
              long: parseInt(play.LongestFumbleReturn || 0)
            };
          } else if (playType.includes('FieldGoalPlay')) {
            // Field goal stats
            if (!playerObj.kicking) playerObj.kicking = {};
            playerObj.kicking.fgMade = parseInt(play.Made || 0);
            playerObj.kicking.fgAttempts = parseInt(play.Attempts || 0);
            playerObj.kicking.fgLong = parseInt(play.LongestFieldGoal || 0);
            playerObj.kicking.blocked = parseInt(play.Blocked || 0);
          } else if (playType.includes('KickoffPlay')) {
            // Kickoff stats
            if (!playerObj.kicking) playerObj.kicking = {};
            playerObj.kicking.kickoffs = parseInt(play.Number || 0);
            playerObj.kicking.kickoffYards = parseInt(play.Yards || 0);
            playerObj.kicking.kickoffTouchbacks = parseInt(play.Touchbacks || 0);
            playerObj.kicking.kickoffOutOfBounds = parseInt(play.OutofBounds || 0);
          } else if (playType.includes('FumblePlay')) {
            // Fumble stats
            playerObj.fumbles = {
              fumbles: parseInt(play.Number || 0),
              fumblesLost: parseInt(play.Lost || 0)
            };
          } else if (playType.includes('ScoringPlay')) {
            // Scoring stats
            if (!playerObj.scoring) playerObj.scoring = {};
            playerObj.scoring.touchdowns = parseInt(play.Touchdowns || 0);
            playerObj.scoring.fieldGoals = parseInt(play.Fieldgoals || 0);
            playerObj.scoring.safeties = parseInt(play.Safeties || 0);
            playerObj.scoring.patKicksMade = parseInt(play.PatKicksMade || 0);
            playerObj.scoring.patKicksAtt = parseInt(play.PatKicksAtt || 0);
            playerObj.scoring.patRushesMade = parseInt(play.PatRushesMade || 0);
            playerObj.scoring.patRushesAtt = parseInt(play.PatRushesAtt || 0);
            playerObj.scoring.patPassesMade = parseInt(play.PatPassesMade || 0);
            playerObj.scoring.patPassesAtt = parseInt(play.PatPassesAtt || 0);
            playerObj.scoring.patReceptions = parseInt(play.PatReceptions || 0);
            playerObj.scoring.patDxp = parseInt(play.PatDxp || 0);
            playerObj.scoring.patBlockedKicksReturnedForScore = parseInt(play.PatBlockedKicksReturnedForScore || 0);
            playerObj.scoring.patFumblesOrInterceptionsReturnedForScore = parseInt(play.PatFumblesOrInterceptionsReturnedForScore || 0);
            playerObj.scoring.rouge = parseInt(play.Rouge || 0);
          }
        });
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
      const sportId = team.ncaaSportsConfig?.football?.sportId;
      if (!sportId) {
        throw new Error(`Team ${team.teamId} is missing football sportId in ncaaSportsConfig. Run auto-populate first.`);
      }

      const baseUrl = team.baseUrl.startsWith('http') ? team.baseUrl : `https://${team.baseUrl}`;

      logger.debug(`📊 Fetching football stats for ${team.teamName} (${season})${targetDate ? ` for date: ${targetDate}` : ''}`);

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
          // Don't double-encode the bid - it's already encoded in the API response
          const boxscoreUrl = `${baseUrl}/api/boxscore?bid=${game.bid}`;
          logger.debug(`Fetching game stats: ${game.id} (${game.opponent})`);
          logger.debug(`  URL: ${boxscoreUrl}`);

          // Wrap individual game fetch with retry logic
          const result = await this.retryGameFetch(async () => {
            const response = await axios.get(boxscoreUrl, getAxiosConfig(this.userAgentRotator.getNext()));

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
              game.date // Pass the date from adaptive_components for comparison
            );

            // When filtering by targetDate, save with short expiration (1 hour)
            // This allows comparison to work while not corrupting the full season cache
            const expirationHours = targetDate ? 1 : null; // 1 hour for filtered, default for full season

            if (targetDate) {
              logger.debug(`💾 Saving with 1-hour expiration (targetDate filter active)`);
            }

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

          // Rate limiting - increased delay to avoid server overload
          await new Promise(resolve => setTimeout(resolve, 1500)); // Increased from 500ms to 1.5s

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

      logger.debug(`\n${'='.repeat(60)}`);
      logger.debug(`📊 FETCH SUMMARY for ${team.teamName}`);
      logger.debug(`${'='.repeat(60)}`);
      logger.debug(`✅ Successfully saved: ${successCount}/${totalGames} games`);

      if (failCount > 0) {
        logger.debug(`❌ Failed to fetch: ${failCount}/${totalGames} games`);
        logger.debug(`\nFailed games details:`);
        failedGames.forEach(fg => {
          logger.debug(`   - Game ${fg.gameId} vs ${fg.opponent}`);
          logger.debug(`     Error: ${fg.error}`);
          logger.debug(`     Retries attempted: ${fg.retriesAttempted}`);
        });

        logger.debug(`\n💡 Troubleshooting tips:`);
        logger.debug(`   - The server may be rate limiting or blocking requests`);
        logger.debug(`   - Try running the fetch again in a few minutes`);
        logger.debug(`   - Consider fetching in smaller batches`);
        logger.debug(`   - Check if the website is accessible in a browser`);
      } else {
        logger.debug(`🎉 All games fetched successfully!`);
      }
      logger.debug(`${'='.repeat(60)}\n`);

      // Return enhanced result with game-level tracking
      savedGames.gameResults = {
        succeeded: successCount,
        failed: failCount,
        total: totalGames,
        failedGames: failedGames
      };

      return savedGames;

    } catch (error) {
      logger.error(`Error fetching stats for ${team.teamName}:`, error.message);
      throw error;
    }
  }
}

module.exports = NCAAFootballStatsModule;
