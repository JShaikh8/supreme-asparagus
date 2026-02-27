// backend/routes/comparison.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Team = require('../models/Team');
const ScrapedData = require('../models/ScrapedData');
const IgnoredScheduleGame = require('../models/IgnoredScheduleGame');
const oracleService = require('../services/oracleService');
const statsApiService = require('../services/statsApiService');
const { performComparison, performScheduleComparison } = require('../utils/comparisonUtils');
const { validateComparison } = require('../middleware/validation');
const logger = require('../utils/logger');

// Calculate the correct default season based on current date.
// College sports seasons span two years (e.g., 2025-26 basketball season).
// Oracle stores seasons by their starting year (2025 for 2025-26).
// - Jan-June: Use previous year (we're in the second half of that season)
// - July-Dec: Use current year (new season starting or about to start)
const getDefaultSeason = () => {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed (0=Jan, 11=Dec)
  const year = now.getFullYear();
  return (month >= 0 && month <= 5) ? year - 1 : year;
};

// Compare scraped data with oracle/api
router.post('/compare', validateComparison, async (req, res) => {
  try {
    const { teamId, moduleId, source = 'api', season, startDate, endDate } = req.body;

    // Security check: Block oracle/api comparisons if internal features disabled
    const enableInternalFeatures = process.env.ENABLE_INTERNAL_FEATURES === 'true';
    if ((source === 'oracle' || source === 'api') && !enableInternalFeatures) {
      return res.status(403).json({
        error: 'Oracle and API comparisons are only available in internal mode. Use source="baseline" for web access.'
      });
    }

    logger.debug(`Starting comparison: Team=${teamId}, Module=${moduleId}, Source=${source}`);

    // Get scraped data from MongoDB with increased timeout
    let scrapedData = await ScrapedData.find({
      teamId,
      moduleId
    }).sort({ updatedAt: -1 }).maxTimeMS(30000); // 30 second timeout

    // Get team info
    const team = await Team.findOne({ teamId }).maxTimeMS(30000);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Determine sport from moduleId
    // IMPORTANT: Check 'womensBasketball' BEFORE 'mensBasketball' because
    // "womensBasketball" contains "mensBasketball" as a substring!
    // Also check for underscore versions (e.g., 'womens_basketball' for schedule modules)
    const sport = (moduleId.includes('mlb_') || moduleId.includes('mlb')) ? 'mlb' :
                  (moduleId.includes('nba_') || moduleId.includes('nba')) ? 'nba' :
                  moduleId.includes('football') ? 'football' :
                  (moduleId.includes('womensBasketball') || moduleId.includes('womens_basketball')) ? 'womensBasketball' :
                  (moduleId.includes('mensBasketball') || moduleId.includes('mens_basketball')) ? 'mensBasketball' :
                  moduleId.includes('baseball') ? 'baseball' : 'football';

    logger.debug(`Detected sport: ${sport} from moduleId: ${moduleId}`);

    // Detect if this is schedule comparison
    const isSchedule = moduleId.includes('schedule');

    // For schedule comparisons, get ignored games list (but don't filter yet - pass to comparison)
    let ignoredGameDates = new Set();
    if (isSchedule) {
      const ignoredGames = await IgnoredScheduleGame.find({
        teamId,
        moduleId
      }).select('gameDate');

      ignoredGameDates = new Set(ignoredGames.map(g => g.gameDate));

      if (ignoredGameDates.size > 0) {
        logger.debug(`Found ${ignoredGameDates.size} ignored games for this team`);
      }
    }

    let sourceData = [];
    let comparison;

    if (isSchedule) {
      // SCHEDULE COMPARISON
      logger.debug('Schedule comparison detected');

      // Filter scraped data by startDate if provided
      if (startDate) {
        const filterDate = new Date(startDate);
        scrapedData = scrapedData.filter(item => {
          const gameDate = item.data?.date || item.data?.gameDate;
          if (!gameDate) return true; // Keep games without dates
          const itemDate = new Date(gameDate.split('T')[0]);
          return itemDate >= filterDate;
        });
        logger.debug(`Filtered scraped games by date >= ${startDate}: ${scrapedData.length} games remaining`);
      }

      // Filter scraped data by endDate if provided
      if (endDate) {
        const filterEndDate = new Date(endDate);
        scrapedData = scrapedData.filter(item => {
          const gameDate = item.data?.date || item.data?.gameDate;
          if (!gameDate) return true;
          const itemDate = new Date(gameDate.split('T')[0]);
          return itemDate <= filterEndDate;
        });
        logger.debug(`Filtered scraped games by date <= ${endDate}: ${scrapedData.length} games remaining`);
      }

      if (source === 'oracle') {
        // Get Oracle team_id from stored config
        let oracleTeamId;
        if (sport === 'mlb') {
          // For MLB teams, use statsId as Oracle ID (Oracle uses internal IDs 225-254, not MLB API IDs)
          oracleTeamId = team.statsId;
        } else if (sport === 'nba') {
          // For NBA teams, use statsId as Oracle ID
          oracleTeamId = team.statsId;
        } else {
          // For NCAA teams, use sport-specific config
          oracleTeamId = team.ncaaSportsConfig?.[sport]?.oracleTeamId;
        }

        if (!oracleTeamId) {
          return res.status(404).json({
            error: `Oracle team_id not found for ${sport}. Please ensure the team has been configured with Oracle IDs.`
          });
        }

        logger.debug(`Using Oracle team_id: ${oracleTeamId} for ${sport}`);

        // Calculate seasonId from season year
        // Football: 2025 -> 202516
        // Basketball: 2025 -> 202502
        // MLB: 2025 -> 202507 (regular season)
        let seasonId;
        if (sport === 'football') {
          seasonId = `${season}16`;
        } else if (sport === 'mensBasketball' || sport === 'womensBasketball') {
          seasonId = `${season}02`;
        } else if (sport === 'mlb') {
          seasonId = `${season}07`;
        } else if (sport === 'baseball') {
          seasonId = `${season}14`;
        } else {
          seasonId = `${season}`;
        }

        if (sport === 'mlb') {
          // MLB schedule
          console.log(`[MLB COMPARE] oracleTeamId=${oracleTeamId}, seasonId=${seasonId}, startDate=${startDate}, endDate=${endDate}, season=${season}`);
          sourceData = await oracleService.getMLBSchedule(oracleTeamId, parseInt(seasonId), startDate, endDate);
          console.log(`[MLB COMPARE] Oracle returned ${sourceData.length} games`);
        } else if (sport === 'nba') {
          // NBA uses season 202501
          sourceData = await oracleService.getNBASchedule(oracleTeamId, 202501, startDate);

          // Transform Oracle data to add opponent and H/A indicator
          sourceData = sourceData.map(game => {
            // Ensure both IDs are numbers for comparison
            const homeTeamId = Number(game.homeTeam.teamId);
            const awayTeamId = Number(game.awayTeam.teamId);
            const selectedTeamId = Number(oracleTeamId);

            const isHome = homeTeamId === selectedTeamId;
            const opponent = isHome ? game.awayTeam : game.homeTeam;

            return {
              ...game,
              opponent: opponent.name,
              opponentNickname: opponent.nickname,
              locationIndicator: isHome ? 'H' : 'A'
            };
          });
        } else if (sport === 'football') {
          sourceData = await oracleService.getFootballSchedule(oracleTeamId, seasonId, startDate);
        } else if (sport === 'mensBasketball') {
          // Mens basketball uses league ID 2
          sourceData = await oracleService.getBasketballSchedule(oracleTeamId, seasonId, 2, startDate);
        } else if (sport === 'womensBasketball') {
          // Womens basketball uses league ID 5
          sourceData = await oracleService.getBasketballSchedule(oracleTeamId, seasonId, 5, startDate);
        } else if (sport === 'baseball') {
          sourceData = await oracleService.getNCAABaseballSchedule(oracleTeamId, seasonId, startDate);
        }
      } else if (source === 'baseline') {
        // Get baseline schedule from ScrapedDataHistory
        sourceData = await oracleService.getBaselineSchedule(moduleId, teamId, sport);
      } else {
        return res.status(400).json({
          error: 'API source not supported for schedule comparisons. Use "oracle" or "baseline".'
        });
      }

      // Perform schedule comparison
      comparison = await performScheduleComparison(
        scrapedData,
        sourceData,
        sport,
        team.teamId,
        team.league,
        source,
        ignoredGameDates // Pass ignored games to exclude from match rate calculation
      );

    } else {
      // ROSTER COMPARISON
      if (source === 'oracle') {
        // Get Oracle team_id from stored config
        let oracleTeamId;
        if (sport === 'mlb') {
          // For MLB teams, use statsId as Oracle ID (Oracle uses internal IDs 225-254, not MLB API IDs)
          oracleTeamId = team.statsId;
        } else if (sport === 'nba') {
          // For NBA teams, use statsId as Oracle ID
          oracleTeamId = team.statsId;
        } else {
          // For NCAA teams, use sport-specific config
          oracleTeamId = team.ncaaSportsConfig?.[sport]?.oracleTeamId;
        }

        if (!oracleTeamId) {
          return res.status(404).json({
            error: `Oracle team_id not found for ${sport}. Please ensure the team has been configured with Oracle IDs.`
          });
        }

        logger.debug(`Using Oracle team_id: ${oracleTeamId} for ${sport}`);

        if (sport === 'mlb') {
          sourceData = await oracleService.getMLBRoster(oracleTeamId, season);
        } else if (sport === 'football') {
          sourceData = await oracleService.getFootballRoster(oracleTeamId, season);
        } else if (sport === 'mensBasketball') {
          sourceData = await oracleService.getMensBasketballRoster(oracleTeamId, season);
        } else if (sport === 'womensBasketball') {
          sourceData = await oracleService.getWomensBasketballRoster(oracleTeamId, season);
        }
      } else if (source === 'baseline') {
        // Get baseline data from ScrapedDataHistory
        sourceData = await oracleService.getBaselineRoster(moduleId, teamId, sport);
      } else {
        // For API, get team_id from stored Oracle team ID if NCAA team
        let apiTeamId = team.statsId;

        if (team.league === 'NCAA' && team.ncaaSportsConfig?.[sport]?.oracleTeamId) {
          apiTeamId = team.ncaaSportsConfig[sport].oracleTeamId;
          logger.debug(`Using stored Oracle team_id ${apiTeamId} for ${sport}`);
        }

        if (sport === 'football') {
          sourceData = await statsApiService.getFootballRoster(apiTeamId);
        } else {
          const gender = sport.includes('womens') ? 'womens' : 'mens';
          sourceData = await statsApiService.getBasketballRoster(apiTeamId, gender);
        }
      }

      // Pass all necessary context to comparison
      comparison = await performComparison(
        scrapedData,
        sourceData,
        sport,
        team.teamId,
        team.league,
        source
      );
    }
    
    res.json({
      success: true,
      team: teamId,
      source,
      comparison
    });
  } catch (error) {
    logger.error('Comparison error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Oracle roster data
router.get('/oracle/roster/:teamId', async (req, res) => {
    // Security check: Block oracle access if internal features disabled
    const enableInternalFeatures = process.env.ENABLE_INTERNAL_FEATURES === 'true';
    if (!enableInternalFeatures) {
      return res.status(403).json({
        error: 'Oracle roster access is only available in internal mode.'
      });
    }

    try {
      const { teamId } = req.params;
      const { season = getDefaultSeason(), sport = 'football' } = req.query;
      
      const team = await Team.findOne({ teamId });
      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      // Get Oracle team_id from stored config
      const oracleTeamId = team.ncaaSportsConfig?.[sport]?.oracleTeamId;

      if (!oracleTeamId) {
        return res.status(404).json({
          error: `Oracle team_id not found for ${sport}. Please ensure the team has been configured with Oracle IDs.`
        });
      }

      let data;
      logger.debug(`Oracle roster fetch - Sport: ${sport}, TeamId: ${teamId}, OracleTeamId: ${oracleTeamId}`);

      if (sport === 'football') {
        data = await oracleService.getFootballRoster(oracleTeamId, season);
      } else if (sport === 'womensBasketball' || sport.includes('womens')) {
        data = await oracleService.getWomensBasketballRoster(oracleTeamId, season);
      } else if (sport === 'mensBasketball' || sport.includes('mens')) {
        data = await oracleService.getMensBasketballRoster(oracleTeamId, season);
      } else {
        return res.status(400).json({
          error: `Unsupported sport: ${sport}. Expected 'football', 'mensBasketball', or 'womensBasketball'`
        });
      }

      if (!data) {
        return res.status(500).json({ error: 'No data returned from Oracle' });
      }

      res.json({
        success: true,
        source: 'oracle',
        team: teamId,
        count: data.length,
        data
      });
    } catch (error) {
      logger.error('Oracle fetch error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get baseline roster data
  router.get('/baseline/roster/:teamId', async (req, res) => {
    try {
      const { teamId } = req.params;
      const { sport = 'football' } = req.query;

      logger.debug(`Baseline roster fetch - Sport: ${sport}, TeamId: ${teamId}`);

      // Determine moduleId from sport
      let moduleId;
      if (sport === 'football') {
        moduleId = 'ncaa_football_roster';
      } else if (sport === 'womensBasketball' || sport.includes('womens')) {
        moduleId = 'ncaa_womensBasketball_roster';
      } else if (sport === 'mensBasketball' || sport.includes('mens')) {
        moduleId = 'ncaa_mensBasketball_roster';
      } else {
        return res.status(400).json({
          error: `Unsupported sport: ${sport}. Expected 'football', 'mensBasketball', or 'womensBasketball'`
        });
      }

      const data = await oracleService.getBaselineRoster(moduleId, teamId, sport);

      if (!data || data.length === 0) {
        return res.status(404).json({ error: 'No baseline data found. Create a baseline first by checking "Create Baseline" when fetching.' });
      }

      res.json({
        success: true,
        source: 'baseline',
        team: teamId,
        count: data.length,
        data
      });
    } catch (error) {
      logger.error('Baseline fetch error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get API roster data
  router.get('/api/roster/:teamId', async (req, res) => {
    // Security check: Block API access if internal features disabled
    const enableInternalFeatures = process.env.ENABLE_INTERNAL_FEATURES === 'true';
    if (!enableInternalFeatures) {
      return res.status(403).json({
        error: 'Stats API access is only available in internal mode.'
      });
    }

    try {
      const { teamId } = req.params;
      const { sport = 'football' } = req.query;
      
      const team = await Team.findOne({ teamId });
      if (!team || !team.statsId) {
        return res.status(404).json({ error: 'Team not found or missing Stats ID' });
      }
      
      // Get the Oracle team_id from stored config for API calls
      let apiTeamId = team.statsId;

      if (team.league === 'NCAA') {
        // For NCAA teams, use the stored Oracle team_id
        const oracleTeamId = team.ncaaSportsConfig?.[sport]?.oracleTeamId;
        if (oracleTeamId) {
          apiTeamId = oracleTeamId;
          logger.debug(`Using stored Oracle team_id ${apiTeamId} for ${sport}`);
        } else {
          logger.warn(`No stored Oracle team_id found for ${sport}, using statsId directly`);
        }
      }
      
      let data;
      if (sport === 'football') {
        data = await statsApiService.getFootballRoster(apiTeamId);
      } else if (sport.includes('basketball')) {
        const gender = sport.includes('womens') ? 'womens' : 'mens';
        data = await statsApiService.getBasketballRoster(apiTeamId, gender);
      }
      
      res.json({
        success: true,
        source: 'api',
        team: teamId,
        count: data.length,
        data
      });
    } catch (error) {
      logger.error('API fetch error:', error);
      res.status(500).json({ error: error.message });
    }
  });

// Get available games for a team (for stats comparison)
router.get('/games/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { moduleId = 'ncaa_football_stats' } = req.query;

    // Get all games for this team from MongoDB
    const games = await ScrapedData.find({
      teamId,
      moduleId
    }).maxTimeMS(30000);

    let gameOptions;

    // Handle NBA boxscore data differently - it stores player records, not game records
    if (moduleId === 'nba_boxscore') {
      // Get team info to determine which team is "ours"
      const team = await Team.findOne({ teamId }).maxTimeMS(30000);
      const ourTeamName = team?.teamName || team?.teamNickname || '';
      // Use multiple keywords for better matching (e.g., "atlanta" AND "hawks" from "Atlanta Hawks")
      const ourTeamWords = ourTeamName.toLowerCase().split(' ').filter(w => w.length > 2);

      logger.debug(`NBA games dropdown: ourTeamName="${ourTeamName}", keywords=${ourTeamWords.join(',')}`);

      // Group by gameId to get unique games and track home/away team names
      const gameMap = new Map();
      games.forEach(record => {
        const gameId = record.data.gameId;
        if (!gameMap.has(gameId)) {
          gameMap.set(gameId, {
            matchKey: gameId, // Use gameId as matchKey for NBA
            gameId: gameId,
            date: record.data.gameDate,
            homeTeamName: null,
            awayTeamName: null,
            playerCount: 0,
            weAreHome: null
          });
        }
        const gameData = gameMap.get(gameId);
        gameData.playerCount++;

        // Track home and away team names based on player's team field
        if (record.data.teamName) {
          if (record.data.team === 'home') {
            gameData.homeTeamName = record.data.teamName;
          } else if (record.data.team === 'away') {
            gameData.awayTeamName = record.data.teamName;
          }

          // Determine if we are home or away - check if ANY of our team keywords match
          const recordTeamLower = record.data.teamName.toLowerCase();
          const isOurTeam = ourTeamWords.some(keyword => recordTeamLower.includes(keyword));
          if (isOurTeam) {
            gameData.weAreHome = record.data.team === 'home';
          }
        }
      });

      // Convert to array and determine opponent based on home/away
      gameOptions = Array.from(gameMap.values())
        .map(game => {
          // Opponent is the other team - if we're home, opponent is away team and vice versa
          let opponent = 'Unknown';

          // If weAreHome was determined, use it
          if (game.weAreHome === true && game.awayTeamName) {
            opponent = game.awayTeamName;
          } else if (game.weAreHome === false && game.homeTeamName) {
            opponent = game.homeTeamName;
          } else if (game.homeTeamName && game.awayTeamName) {
            // Fallback: check both team names against our team keywords
            const homeLower = game.homeTeamName.toLowerCase();
            const awayLower = game.awayTeamName.toLowerCase();
            const isHomeOurs = ourTeamWords.some(keyword => homeLower.includes(keyword));
            const isAwayOurs = ourTeamWords.some(keyword => awayLower.includes(keyword));

            if (isHomeOurs && !isAwayOurs) {
              opponent = game.awayTeamName;
              game.weAreHome = true;
            } else if (isAwayOurs && !isHomeOurs) {
              opponent = game.homeTeamName;
              game.weAreHome = false;
            } else {
              // Can't determine - log for debugging
              logger.warn(`Cannot determine our team for game ${game.gameId}: home="${game.homeTeamName}", away="${game.awayTeamName}", keywords=${ourTeamWords.join(',')}`);
            }
          } else if (game.homeTeamName || game.awayTeamName) {
            // Only one team found - the other is us
            if (game.homeTeamName && !game.awayTeamName) {
              // Home team found, we must be away
              const homeLower = game.homeTeamName.toLowerCase();
              const isHomeOurs = ourTeamWords.some(keyword => homeLower.includes(keyword));
              if (!isHomeOurs) {
                opponent = game.homeTeamName;
                game.weAreHome = false;
              }
            } else if (game.awayTeamName && !game.homeTeamName) {
              // Away team found, we must be home
              const awayLower = game.awayTeamName.toLowerCase();
              const isAwayOurs = ourTeamWords.some(keyword => awayLower.includes(keyword));
              if (!isAwayOurs) {
                opponent = game.awayTeamName;
                game.weAreHome = true;
              }
            }
          }

          logger.debug(`Game ${game.gameId}: home="${game.homeTeamName}", away="${game.awayTeamName}", weAreHome=${game.weAreHome}, opponent="${opponent}"`);

          return {
            matchKey: game.matchKey,
            gameId: game.gameId,
            date: game.date,
            opponent: opponent,
            isHome: game.weAreHome,
            playerCount: game.playerCount
          };
        })
        .sort((a, b) => {
          if (!a.date || !b.date) return 0;
          return a.date.localeCompare(b.date); // YYYY-MM-DD format sorts correctly
        });
    } else {
      // NCAA stats modules - original logic
      gameOptions = games.map(game => ({
        matchKey: game.matchKey,
        date: game.data.gameInfo?.date,
        opponent: game.data.teamInfo?.thisTeamIsHomeTeam
          ? game.data.teamInfo.visitorName
          : game.data.teamInfo.homeName,
        isHome: game.data.teamInfo?.thisTeamIsHomeTeam,
        score: game.data.teamInfo?.thisTeamIsHomeTeam
          ? `${game.data.teamInfo.homeScore}-${game.data.teamInfo.visitorScore}`
          : `${game.data.teamInfo.visitorScore}-${game.data.teamInfo.homeScore}`
      }))
      // Sort by date (earliest first) - parse date string "M/D/YYYY"
      .sort((a, b) => {
        if (!a.date || !b.date) return 0;
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateA - dateB; // Ascending order (earliest first)
      });
    }

    res.json({
      success: true,
      teamId,
      count: gameOptions.length,
      games: gameOptions
    });
  } catch (error) {
    logger.error('Error fetching games:', error);
    res.status(500).json({ error: error.message });
  }
});

// Compare basketball stats (game-by-game) - NEW endpoint for basketball stats
router.post('/compare-basketball-stats', async (req, res) => {
  try {
    const { matchKey, source = 'oracle', sport = 'mensBasketball' } = req.body;

    // Security check: Block oracle/api comparisons if internal features disabled
    const enableInternalFeatures = process.env.ENABLE_INTERNAL_FEATURES === 'true';
    if ((source === 'oracle' || source === 'api') && !enableInternalFeatures) {
      return res.status(403).json({
        error: 'Oracle and API comparisons are only available in internal mode. Use source="baseline" for web access.'
      });
    }

    logger.debug(`Starting basketball stats comparison: matchKey=${matchKey}, source=${source}, sport=${sport}`);

    // Parse matchKey to extract teamId, sport, and date
    // Format: "NCAA_NORTHWESTERN_MBB_2025-01-15" or "NCAA_NORTHWESTERN_WBB_2025-01-15"
    const parts = matchKey.split('_');
    const gameDate = parts[parts.length - 1]; // Last part should be the date
    const sportAbbrev = parts[parts.length - 2]; // Second to last is sport (MBB or WBB)
    const teamId = parts.slice(0, -2).join('_'); // Everything before sport and date

    if (!teamId || !gameDate || !/^\d{4}-\d{2}-\d{2}$/.test(gameDate)) {
      return res.status(400).json({ error: 'Invalid matchKey format. Expected: TEAMID_SPORT_YYYY-MM-DD' });
    }

    // Determine gender from sport abbreviation or parameter
    const gender = sport === 'womensBasketball' || sportAbbrev === 'WBB' ? 'W' : 'M';
    const leagueId = gender === 'M' ? 2 : 5; // 2 = Men's, 5 = Women's

    // Basketball seasons span two years (2025-26 season = 202502)
    // Games in Jan-June are part of the previous year's season
    const gameYear = parseInt(gameDate.split('-')[0]);
    const gameMonth = parseInt(gameDate.split('-')[1]);
    const seasonYear = (gameMonth >= 1 && gameMonth <= 6) ? gameYear - 1 : gameYear;
    const seasonId = parseInt(`${seasonYear}${leagueId.toString().padStart(2, '0')}`);

    logger.debug(`Parsed teamId: ${teamId}, sport: ${sport}, gameDate: ${gameDate}, seasonId: ${seasonId}, gender: ${gender}`);

    // Determine moduleId based on sport
    const moduleId = `ncaa_${sport}_stats`;

    // Get scraped stats from MongoDB
    const scrapedData = await ScrapedData.findOne({
      matchKey,
      moduleId
    }).maxTimeMS(30000);

    if (!scrapedData) {
      return res.status(404).json({ error: 'Scraped basketball stats not found for this game' });
    }

    // Get team info
    const team = await Team.findOne({ teamId }).maxTimeMS(30000);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Get stored Oracle team_id
    const oracleTeamId = team.ncaaSportsConfig?.[sport]?.oracleTeamId;

    if (!oracleTeamId) {
      return res.status(404).json({ error: `Oracle team_id not found for ${sport}. Please ensure the team has been configured with Oracle IDs.` });
    }

    // Get stats from source
    let oracleStats = [];
    if (source === 'oracle') {
      oracleStats = await oracleService.getBasketballPlayerStats(oracleTeamId, gameDate, seasonId, gender);
    } else if (source === 'baseline') {
      oracleStats = await oracleService.getBaselineBasketballStats(moduleId, teamId, gameDate, seasonId, gender);
    }

    // Perform stats comparison
    const { performStatsComparison } = require('../utils/comparisonUtils');
    const comparison = await performStatsComparison(
      scrapedData.data.players || [],
      oracleStats,
      sport,
      teamId,
      'NCAA',
      source
    );

    res.json({
      success: true,
      matchKey,
      teamId,
      sport,
      gameDate,
      source,
      scrapedGame: {
        gameInfo: scrapedData.data.gameInfo,
        teamInfo: scrapedData.data.teamInfo,
        players: scrapedData.data.players
      },
      oracleStats,
      comparison
    });
  } catch (error) {
    logger.error('Basketball stats comparison error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Compare stats (game-by-game) - NEW endpoint for stats modules (supports football, basketball, and NBA)
router.post('/compare-stats', async (req, res) => {
  try {
    const { matchKey, source = 'oracle', moduleId, teamId: requestTeamId } = req.body;

    // Security check: Block oracle/api comparisons if internal features disabled
    const enableInternalFeatures = process.env.ENABLE_INTERNAL_FEATURES === 'true';
    if ((source === 'oracle' || source === 'api') && !enableInternalFeatures) {
      return res.status(403).json({
        error: 'Oracle and API comparisons are only available in internal mode. Use source="baseline" for web access.'
      });
    }

    logger.debug(`Starting stats comparison: matchKey=${matchKey}, moduleId=${moduleId}, source=${source}`);

    // Handle NBA boxscore comparison
    // For NBA, matchKey is the gameId (e.g., "0022500057") and moduleId is "nba_boxscore"
    if (moduleId === 'nba_boxscore') {
      const gameId = matchKey;

      if (!requestTeamId) {
        return res.status(400).json({ error: 'teamId is required for NBA boxscore comparison' });
      }

      logger.debug(`NBA boxscore comparison: gameId=${gameId}, teamId=${requestTeamId}`);

      // Get team info
      const team = await Team.findOne({ teamId: requestTeamId }).maxTimeMS(30000);
      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      // Get scraped boxscore data from MongoDB for this game
      const scrapedData = await ScrapedData.find({
        teamId: requestTeamId,
        moduleId: 'nba_boxscore',
        'data.gameId': gameId
      }).maxTimeMS(30000);

      if (!scrapedData || scrapedData.length === 0) {
        return res.status(404).json({ error: 'No scraped boxscore data found for this game' });
      }

      // Extract player data from scraped documents
      const scrapedPlayers = scrapedData.map(doc => doc.data);

      // Get game date from scraped data for Oracle lookup
      const gameDate = scrapedData[0]?.data?.gameDate;
      if (!gameDate) {
        return res.status(400).json({ error: 'No game date found in scraped data' });
      }

      // Get statsId from team config (Oracle uses statsId, not nbaTeamId)
      const statsId = team.statsId;
      if (!statsId) {
        return res.status(400).json({ error: 'Stats ID not configured for this team' });
      }

      logger.debug(`NBA boxscore comparison: statsId=${statsId}, gameDate=${gameDate}`);

      // Get Oracle boxscore data
      let oraclePlayers = [];
      if (source === 'oracle') {
        oraclePlayers = await oracleService.getNBABoxscore(statsId, gameDate, 202501);
      } else if (source === 'baseline') {
        return res.status(400).json({ error: 'Baseline comparison not yet supported for NBA boxscore' });
      }

      // Perform comparison
      const { performNBABoxscoreComparison } = require('../utils/comparisonUtils');
      const comparison = await performNBABoxscoreComparison(
        scrapedPlayers,
        oraclePlayers,
        requestTeamId,
        source
      );

      // Return structure compatible with frontend expectations
      return res.json({
        success: true,
        teamId: requestTeamId,
        gameId,
        source,
        scrapedPlayers,
        oraclePlayers,
        // For frontend compatibility - expects scrapedGame.players and oracleStats
        scrapedGame: { players: scrapedPlayers },
        oracleStats: oraclePlayers,
        comparison
      });
    }

    // Detect sport from matchKey format
    // Football: "NCAA_NORTHWESTERN_2025-09-27"
    // Basketball: "NCAA_NORTHWESTERN_MBB_2025-01-15" or "NCAA_NORTHWESTERN_WBB_2025-01-15"
    const parts = matchKey.split('_');
    const lastPart = parts[parts.length - 1];
    const secondToLast = parts[parts.length - 2];

    // Check if this is basketball (has MBB or WBB before the date)
    const isBasketball = secondToLast === 'MBB' || secondToLast === 'WBB';

    if (isBasketball) {
      // Route to basketball-specific comparison
      const gameDate = lastPart; // Last part is the date
      const sportAbbrev = secondToLast; // MBB or WBB
      const teamId = parts.slice(0, -2).join('_'); // Everything before sport and date
      const sport = sportAbbrev === 'WBB' ? 'womensBasketball' : 'mensBasketball';

      if (!teamId || !gameDate || !/^\d{4}-\d{2}-\d{2}$/.test(gameDate)) {
        return res.status(400).json({ error: 'Invalid matchKey format for basketball. Expected: TEAMID_MBB/WBB_YYYY-MM-DD' });
      }

      const gender = sport === 'womensBasketball' ? 'W' : 'M';
      const leagueId = gender === 'M' ? 2 : 5;
      // Basketball seasons span two years (2025-26 season = 202502)
      // Games in Jan-June are part of the previous year's season
      const gameYear = parseInt(gameDate.split('-')[0]);
      const gameMonth = parseInt(gameDate.split('-')[1]);
      const seasonYear = (gameMonth >= 1 && gameMonth <= 6) ? gameYear - 1 : gameYear;
      const seasonId = parseInt(`${seasonYear}${leagueId.toString().padStart(2, '0')}`);

      logger.debug(`Basketball stats comparison: teamId=${teamId}, sport=${sport}, gameDate=${gameDate}, seasonId=${seasonId}`);

      // Get scraped stats from MongoDB
      const moduleId = `ncaa_${sport}_stats`;
      const scrapedData = await ScrapedData.findOne({
        matchKey,
        moduleId
      }).maxTimeMS(30000);

      if (!scrapedData) {
        return res.status(404).json({ error: 'Scraped basketball stats not found for this game' });
      }

      // Get team info
      const team = await Team.findOne({ teamId }).maxTimeMS(30000);
      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      // Get stored Oracle team_id
      const oracleTeamId = team.ncaaSportsConfig?.[sport]?.oracleTeamId;

      if (!oracleTeamId) {
        return res.status(404).json({ error: `Oracle team_id not found for ${sport}. Please ensure the team has been configured with Oracle IDs.` });
      }

      // Get stats from source
      let oracleStats = [];
      if (source === 'oracle') {
        oracleStats = await oracleService.getBasketballPlayerStats(oracleTeamId, gameDate, seasonId, gender);
      } else if (source === 'baseline') {
        oracleStats = await oracleService.getBaselineBasketballStats(moduleId, teamId, gameDate, seasonId, gender);
      }

      // Perform stats comparison
      const { performStatsComparison } = require('../utils/comparisonUtils');
      const comparison = await performStatsComparison(
        scrapedData.data.players || [],
        oracleStats,
        sport,
        teamId,
        'NCAA',
        source
      );

      return res.json({
        success: true,
        matchKey,
        teamId,
        sport,
        gameDate,
        source,
        scrapedGame: {
          gameInfo: scrapedData.data.gameInfo,
          teamInfo: scrapedData.data.teamInfo,
          players: scrapedData.data.players
        },
        oracleStats,
        comparison
      });
    }

    // Football stats comparison (original logic)
    const gameDate = parts[parts.length - 1]; // Last part should be the date
    const teamId = parts.slice(0, -1).join('_'); // Everything before the date

    if (!teamId || !gameDate || !/^\d{4}-\d{2}-\d{2}$/.test(gameDate)) {
      return res.status(400).json({ error: 'Invalid matchKey format. Expected: TEAMID_YYYY-MM-DD' });
    }

    // Football season runs Aug-Jan. Bowl games in January are part of the previous year's season.
    const gameYear = parseInt(gameDate.split('-')[0]);
    const gameMonth = parseInt(gameDate.split('-')[1]);
    const seasonYear = (gameMonth === 1) ? gameYear - 1 : gameYear;
    const seasonId = parseInt(`${seasonYear}16`); // NCAA Football league_id is 16

    logger.debug(`Football stats comparison: teamId=${teamId}, gameDate=${gameDate}, seasonId=${seasonId}`);

    // Get scraped stats from MongoDB
    const scrapedData = await ScrapedData.findOne({
      matchKey,
      moduleId: 'ncaa_football_stats'
    }).maxTimeMS(30000);

    if (!scrapedData) {
      return res.status(404).json({ error: 'Scraped stats not found for this game' });
    }

    // Get team info
    const team = await Team.findOne({ teamId }).maxTimeMS(30000);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Get stored Oracle team_id for football
    const oracleTeamId = team.ncaaSportsConfig?.football?.oracleTeamId;

    if (!oracleTeamId) {
      return res.status(404).json({ error: 'Oracle team_id not found for football. Please ensure the team has been configured with Oracle IDs.' });
    }

    // Get stats from source
    let oracleStats = [];
    if (source === 'oracle') {
      // Fetch all stat categories in parallel
      const [offensiveStats, puntingStats, returnsStats] = await Promise.all([
        oracleService.getFootballOffensiveStats(oracleTeamId, gameDate, seasonId),
        oracleService.getFootballPuntingStats(oracleTeamId, gameDate, seasonId),
        oracleService.getFootballReturnsStats(oracleTeamId, gameDate, seasonId)
      ]);

      // Merge stats by player
      const playerStatsMap = new Map();

      // Add offensive stats
      offensiveStats.forEach(player => {
        playerStatsMap.set(player.fullName, { ...player });
      });

      // Add punting stats
      puntingStats.forEach(player => {
        const existing = playerStatsMap.get(player.fullName);
        if (existing) {
          existing.punting = player.punting;
        } else {
          playerStatsMap.set(player.fullName, player);
        }
      });

      // Add returns stats (player-level)
      returnsStats.forEach(player => {
        const existing = playerStatsMap.get(player.fullName);
        if (existing) {
          existing.returns = player.returns;
        } else {
          playerStatsMap.set(player.fullName, player);
        }
      });

      oracleStats = Array.from(playerStatsMap.values());
    } else if (source === 'baseline') {
      oracleStats = await oracleService.getBaselineFootballStats('ncaa_football_stats', teamId, gameDate, seasonId, 'all');
    }

    // Transform scraped data returns structure to match Oracle
    // Sidearm has: puntReturns{}, kickoffReturns{}, interceptionReturns{}
    // Oracle has: returns{ puntReturns, puntReturnYards, kickReturns, ... }
    const transformedScrapedPlayers = (scrapedData.data.players || []).map(player => {
      const transformed = { ...player };

      // Create unified returns object if any return data exists
      if (player.puntReturns || player.kickoffReturns || player.interceptionReturns) {
        transformed.returns = {
          puntReturns: player.puntReturns?.returns || 0,
          puntReturnYards: player.puntReturns?.yards || 0,
          puntReturnLong: player.puntReturns?.long || 0,
          kickReturns: player.kickoffReturns?.returns || 0,
          kickReturnYards: player.kickoffReturns?.yards || 0,
          kickReturnLong: player.kickoffReturns?.long || 0,
          interceptions: player.interceptionReturns?.returns || 0,
          interceptionYards: player.interceptionReturns?.yards || 0,
          interceptionLong: player.interceptionReturns?.long || 0
        };
      }

      return transformed;
    });

    // Perform stats comparison
    const { performStatsComparison } = require('../utils/comparisonUtils');
    const comparison = await performStatsComparison(
      transformedScrapedPlayers,
      oracleStats,
      'football',
      teamId,
      'NCAA',
      source
    );

    res.json({
      success: true,
      matchKey,
      teamId,
      gameDate,
      source,
      scrapedGame: {
        gameInfo: scrapedData.data.gameInfo,
        teamInfo: scrapedData.data.teamInfo,
        players: transformedScrapedPlayers // Include all scraped players for mapping
      },
      oracleStats, // Include all Oracle players for mapping
      comparison
    });
  } catch (error) {
    logger.error('Stats comparison error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Compare NBA boxscore for a specific game
router.post('/compare-nba-boxscore', async (req, res) => {
  try {
    const { teamId, gameId, source = 'oracle' } = req.body;

    // Security check: Block oracle/api comparisons if internal features disabled
    const enableInternalFeatures = process.env.ENABLE_INTERNAL_FEATURES === 'true';
    if ((source === 'oracle' || source === 'api') && !enableInternalFeatures) {
      return res.status(403).json({
        error: 'Oracle and API comparisons are only available in internal mode. Use source="baseline" for web access.'
      });
    }

    if (!teamId || !gameId) {
      return res.status(400).json({ error: 'teamId and gameId are required' });
    }

    logger.debug(`Starting NBA boxscore comparison: teamId=${teamId}, gameId=${gameId}, source=${source}`);

    // Get team info
    const team = await Team.findOne({ teamId }).maxTimeMS(30000);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Get scraped boxscore data from MongoDB for this game
    const scrapedData = await ScrapedData.find({
      teamId,
      moduleId: 'nba_boxscore',
      'data.gameId': gameId
    }).maxTimeMS(30000);

    if (!scrapedData || scrapedData.length === 0) {
      return res.status(404).json({ error: 'No scraped boxscore data found for this game' });
    }

    // Extract player data from scraped documents
    const scrapedPlayers = scrapedData.map(doc => doc.data);

    // Get game date from scraped data for Oracle lookup
    const gameDate = scrapedData[0]?.data?.gameDate;
    if (!gameDate) {
      return res.status(400).json({ error: 'No game date found in scraped data' });
    }

    // Get statsId from team config (Oracle uses statsId, not nbaTeamId)
    const statsId = team.statsId;
    if (!statsId) {
      return res.status(400).json({ error: 'Stats ID not configured for this team' });
    }

    logger.debug(`NBA boxscore comparison: statsId=${statsId}, gameDate=${gameDate}`);

    // Get Oracle boxscore data
    let oraclePlayers = [];
    if (source === 'oracle') {
      oraclePlayers = await oracleService.getNBABoxscore(statsId, gameDate, 202501);
    } else if (source === 'baseline') {
      // Get baseline from ScrapedDataHistory - NBA boxscore baseline would need to be implemented
      // For now, return error if baseline requested
      return res.status(400).json({ error: 'Baseline comparison not yet supported for NBA boxscore' });
    }

    // Perform comparison
    const { performNBABoxscoreComparison } = require('../utils/comparisonUtils');
    const comparison = await performNBABoxscoreComparison(
      scrapedPlayers,
      oraclePlayers,
      teamId,
      source
    );

    // Return structure compatible with frontend expectations
    res.json({
      success: true,
      teamId,
      gameId,
      source,
      scrapedPlayers,
      oraclePlayers,
      // For frontend compatibility - expects scrapedGame.players and oracleStats
      scrapedGame: { players: scrapedPlayers },
      oracleStats: oraclePlayers,
      comparison
    });
  } catch (error) {
    logger.error('NBA boxscore comparison error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Compare all NBA boxscores for a team within a date range
router.post('/compare-nba-boxscores', async (req, res) => {
  try {
    const { teamId, startDate, endDate, source = 'oracle' } = req.body;

    // Security check: Block oracle/api comparisons if internal features disabled
    const enableInternalFeatures = process.env.ENABLE_INTERNAL_FEATURES === 'true';
    if ((source === 'oracle' || source === 'api') && !enableInternalFeatures) {
      return res.status(403).json({
        error: 'Oracle and API comparisons are only available in internal mode. Use source="baseline" for web access.'
      });
    }

    if (!teamId) {
      return res.status(400).json({ error: 'teamId is required' });
    }

    logger.debug(`Starting NBA boxscores comparison: teamId=${teamId}, startDate=${startDate}, endDate=${endDate}, source=${source}`);

    // Get team info
    const team = await Team.findOne({ teamId }).maxTimeMS(30000);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Build query for scraped data
    const query = {
      teamId,
      moduleId: 'nba_boxscore'
    };

    // Add date filtering if provided
    if (startDate || endDate) {
      query['data.gameDate'] = {};
      if (startDate) query['data.gameDate'].$gte = startDate;
      if (endDate) query['data.gameDate'].$lte = endDate;
    }

    // Get all scraped boxscore data for this team
    const scrapedData = await ScrapedData.find(query).maxTimeMS(30000);

    if (!scrapedData || scrapedData.length === 0) {
      return res.status(404).json({ error: 'No scraped boxscore data found for this team' });
    }

    // Group scraped data by gameId and track home/away team names
    const ourTeamName = team?.teamName || team?.teamNickname || '';
    const ourTeamWords = ourTeamName.toLowerCase().split(' ').filter(w => w.length > 2);

    const gameGroups = new Map();
    scrapedData.forEach(doc => {
      const gid = doc.data.gameId;
      if (!gameGroups.has(gid)) {
        gameGroups.set(gid, {
          gameId: gid,
          gameDate: doc.data.gameDate,
          players: [],
          homeTeamName: null,
          awayTeamName: null,
          weAreHome: null
        });
      }
      const gameData = gameGroups.get(gid);
      gameData.players.push(doc.data);

      // Track home and away team names
      if (doc.data.teamName) {
        if (doc.data.team === 'home') {
          gameData.homeTeamName = doc.data.teamName;
        } else if (doc.data.team === 'away') {
          gameData.awayTeamName = doc.data.teamName;
        }
        // Determine if we are home or away
        const recordTeamLower = doc.data.teamName.toLowerCase();
        const isOurTeam = ourTeamWords.some(keyword => recordTeamLower.includes(keyword));
        if (isOurTeam) {
          gameData.weAreHome = doc.data.team === 'home';
        }
      }
    });

    // Get statsId from team config (Oracle uses statsId, not nbaTeamId)
    const statsId = team.statsId;
    if (!statsId) {
      return res.status(400).json({ error: 'Stats ID not configured for this team' });
    }

    // Process each game
    const { performNBABoxscoreComparison } = require('../utils/comparisonUtils');
    const gameResults = [];
    let totalIssues = 0;
    let totalPerfectGames = 0;
    let totalGamesWithIssues = 0;

    for (const [gameId, gameData] of gameGroups.entries()) {
      try {
        // Get Oracle boxscore data for this game using statsId + gameDate
        let oraclePlayers = [];
        if (source === 'oracle') {
          oraclePlayers = await oracleService.getNBABoxscore(statsId, gameData.gameDate, 202501);
        }

        // Perform comparison
        const comparison = await performNBABoxscoreComparison(
          gameData.players,
          oraclePlayers,
          teamId,
          source
        );

        const gameIssues = comparison.summary?.totalStatDiscrepancies || 0;
        totalIssues += gameIssues;

        if (gameIssues > 0 || comparison.missingInScraped.length > 0 || comparison.missingInSource.length > 0) {
          totalGamesWithIssues++;
        } else {
          totalPerfectGames++;
        }

        // Determine opponent based on home/away
        let opponent = 'Unknown';
        if (gameData.weAreHome === true && gameData.awayTeamName) {
          opponent = gameData.awayTeamName;
        } else if (gameData.weAreHome === false && gameData.homeTeamName) {
          opponent = gameData.homeTeamName;
        } else if (gameData.homeTeamName && gameData.awayTeamName) {
          // Fallback: check both team names against our team keywords
          const homeLower = gameData.homeTeamName.toLowerCase();
          const awayLower = gameData.awayTeamName.toLowerCase();
          const isHomeOurs = ourTeamWords.some(keyword => homeLower.includes(keyword));
          const isAwayOurs = ourTeamWords.some(keyword => awayLower.includes(keyword));
          if (isHomeOurs && !isAwayOurs) {
            opponent = gameData.awayTeamName;
            gameData.weAreHome = true;
          } else if (isAwayOurs && !isHomeOurs) {
            opponent = gameData.homeTeamName;
            gameData.weAreHome = false;
          }
        }

        gameResults.push({
          gameId,
          gameDate: gameData.gameDate,
          date: gameData.gameDate,
          opponent: opponent,
          isHome: gameData.weAreHome,
          matchPercentage: comparison.matchPercentage,
          issues: gameIssues,
          missingInScraped: comparison.missingInScraped.length,
          missingInSource: comparison.missingInSource.length,
          totalPlayers: comparison.totalScraped,
          comparison
        });

      } catch (gameError) {
        logger.error(`Error comparing game ${gameId}:`, gameError.message);
        gameResults.push({
          gameId,
          gameDate: gameData.gameDate,
          date: gameData.gameDate,
          error: gameError.message
        });
      }
    }

    // Calculate aggregate stats
    const avgMatchPercentage = gameResults.filter(g => !g.error).length > 0
      ? Math.round(gameResults.filter(g => !g.error).reduce((sum, g) => sum + g.matchPercentage, 0) / gameResults.filter(g => !g.error).length)
      : 0;

    res.json({
      success: true,
      teamId,
      source,
      summary: {
        totalGames: gameResults.length,
        perfectGames: totalPerfectGames,
        gamesWithIssues: totalGamesWithIssues,
        totalIssues,
        avgMatchPercentage
      },
      games: gameResults
    });
  } catch (error) {
    logger.error('NBA boxscores comparison error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Compare all games for a team
router.post('/compare-all-games', async (req, res) => {
  try {
    const { teamId, moduleId, source = 'oracle' } = req.body;

    // Security check: Block oracle/api comparisons if internal features disabled
    const enableInternalFeatures = process.env.ENABLE_INTERNAL_FEATURES === 'true';
    if ((source === 'oracle' || source === 'api') && !enableInternalFeatures) {
      return res.status(403).json({
        error: 'Oracle and API comparisons are only available in internal mode. Use source="baseline" for web access.'
      });
    }

    logger.debug(`Starting all games comparison: teamId=${teamId}, moduleId=${moduleId}, source=${source}`);

    // Handle NBA boxscore separately - redirect to NBA-specific comparison
    if (moduleId === 'nba_boxscore') {
      logger.debug(`Redirecting to NBA boxscore comparison for ${teamId}`);

      // Get team info
      const team = await Team.findOne({ teamId }).maxTimeMS(30000);
      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      // Get all scraped boxscore data for this team
      const scrapedData = await ScrapedData.find({
        teamId,
        moduleId: 'nba_boxscore'
      }).maxTimeMS(30000);

      if (!scrapedData || scrapedData.length === 0) {
        return res.status(404).json({ error: 'No scraped boxscore data found for this team' });
      }

      // Group scraped data by gameId and track home/away team names
      const ourTeamName = team?.teamName || team?.teamNickname || '';
      const ourTeamWords = ourTeamName.toLowerCase().split(' ').filter(w => w.length > 2);

      const gameGroups = new Map();
      scrapedData.forEach(doc => {
        const gid = doc.data.gameId;
        if (!gameGroups.has(gid)) {
          gameGroups.set(gid, {
            gameId: gid,
            gameDate: doc.data.gameDate,
            players: [],
            homeTeamName: null,
            awayTeamName: null,
            weAreHome: null
          });
        }
        const gameData = gameGroups.get(gid);
        gameData.players.push(doc.data);

        // Track home and away team names
        if (doc.data.teamName) {
          if (doc.data.team === 'home') {
            gameData.homeTeamName = doc.data.teamName;
          } else if (doc.data.team === 'away') {
            gameData.awayTeamName = doc.data.teamName;
          }
          // Determine if we are home or away
          const recordTeamLower = doc.data.teamName.toLowerCase();
          const isOurTeam = ourTeamWords.some(keyword => recordTeamLower.includes(keyword));
          if (isOurTeam) {
            gameData.weAreHome = doc.data.team === 'home';
          }
        }
      });

      // Get statsId from team config (Oracle uses statsId, not nbaTeamId)
      const statsId = team.statsId;
      if (!statsId) {
        return res.status(400).json({ error: 'Stats ID not configured for this team' });
      }

      // Process each game
      const { performNBABoxscoreComparison } = require('../utils/comparisonUtils');
      const gameResults = [];
      let totalIssues = 0;
      let totalPerfectGames = 0;
      let totalGamesWithIssues = 0;

      for (const [gameId, gameData] of gameGroups.entries()) {
        try {
          // Get Oracle boxscore data for this game using statsId + gameDate
          let oraclePlayers = [];
          if (source === 'oracle') {
            oraclePlayers = await oracleService.getNBABoxscore(statsId, gameData.gameDate, 202501);
          }

          // Perform comparison
          const comparison = await performNBABoxscoreComparison(
            gameData.players,
            oraclePlayers,
            teamId,
            source
          );

          const gameIssues = comparison.summary?.totalStatDiscrepancies || 0;
          totalIssues += gameIssues;

          if (gameIssues > 0 || comparison.missingInScraped.length > 0 || comparison.missingInSource.length > 0) {
            totalGamesWithIssues++;
          } else {
            totalPerfectGames++;
          }

          // Determine opponent based on home/away
          let opponent = 'Unknown';
          if (gameData.weAreHome === true && gameData.awayTeamName) {
            opponent = gameData.awayTeamName;
          } else if (gameData.weAreHome === false && gameData.homeTeamName) {
            opponent = gameData.homeTeamName;
          } else if (gameData.homeTeamName && gameData.awayTeamName) {
            // Fallback: check both team names against our team keywords
            const homeLower = gameData.homeTeamName.toLowerCase();
            const awayLower = gameData.awayTeamName.toLowerCase();
            const isHomeOurs = ourTeamWords.some(keyword => homeLower.includes(keyword));
            const isAwayOurs = ourTeamWords.some(keyword => awayLower.includes(keyword));
            if (isHomeOurs && !isAwayOurs) {
              opponent = gameData.awayTeamName;
              gameData.weAreHome = true;
            } else if (isAwayOurs && !isHomeOurs) {
              opponent = gameData.homeTeamName;
              gameData.weAreHome = false;
            }
          }

          // Format matches NCAA response structure for AllGamesView compatibility
          gameResults.push({
            gameId,
            date: gameData.gameDate,
            gameDate: gameData.gameDate,
            opponent: opponent,
            isHome: gameData.weAreHome,
            score: '',
            comparison,
            scrapedPlayers: gameData.players,
            oracleStats: oraclePlayers
          });

        } catch (gameError) {
          logger.error(`Error comparing game ${gameId}:`, gameError.message);
          gameResults.push({
            gameId,
            date: gameData.gameDate,
            gameDate: gameData.gameDate,
            error: gameError.message
          });
        }
      }

      // Return just the array to match NCAA format for frontend compatibility
      return res.json(gameResults);
    }

    // Detect sport from moduleId (for NCAA modules)
    let sport = 'football';
    if (moduleId.includes('womensBasketball')) {
      sport = 'womensBasketball';
    } else if (moduleId.includes('mensBasketball')) {
      sport = 'mensBasketball';
    }

    const isBasketball = sport === 'mensBasketball' || sport === 'womensBasketball';
    logger.debug(`Detected sport: ${sport}, isBasketball: ${isBasketball}`);

    // Get all games for this team/module from scraped data
    const scrapedGames = await ScrapedData.find({
      teamId,
      moduleId
    }).sort({ 'data.gameInfo.date': 1 }).maxTimeMS(30000);

    if (!scrapedGames || scrapedGames.length === 0) {
      return res.status(404).json({ error: 'No games found for this team' });
    }

    // Get team info
    const team = await Team.findOne({ teamId }).maxTimeMS(30000);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Get stored Oracle team_id
    const oracleTeamId = team.ncaaSportsConfig?.[sport]?.oracleTeamId;

    if (!oracleTeamId) {
      return res.status(404).json({ error: `Oracle team_id not found for ${sport}. Please ensure the team has been configured with Oracle IDs.` });
    }

    // Process each game
    const results = [];
    const { performStatsComparison } = require('../utils/comparisonUtils');

    for (const scrapedData of scrapedGames) {
      try {
        const matchKey = scrapedData.matchKey;
        const parts = matchKey.split('_');
        const gameDate = parts[parts.length - 1];
        const gameYear = parseInt(gameDate.split('-')[0]);
        const gameMonth = parseInt(gameDate.split('-')[1]);

        // Calculate seasonId based on sport, accounting for seasons that span years
        // Basketball: Jan-June games are part of the previous year's season
        // Football: January bowl games are part of the previous year's season
        let seasonYear;
        if (isBasketball) {
          seasonYear = (gameMonth >= 1 && gameMonth <= 6) ? gameYear - 1 : gameYear;
        } else {
          seasonYear = (gameMonth === 1) ? gameYear - 1 : gameYear;
        }

        // Filter out games before 11/03 for basketball (exhibition games)
        // Use seasonYear for cutoff, not gameYear (Jan 2026 game is in 2025-26 season)
        if (isBasketball) {
          const gameDateObj = new Date(gameDate);
          const cutoffDate = new Date(`${seasonYear}-11-03`);

          if (gameDateObj < cutoffDate) {
            logger.debug(`Skipping game before 11/03: ${matchKey} (${gameDate})`);
            continue; // Skip this game
          }
        }

        let seasonId;
        if (isBasketball) {
          const gender = sport === 'womensBasketball' ? 'W' : 'M';
          const leagueId = gender === 'M' ? 2 : 5;
          seasonId = parseInt(`${seasonYear}${leagueId.toString().padStart(2, '0')}`);
        } else {
          // Football: seasonYear already calculated above
          seasonId = parseInt(`${seasonYear}16`);
        }

        logger.debug(`Processing game: ${matchKey}, sport: ${sport}, seasonId: ${seasonId}`);

        // Get stats from source for this game
        let oracleStats = [];
        if (source === 'oracle') {
          if (isBasketball) {
            // Basketball stats
            const gender = sport === 'womensBasketball' ? 'W' : 'M';
            oracleStats = await oracleService.getBasketballPlayerStats(oracleTeamId, gameDate, seasonId, gender);
          } else {
            // Football stats
            const [offensiveStats, puntingStats, returnsStats] = await Promise.all([
              oracleService.getFootballOffensiveStats(oracleTeamId, gameDate, seasonId),
              oracleService.getFootballPuntingStats(oracleTeamId, gameDate, seasonId),
              oracleService.getFootballReturnsStats(oracleTeamId, gameDate, seasonId)
            ]);

            // Merge stats by player
            const playerStatsMap = new Map();

            offensiveStats.forEach(player => {
              playerStatsMap.set(player.fullName, { ...player });
            });

            puntingStats.forEach(player => {
              const existing = playerStatsMap.get(player.fullName);
              if (existing) {
                existing.punting = player.punting;
              } else {
                playerStatsMap.set(player.fullName, player);
              }
            });

            returnsStats.forEach(player => {
              const existing = playerStatsMap.get(player.fullName);
              if (existing) {
                existing.returns = player.returns;
              } else {
                playerStatsMap.set(player.fullName, player);
              }
            });

            oracleStats = Array.from(playerStatsMap.values());
          }
        } else if (source === 'baseline') {
          // Get baseline stats for this game
          if (isBasketball) {
            const gender = sport === 'womensBasketball' ? 'W' : 'M';
            oracleStats = await oracleService.getBaselineBasketballStats(moduleId, teamId, gameDate, seasonId, gender);
          } else {
            oracleStats = await oracleService.getBaselineFootballStats(moduleId, teamId, gameDate, seasonId, 'all');
          }
        }

        // Transform scraped data (only for football)
        let transformedScrapedPlayers = scrapedData.data.players || [];
        if (!isBasketball) {
          transformedScrapedPlayers = transformedScrapedPlayers.map(player => {
            const transformed = { ...player };

            if (player.puntReturns || player.kickoffReturns || player.interceptionReturns) {
              transformed.returns = {
                puntReturns: player.puntReturns?.returns || 0,
                puntReturnYards: player.puntReturns?.yards || 0,
                puntReturnLong: player.puntReturns?.long || 0,
                kickReturns: player.kickoffReturns?.returns || 0,
                kickReturnYards: player.kickoffReturns?.yards || 0,
                kickReturnLong: player.kickoffReturns?.long || 0,
                interceptions: player.interceptionReturns?.returns || 0,
                interceptionYards: player.interceptionReturns?.yards || 0,
                interceptionLong: player.interceptionReturns?.long || 0
              };
            }

            return transformed;
          });
        }

        // Perform stats comparison for this game
        const comparison = await performStatsComparison(
          transformedScrapedPlayers,
          oracleStats,
          sport,
          teamId,
          'NCAA',
          source
        );

        // Add this game's results
        // Extract opponent from teamInfo (matchupInfo)
        const teamInfo = scrapedData.data.teamInfo || {};
        const opponent = teamInfo.thisTeamIsHomeTeam
          ? teamInfo.visitorName
          : teamInfo.homeName;

        // Build score string
        const score = teamInfo.thisTeamIsHomeTeam
          ? `${teamInfo.homeScore}-${teamInfo.visitorScore}`
          : `${teamInfo.visitorScore}-${teamInfo.homeScore}`;

        results.push({
          gameId: matchKey,
          date: scrapedData.data.gameInfo?.date || gameDate,
          opponent: opponent || 'Unknown',
          score: score || '',
          comparison,
          // Add player arrays for mapping modal
          scrapedPlayers: transformedScrapedPlayers,
          oracleStats
        });

      } catch (gameError) {
        logger.error(`Error processing game ${scrapedData.matchKey}:`, gameError);
        // Continue with next game even if one fails
      }
    }

    res.json(results);
  } catch (error) {
    logger.error('Compare all games error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get comparison result by ID
router.get('/results/:resultId', async (req, res) => {
  try {
    const { resultId } = req.params;

    const ComparisonResult = require('../models/ComparisonResult');

    const result = await ComparisonResult.findById(resultId);

    if (!result) {
      return res.status(404).json({ error: 'Comparison result not found' });
    }

    res.json(result);
  } catch (error) {
    logger.error('Error fetching comparison result:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get ALL ignored schedule games (for Field Mappings page)
router.get('/ignored-games', async (req, res) => {
  try {
    const ignoredGames = await IgnoredScheduleGame.find({}).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: ignoredGames.length,
      ignoredGames: ignoredGames
    });
  } catch (error) {
    logger.error('Error fetching all ignored games:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get ignored schedule games for a team + module
router.get('/ignored-games/:teamId/:moduleId', async (req, res) => {
  try {
    const { teamId, moduleId } = req.params;

    const ignoredGames = await IgnoredScheduleGame.find({
      teamId,
      moduleId
    }).select('gameDate opponent reason');

    // Return as array of game dates for easy Set conversion on frontend
    const gameDates = ignoredGames.map(game => game.gameDate);

    res.json({
      success: true,
      teamId,
      moduleId,
      ignoredGames: gameDates,
      details: ignoredGames  // Include full details if needed
    });
  } catch (error) {
    logger.error('Error fetching ignored games:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add a game to ignored list
router.post('/ignored-games', async (req, res) => {
  try {
    const { teamId, moduleId, gameDate, opponent, reason } = req.body;

    if (!teamId || !moduleId || !gameDate) {
      return res.status(400).json({
        error: 'teamId, moduleId, and gameDate are required'
      });
    }

    // Create or update (upsert)
    const ignoredGame = await IgnoredScheduleGame.findOneAndUpdate(
      { teamId, moduleId, gameDate },
      {
        teamId,
        moduleId,
        gameDate,
        opponent: opponent || null,
        reason: reason || 'Future tournament game'
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: 'Game added to ignored list',
      ignoredGame
    });
  } catch (error) {
    logger.error('Error adding ignored game:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove a game from ignored list by ID (for Field Mappings page)
router.delete('/ignored-games/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await IgnoredScheduleGame.findByIdAndDelete(id);

    if (!result) {
      return res.status(404).json({
        error: 'Ignored game not found'
      });
    }

    res.json({
      success: true,
      message: 'Game removed from ignored list'
    });
  } catch (error) {
    logger.error('Error removing ignored game:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove a game from ignored list (legacy - using body params)
router.delete('/ignored-games', async (req, res) => {
  try {
    const { teamId, moduleId, gameDate } = req.body;

    if (!teamId || !moduleId || !gameDate) {
      return res.status(400).json({
        error: 'teamId, moduleId, and gameDate are required'
      });
    }

    const result = await IgnoredScheduleGame.deleteOne({
      teamId,
      moduleId,
      gameDate
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        error: 'Ignored game not found'
      });
    }

    res.json({
      success: true,
      message: 'Game removed from ignored list'
    });
  } catch (error) {
    logger.error('Error removing ignored game:', error);
    res.status(500).json({ error: error.message });
  }
});

// ESPN Schedule Comparison - Compare ESPN data against Oracle for a specific team
router.post('/espn/compare', async (req, res) => {
  try {
    const { teamId, moduleId, source = 'oracle', season, startDate } = req.body;

    // Security check for oracle
    const enableInternalFeatures = process.env.ENABLE_INTERNAL_FEATURES === 'true';
    if (source === 'oracle' && !enableInternalFeatures) {
      return res.status(403).json({
        error: 'Oracle comparisons are only available in internal mode. Use source="baseline" for web access.'
      });
    }

    // Validate it's an ESPN module
    if (!moduleId || !moduleId.startsWith('espn_')) {
      return res.status(400).json({
        error: 'This endpoint is for ESPN modules only (e.g., espn_ncaa_mbb_schedule)'
      });
    }

    // Get team
    const team = await Team.findOne({ teamId });
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Check for ESPN ID
    if (!team.espnId) {
      return res.status(400).json({
        error: `Team ${teamId} does not have an ESPN ID configured`
      });
    }

    logger.info(`📺 ESPN Comparison: ${teamId} (ESPN ID: ${team.espnId}) using ${moduleId}`);

    // Get ESPN games for this team
    const espnGames = await ScrapedData.find({
      moduleId,
      $or: [
        { 'data.homeTeam.espnId': team.espnId },
        { 'data.awayTeam.espnId': team.espnId }
      ]
    }).sort({ 'data.date': 1 });

    if (espnGames.length === 0) {
      return res.status(404).json({
        error: `No ESPN games found for team ${teamId}. Fetch ESPN data first using /api/fetch/espn/schedule`
      });
    }

    logger.debug(`Found ${espnGames.length} ESPN games for ${teamId}`);

    // Transform ESPN games to comparison format (add opponent perspective)
    // New team-specific endpoint provides full data: neutralSite, venue, location, conference
    const transformedEspnGames = espnGames.map(g => {
      const data = g.data;
      const isHome = data.homeTeam?.espnId === team.espnId;
      const opponent = isHome ? data.awayTeam : data.homeTeam;

      // ESPN field mapping:
      // - name (displayName): "Tennessee Volunteers" (full name)
      // - shortName: "Tennessee" (location/short)
      // - mascot: stored in ESPN's "name" field (e.g., "Volunteers")
      // - nickname: "Tennessee" (confusingly, this is location in ESPN)
      // For Oracle comparison:
      // - opponent = shortName or nickname (location, e.g., "Tennessee")
      // - opponentNickname = mascot from ESPN's "name" field (e.g., "Volunteers")

      // Determine location indicator - ESPN now provides neutralSite boolean
      let locationIndicator;
      if (data.neutralSite) {
        locationIndicator = 'N';
      } else {
        locationIndicator = isHome ? 'H' : 'A';
      }

      return {
        matchKey: g.matchKey,
        data: {
          // Core fields for ESPN comparison
          gameDate: data.gameDate,
          date: data.date,
          time: data.time,
          time24: data.time24, // 24-hour format for comparison matching
          opponent: opponent?.shortName || opponent?.nickname, // Location (e.g., "Tennessee", "Illinois")
          opponentNickname: opponent?.mascot, // Mascot (e.g., "Volunteers", "Fighting Illini")
          opponentAbbrev: opponent?.abbreviation,
          locationIndicator: locationIndicator,
          tv: Array.isArray(data.tv) ? data.tv.join(', ') : data.tv,
          isHome,
          isAway: !isHome,
          // Neutral site and venue data (now available from team-specific endpoint)
          neutralSite: data.neutralSite || false,
          neutralHometeam: data.neutralSite ? isHome : null, // For neutral games, track if we're designated home
          venue: data.venue || '',
          location: data.location || '',
          // Conference game flag
          isConferenceGame: data.isConferenceGame || false,
          // Preserve team info for reference
          homeTeam: data.homeTeam,
          awayTeam: data.awayTeam,
          // ESPN identifiers
          espnGameId: data.espnGameId
        }
      };
    });

    // Filter by startDate if provided
    let filteredEspnGames = transformedEspnGames;
    if (startDate) {
      const filterDate = new Date(startDate);
      filteredEspnGames = transformedEspnGames.filter(g => {
        const gameDate = g.data?.gameDate;
        if (!gameDate) return true;
        return new Date(gameDate) >= filterDate;
      });
      logger.debug(`Filtered ESPN games by date >= ${startDate}: ${filteredEspnGames.length} games remaining`);
    }

    // Get Oracle data for comparison
    let sourceData = [];

    if (source === 'oracle') {
      // Determine sport from moduleId
      const sport = moduleId.includes('mbb') ? 'mensBasketball' :
                    moduleId.includes('wbb') ? 'womensBasketball' :
                    moduleId.includes('cfb') ? 'football' : 'mensBasketball';

      // Get Oracle team ID
      const oracleTeamId = team.ncaaSportsConfig?.[sport]?.oracleTeamId;
      if (!oracleTeamId) {
        return res.status(404).json({
          error: `Oracle team_id not found for ${sport}. Please ensure the team has been configured with Oracle IDs.`
        });
      }

      // Calculate seasonId
      const seasonYear = season || getDefaultSeason();
      let seasonId;
      if (sport === 'football') {
        seasonId = `${seasonYear}16`;
      } else if (sport === 'womensBasketball') {
        seasonId = `${seasonYear}05`;
      } else {
        seasonId = `${seasonYear}02`;
      }

      // Fetch from Oracle
      if (sport === 'football') {
        sourceData = await oracleService.getFootballSchedule(oracleTeamId, seasonId, startDate);
      } else if (sport === 'mensBasketball') {
        sourceData = await oracleService.getBasketballSchedule(oracleTeamId, seasonId, 2, startDate);
      } else if (sport === 'womensBasketball') {
        sourceData = await oracleService.getBasketballSchedule(oracleTeamId, seasonId, 5, startDate);
      }

      logger.debug(`Fetched ${sourceData.length} games from Oracle`);
    } else if (source === 'baseline') {
      // Get baseline from previously saved ESPN data
      const ScrapedDataHistory = require('../models/ScrapedDataHistory');
      const baselineGames = await ScrapedDataHistory.find({
        moduleId,
        $or: [
          { 'data.homeTeam.espnId': team.espnId },
          { 'data.awayTeam.espnId': team.espnId }
        ]
      }).sort({ 'data.date': 1 });

      sourceData = baselineGames.map(g => {
        const data = g.data;
        const isHome = data.homeTeam?.espnId === team.espnId;
        const opponent = isHome ? data.awayTeam : data.homeTeam;
        return {
          gameDate: data.gameDate,
          date: data.date,
          opponent: opponent?.name || opponent?.shortName,
          opponentNickname: opponent?.nickname,
          locationIndicator: isHome ? 'H' : 'A',
          tv: Array.isArray(data.tv) ? data.tv.join(', ') : data.tv,
          time: data.time
        };
      });
    } else {
      return res.status(400).json({
        error: 'Invalid source. Use "oracle" or "baseline".'
      });
    }

    // Get ignored games
    const ignoredGames = await IgnoredScheduleGame.find({
      teamId,
      moduleId
    }).select('gameDate');
    const ignoredGameDates = new Set(ignoredGames.map(g => g.gameDate));

    // Determine sport for comparison
    const sport = moduleId.includes('mbb') ? 'mensBasketball' :
                  moduleId.includes('wbb') ? 'womensBasketball' :
                  moduleId.includes('cfb') ? 'football' : 'mensBasketball';

    // Perform schedule comparison using existing utility
    // ESPN now has full data (neutralSite, venue, location, conference) so we can do full comparison
    const comparison = await performScheduleComparison(
      filteredEspnGames, // ESPN data (scraped format)
      sourceData,        // Oracle data (source format)
      sport,
      team.teamId,
      team.league,
      source,
      ignoredGameDates
    );

    res.json({
      success: true,
      team: teamId,
      espnId: team.espnId,
      source,
      espnGamesCount: filteredEspnGames.length,
      sourceGamesCount: sourceData.length,
      comparison
    });

  } catch (error) {
    logger.error('ESPN Comparison error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ESPN Bulk Schedule Comparison - Compare ESPN data against Oracle for all teams with ESPN IDs
router.post('/espn/compare-bulk', async (req, res) => {
  try {
    const { moduleId, source = 'oracle', season, startDate, endDate, teamIds } = req.body;

    // Security check for oracle
    const enableInternalFeatures = process.env.ENABLE_INTERNAL_FEATURES === 'true';
    if (source === 'oracle' && !enableInternalFeatures) {
      return res.status(403).json({
        error: 'Oracle comparisons are only available in internal mode. Use source="baseline" for web access.'
      });
    }

    // Validate it's an ESPN module
    if (!moduleId || !moduleId.startsWith('espn_')) {
      return res.status(400).json({
        error: 'This endpoint is for ESPN modules only (e.g., espn_ncaa_mbb_schedule)'
      });
    }

    // Determine sport from moduleId
    const sport = moduleId.includes('mbb') ? 'mensBasketball' :
                  moduleId.includes('wbb') ? 'womensBasketball' :
                  moduleId.includes('cfb') ? 'football' : 'mensBasketball';

    // Calculate seasonId
    const seasonYear = season || getDefaultSeason();
    let seasonId;
    if (sport === 'football') {
      seasonId = `${seasonYear}16`;
    } else if (sport === 'womensBasketball') {
      seasonId = `${seasonYear}05`;
    } else {
      seasonId = `${seasonYear}02`;
    }

    // Get all teams with ESPN IDs and Oracle team IDs for this sport
    const teamQuery = {
      league: 'NCAA',
      espnId: { $exists: true, $ne: null, $ne: '' },
      [`ncaaSportsConfig.${sport}.oracleTeamId`]: { $exists: true, $ne: null }
    };

    // Filter by specific teams if provided
    if (teamIds && teamIds.length > 0) {
      teamQuery.teamId = { $in: teamIds };
    }

    const teams = await Team.find(teamQuery);

    if (teams.length === 0) {
      return res.status(404).json({
        error: `No teams found with both ESPN ID and Oracle ID configured for ${sport}`
      });
    }

    logger.info(`📺 ESPN Bulk Comparison: ${teams.length} teams, module ${moduleId}, source ${source}`);

    const results = [];
    let totalGames = 0;
    let totalDiscrepancies = 0;
    let teamsProcessed = 0;
    let teamsWithIssues = 0;

    for (const team of teams) {
      try {
        // Get ESPN games for this team
        const espnGames = await ScrapedData.find({
          moduleId,
          $or: [
            { 'data.homeTeam.espnId': team.espnId },
            { 'data.awayTeam.espnId': team.espnId }
          ]
        }).sort({ 'data.date': 1 });

        if (espnGames.length === 0) {
          results.push({
            teamId: team.teamId,
            teamName: team.teamName,
            espnId: team.espnId,
            status: 'skipped',
            reason: 'No ESPN games found'
          });
          continue;
        }

        // Transform ESPN games to comparison format
        const transformedEspnGames = espnGames.map(g => {
          const data = g.data;
          const isHome = data.homeTeam?.espnId === team.espnId;
          const opponent = isHome ? data.awayTeam : data.homeTeam;

          let locationIndicator;
          if (data.neutralSite) {
            locationIndicator = 'N';
          } else {
            locationIndicator = isHome ? 'H' : 'A';
          }

          return {
            matchKey: g.matchKey,
            data: {
              gameDate: data.gameDate,
              date: data.date,
              time: data.time,
              time24: data.time24,
              opponent: opponent?.shortName || opponent?.nickname,
              opponentNickname: opponent?.mascot,
              opponentAbbrev: opponent?.abbreviation,
              locationIndicator: locationIndicator,
              tv: Array.isArray(data.tv) ? data.tv.join(', ') : data.tv,
              isHome,
              isAway: !isHome,
              neutralSite: data.neutralSite || false,
              venue: data.venue || '',
              location: data.location || '',
              isConferenceGame: data.isConferenceGame || false,
              homeTeam: data.homeTeam,
              awayTeam: data.awayTeam,
              espnGameId: data.espnGameId
            }
          };
        });

        // Filter by date range if provided
        let filteredEspnGames = transformedEspnGames;
        if (startDate) {
          const filterStartDate = new Date(startDate);
          filteredEspnGames = filteredEspnGames.filter(g => {
            const gameDate = g.data?.gameDate;
            if (!gameDate) return true;
            return new Date(gameDate) >= filterStartDate;
          });
        }
        if (endDate) {
          const filterEndDate = new Date(endDate);
          filteredEspnGames = filteredEspnGames.filter(g => {
            const gameDate = g.data?.gameDate;
            if (!gameDate) return true;
            return new Date(gameDate) <= filterEndDate;
          });
        }

        if (filteredEspnGames.length === 0) {
          results.push({
            teamId: team.teamId,
            teamName: team.teamName,
            espnId: team.espnId,
            status: 'skipped',
            reason: 'No games in date range'
          });
          continue;
        }

        // Get Oracle data
        const oracleTeamId = team.ncaaSportsConfig?.[sport]?.oracleTeamId;
        let sourceData = [];

        if (source === 'oracle') {
          if (sport === 'football') {
            sourceData = await oracleService.getFootballSchedule(oracleTeamId, seasonId, startDate);
          } else if (sport === 'mensBasketball') {
            sourceData = await oracleService.getBasketballSchedule(oracleTeamId, seasonId, 2, startDate);
          } else if (sport === 'womensBasketball') {
            sourceData = await oracleService.getBasketballSchedule(oracleTeamId, seasonId, 5, startDate);
          }
        }

        // Get ignored games
        const ignoredGames = await IgnoredScheduleGame.find({
          teamId: team.teamId,
          moduleId
        }).select('gameDate');
        const ignoredGameDates = new Set(ignoredGames.map(g => g.gameDate));

        // Perform comparison
        const comparison = await performScheduleComparison(
          filteredEspnGames,
          sourceData,
          sport,
          team.teamId,
          team.league,
          source,
          ignoredGameDates
        );

        const teamResult = {
          teamId: team.teamId,
          teamName: team.teamName,
          espnId: team.espnId,
          status: 'completed',
          espnGamesCount: filteredEspnGames.length,
          sourceGamesCount: sourceData.length,
          matchPercentage: comparison.matchPercentage,
          totalDiscrepancies: comparison.summary?.totalDiscrepancies || 0,
          missingInScraped: comparison.missingInScraped?.length || 0,
          missingInSource: comparison.missingInSource?.length || 0,
          comparison
        };

        results.push(teamResult);
        teamsProcessed++;
        totalGames += filteredEspnGames.length;
        totalDiscrepancies += teamResult.totalDiscrepancies;

        if (teamResult.totalDiscrepancies > 0 || teamResult.missingInScraped > 0 || teamResult.missingInSource > 0) {
          teamsWithIssues++;
        }

      } catch (teamError) {
        logger.error(`Error comparing team ${team.teamId}:`, teamError.message);
        results.push({
          teamId: team.teamId,
          teamName: team.teamName,
          espnId: team.espnId,
          status: 'error',
          error: teamError.message
        });
      }
    }

    // Calculate overall stats
    const avgMatchPercentage = teamsProcessed > 0
      ? Math.round(results.filter(r => r.status === 'completed').reduce((sum, r) => sum + r.matchPercentage, 0) / teamsProcessed)
      : 0;

    res.json({
      success: true,
      moduleId,
      source,
      sport,
      dateRange: { startDate, endDate },
      summary: {
        totalTeams: teams.length,
        teamsProcessed,
        teamsSkipped: results.filter(r => r.status === 'skipped').length,
        teamsWithErrors: results.filter(r => r.status === 'error').length,
        teamsWithIssues,
        totalGames,
        totalDiscrepancies,
        avgMatchPercentage
      },
      results
    });

  } catch (error) {
    logger.error('ESPN Bulk Comparison error:', error);
    res.status(500).json({ error: error.message });
  }
});

// MLB Bulk Schedule Comparison - Compare MLB schedule data against Oracle for all MLB teams
router.post('/mlb/compare-bulk', async (req, res) => {
  try {
    const { source = 'oracle', season, startDate, endDate, teamIds } = req.body;

    // Security check for oracle
    const enableInternalFeatures = process.env.ENABLE_INTERNAL_FEATURES === 'true';
    if (source === 'oracle' && !enableInternalFeatures) {
      return res.status(403).json({
        error: 'Oracle comparisons are only available in internal mode. Use source="baseline" for web access.'
      });
    }

    const moduleId = 'mlb_schedule';

    // Calculate seasonId (MLB regular season = league 7)
    const seasonYear = season || new Date().getFullYear();
    const seasonId = parseInt(`${seasonYear}07`);

    // Get all MLB/MILB teams with mlbId configured
    const teamQuery = {
      league: { $in: ['MLB', 'MILB'] },
      mlbId: { $exists: true, $ne: null }
    };

    // Filter by specific teams if provided
    if (teamIds && teamIds.length > 0) {
      teamQuery.teamId = { $in: teamIds };
    }

    const teams = await Team.find(teamQuery);

    if (teams.length === 0) {
      return res.status(404).json({
        error: 'No MLB/MILB teams found with mlbId configured'
      });
    }

    logger.info(`⚾ MLB Bulk Comparison: ${teams.length} teams, source ${source}, season ${seasonYear}`);

    const results = [];
    let totalGames = 0;
    let totalDiscrepancies = 0;
    let teamsProcessed = 0;
    let teamsWithIssues = 0;

    for (const team of teams) {
      try {
        // Get scraped MLB schedule data for this team
        let scrapedData = await ScrapedData.find({
          teamId: team.teamId,
          moduleId
        }).sort({ 'data.date': 1 }).maxTimeMS(30000);

        if (scrapedData.length === 0) {
          results.push({
            teamId: team.teamId,
            teamName: `${team.teamName} ${team.teamNickname || ''}`.trim(),
            mlbId: team.mlbId,
            status: 'skipped',
            reason: 'No scraped schedule data found'
          });
          continue;
        }

        // Filter by date range if provided
        if (startDate) {
          const filterStartDate = new Date(startDate);
          scrapedData = scrapedData.filter(g => {
            const gameDate = g.data?.date || g.data?.gameDate;
            if (!gameDate) return true;
            return new Date(gameDate.split('T')[0]) >= filterStartDate;
          });
        }
        if (endDate) {
          const filterEndDate = new Date(endDate);
          scrapedData = scrapedData.filter(g => {
            const gameDate = g.data?.date || g.data?.gameDate;
            if (!gameDate) return true;
            return new Date(gameDate.split('T')[0]) <= filterEndDate;
          });
        }

        if (scrapedData.length === 0) {
          results.push({
            teamId: team.teamId,
            teamName: `${team.teamName} ${team.teamNickname || ''}`.trim(),
            mlbId: team.mlbId,
            status: 'skipped',
            reason: 'No games in date range'
          });
          continue;
        }

        // Get source data (Oracle or baseline)
        let sourceData = [];
        if (source === 'oracle') {
          sourceData = await oracleService.getMLBSchedule(team.mlbId, seasonId, startDate);
        } else if (source === 'baseline') {
          sourceData = await oracleService.getBaselineSchedule(moduleId, team.teamId, 'mlb');
        }

        // Get ignored games
        const ignoredGames = await IgnoredScheduleGame.find({
          teamId: team.teamId,
          moduleId
        }).select('gameDate');
        const ignoredGameDates = new Set(ignoredGames.map(g => g.gameDate));

        // Perform comparison
        const comparison = await performScheduleComparison(
          scrapedData,
          sourceData,
          'mlb',
          team.teamId,
          team.league,
          source,
          ignoredGameDates
        );

        const teamResult = {
          teamId: team.teamId,
          teamName: `${team.teamName} ${team.teamNickname || ''}`.trim(),
          mlbId: team.mlbId,
          status: 'completed',
          scrapedGamesCount: scrapedData.length,
          sourceGamesCount: sourceData.length,
          matchPercentage: comparison.matchPercentage,
          totalDiscrepancies: comparison.summary?.totalDiscrepancies || 0,
          missingInScraped: comparison.missingInScraped?.length || 0,
          missingInSource: comparison.missingInSource?.length || 0,
          comparison
        };

        results.push(teamResult);
        teamsProcessed++;
        totalGames += scrapedData.length;
        totalDiscrepancies += teamResult.totalDiscrepancies;

        if (teamResult.totalDiscrepancies > 0 || teamResult.missingInScraped > 0 || teamResult.missingInSource > 0) {
          teamsWithIssues++;
        }

      } catch (teamError) {
        logger.error(`Error comparing MLB team ${team.teamId}:`, teamError.message);
        results.push({
          teamId: team.teamId,
          teamName: `${team.teamName} ${team.teamNickname || ''}`.trim(),
          mlbId: team.mlbId,
          status: 'error',
          error: teamError.message
        });
      }
    }

    // Calculate overall stats
    const avgMatchPercentage = teamsProcessed > 0
      ? Math.round(results.filter(r => r.status === 'completed').reduce((sum, r) => sum + r.matchPercentage, 0) / teamsProcessed)
      : 0;

    res.json({
      success: true,
      moduleId,
      source,
      season: seasonYear,
      dateRange: { startDate, endDate },
      summary: {
        totalTeams: teams.length,
        teamsProcessed,
        teamsSkipped: results.filter(r => r.status === 'skipped').length,
        teamsWithErrors: results.filter(r => r.status === 'error').length,
        teamsWithIssues,
        totalGames,
        totalDiscrepancies,
        avgMatchPercentage
      },
      results
    });

  } catch (error) {
    logger.error('MLB Bulk Comparison error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
