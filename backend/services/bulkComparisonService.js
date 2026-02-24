// backend/services/bulkComparisonService.js
const ComparisonJob = require('../models/ComparisonJob');
const ComparisonResult = require('../models/ComparisonResult');
const Team = require('../models/Team');
const ScrapedData = require('../models/ScrapedData');
const IgnoredScheduleGame = require('../models/IgnoredScheduleGame');
const oracleService = require('./oracleService');
const statsApiService = require('./statsApiService');
const crypto = require('crypto');

// Import comparison logic (we'll extract this from routes/comparison.js)
const { performComparison, performScheduleComparison } = require('../utils/comparisonUtils');
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

class BulkComparisonService {
  constructor() {
    this.runningJobs = new Map();
  }

  // Create a new bulk comparison job
  async createJob(filters) {
    const jobId = crypto.randomBytes(16).toString('hex');

    // Get matching teams
    const teamQuery = { active: true };
    if (filters.league) teamQuery.league = filters.league;
    if (filters.conference) teamQuery.conference = filters.conference;
    if (filters.division) teamQuery.division = filters.division;
    if (filters.teams && filters.teams.length > 0) {
      teamQuery.teamId = { $in: filters.teams };
    }

    const allTeams = await Team.find(teamQuery);

    // Determine which modules to use
    let modulesToRun = filters.modules || [];

    // If no modules specified, use all applicable modules for the league
    if (modulesToRun.length === 0) {
      if (filters.league === 'NCAA') {
        modulesToRun = [
          'ncaa_football_roster',
          'ncaa_mensBasketball_roster',
          'ncaa_womensBasketball_roster',
          'ncaa_baseball_schedule'
        ];
      } else if (filters.league === 'MLB' || filters.league === 'MILB') {
        modulesToRun = ['mlb_roster'];
      } else if (filters.league === 'NBA') {
        modulesToRun = [
          'nba_schedule',
          'nba_boxscore'
        ];
      }
    }

    // Filter teams to only those that can run at least one of the selected modules
    const teams = allTeams.filter(team =>
      modulesToRun.some(moduleId => this.shouldRunModule(team, moduleId))
    );

    // Calculate total operations (only counting teams that will actually be processed)
    let totalOperations = 0;
    for (const team of teams) {
      for (const moduleId of modulesToRun) {
        if (this.shouldRunModule(team, moduleId)) {
          totalOperations++;
        }
      }
    }

    // Estimate time (3 seconds per comparison - no rate limiting needed)
    const estimatedSeconds = totalOperations * 3;

    // Create job record
    logger.info(`📅 Creating job with dates - startDate: "${filters.startDate}", endDate: "${filters.endDate}"`);

    const jobFilters = {
      league: filters.league,
      conference: filters.conference,
      division: filters.division,
      teams: filters.teams,
      modules: modulesToRun,
      source: filters.source || 'oracle',
      season: filters.season || getDefaultSeason(),
      startDate: filters.startDate || filters.targetDate || null, // Support both startDate and targetDate
      targetDate: filters.targetDate || filters.startDate || null, // Backward compatibility
      endDate: filters.endDate || null // End date for date range (ESPN modules)
    };

    logger.info(`📅 Job filters endDate: "${jobFilters.endDate}" (${typeof jobFilters.endDate})`);

    const job = await ComparisonJob.create({
      jobId,
      filters: jobFilters,
      progress: {
        total: totalOperations,
        completed: 0,
        failed: 0
      },
      estimatedSeconds,
      status: 'pending'
    });

    return {
      jobId,
      estimatedSeconds,
      totalOperations,
      teams: teams.length, // Now returns only teams that will be processed
      teamsFiltered: allTeams.length - teams.length, // How many were filtered out
      modules: modulesToRun,
      source: filters.source || 'oracle'
    };
  }

  // Execute a job
  async executeJob(jobId) {
    const job = await ComparisonJob.findOne({ jobId });
    if (!job) {
      throw new Error('Job not found');
    }

    if (job.status !== 'pending') {
      throw new Error(`Job already ${job.status}`);
    }

    // Mark as running
    job.status = 'running';
    job.startedAt = new Date();
    await job.save();

    // Store abort controller
    const abortController = new AbortController();
    this.runningJobs.set(jobId, abortController);

    // Start processing in background
    this.processJob(job, abortController.signal).catch(error => {
      logger.error(`Comparison job ${jobId} failed:`, error);
      job.status = 'failed';
      job.save();
    });

    return { started: true, jobId };
  }

  // Process the job
  async processJob(job, signal) {
    try {
      // Get teams
      const teamQuery = { active: true };
      if (job.filters.league) teamQuery.league = job.filters.league;
      if (job.filters.conference) teamQuery.conference = job.filters.conference;
      if (job.filters.division) teamQuery.division = job.filters.division;
      if (job.filters.teams && job.filters.teams.length > 0) {
        teamQuery.teamId = { $in: job.filters.teams };
      }

      const teams = await Team.find(teamQuery);

      let totalMatchPercentage = 0;
      let completedComparisons = 0;

      for (const team of teams) {
        // Check if cancelled
        if (signal.aborted) {
          job.status = 'cancelled';
          await job.save();
          return;
        }

        for (const moduleId of job.filters.modules) {
          // Check if module applies to this team
          if (!this.shouldRunModule(team, moduleId)) {
            continue;
          }

          // Update current progress
          job.progress.currentTeam = `${team.teamName} ${team.teamNickname || ''}`;
          job.progress.currentModule = moduleId;
          await job.save();

          const startTime = new Date();

          try {
            // Perform comparison
            // Use startDate for schedule and boxscore modules, targetDate for stats modules
            const usesStartDate = moduleId.includes('schedule') || moduleId.includes('boxscore');
            const dateParam = usesStartDate ? job.filters.startDate : job.filters.targetDate;
            // Handle case where endDate might be stored as "null" string (database serialization issue)
            let endDateParam = job.filters.endDate;
            if (endDateParam === 'null' || endDateParam === 'undefined' || endDateParam === '') {
              endDateParam = null;
            }
            logger.info(`[${team.teamId}] Raw endDate from job: "${job.filters.endDate}" -> normalized: "${endDateParam}"`);
            const comparisonData = await this.runComparison(team, moduleId, job.filters.source, job.filters.season, dateParam, endDateParam);

            // Debug: Log comparison results to diagnose bulk 0-issues problem
            const comp = comparisonData.comparison;
            console.log(`[BULK DEBUG] ${team.teamId}/${moduleId}: scraped=${comp.totalScraped}, source=${comp.totalSource}, matches=${comp.matches.length}, discrepancies=${comp.discrepancies.length}, missingInScraped=${comp.missingInScraped.length}, missingInSource=${comp.missingInSource.length}`);
            if (comp.summary) {
              console.log(`[BULK DEBUG]   summary: perfectMatches=${comp.summary.perfectMatches}, matchesWithDiscrepancies=${comp.summary.matchesWithDiscrepancies}, uniqueToScraped=${comp.summary.uniqueToScraped}, uniqueToSource=${comp.summary.uniqueToSource}`);
            } else {
              console.log(`[BULK DEBUG]   WARNING: comparison.summary is undefined!`);
            }
            if (comp.discrepancies.length > 0) {
              comp.discrepancies.slice(0, 3).forEach((d, i) => {
                const fields = d.discrepancies ? d.discrepancies.map(dd => `${dd.field}(${dd.scraped}|${dd.source})`).join(', ') : 'N/A';
                console.log(`[BULK DEBUG]   disc[${i}]: date=${d.date}, fields=${fields}`);
              });
            }

            // Save comparison result to database
            const comparisonResult = await ComparisonResult.create({
              moduleId,
              runId: job.jobId,
              filters: {
                teams: [team.teamId]
              },
              summary: {
                totalRecords: comparisonData.comparison.totalScraped,
                matchedRecords: comparisonData.comparison.matches.length,
                differences: comparisonData.comparison.discrepancies.length,
                missingInOracle: comparisonData.comparison.missingInSource.length,
                missingInWeb: comparisonData.comparison.missingInScraped.length,
                mappingsApplied: Object.keys(comparisonData.comparison.mappedFields || {}).length,
                duration: new Date() - startTime
              },
              differences: this.formatDifferences(comparisonData.comparison, team.teamId),
              // Store detailed game-by-game data for stats modules
              gameDetails: comparisonData.comparison.gameResults || null,
              status: 'completed',
              startedAt: startTime,
              completedAt: new Date()
            });

            // Record success
            job.results.push({
              teamId: team.teamId,
              teamName: `${team.teamName} ${team.teamNickname || ''}`,
              module: moduleId,
              status: 'success',
              comparisonResultId: comparisonResult._id.toString(),
              summary: {
                matchPercentage: parseFloat(comparisonData.comparison.matchPercentage) || 0,
                totalScraped: comparisonData.comparison.totalScraped || 0,
                totalSource: comparisonData.comparison.totalSource || 0,
                perfectMatches: comparisonData.comparison.summary?.perfectMatches || 0,
                // Use discrepancies.length as direct fallback in case summary is incomplete
                matchesWithDiscrepancies: comparisonData.comparison.summary?.matchesWithDiscrepancies || comparisonData.comparison.discrepancies?.length || 0,
                missingInScraped: comparisonData.comparison.summary?.uniqueToSource || comparisonData.comparison.missingInScraped?.length || 0,
                missingInSource: comparisonData.comparison.summary?.uniqueToScraped || comparisonData.comparison.missingInSource?.length || 0,
                // Total differences (discrepancies + missing) for expandable check
                totalDifferences: (comparisonData.comparison.summary?.matchesWithDiscrepancies || comparisonData.comparison.discrepancies?.length || 0) +
                                 (comparisonData.comparison.summary?.uniqueToSource || comparisonData.comparison.missingInScraped?.length || 0) +
                                 (comparisonData.comparison.summary?.uniqueToScraped || comparisonData.comparison.missingInSource?.length || 0)
              },
              startedAt: startTime,
              completedAt: new Date()
            });

            job.progress.completed++;
            totalMatchPercentage += parseFloat(comparisonData.comparison.matchPercentage) || 0;
            completedComparisons++;

          } catch (error) {
            logger.error(`Comparison failed for ${team.teamId} ${moduleId}:`, error);

            // Record failure
            job.results.push({
              teamId: team.teamId,
              teamName: `${team.teamName} ${team.teamNickname || ''}`,
              module: moduleId,
              status: 'failed',
              error: error.message,
              startedAt: startTime,
              completedAt: new Date()
            });

            job.progress.failed++;
          }

          await job.save();
        }
      }

      // Calculate overall summary
      job.overallSummary = this.calculateOverallSummary(job.results);

      // Mark complete
      job.status = 'completed';
      job.completedAt = new Date();
      job.progress.currentTeam = null;
      job.progress.currentModule = null;
      await job.save();

    } finally {
      this.runningJobs.delete(job.jobId);
    }
  }

  // Run a single comparison
  async runComparison(team, moduleId, source, season, targetDate = null, endDate = null) {
    // Check if this is an ESPN module
    const isESPNModule = moduleId.startsWith('espn_');
    // Check if this is a stats module
    const isStatsModule = moduleId.includes('_stats');
    // Check if this is a schedule module
    const isScheduleModule = moduleId.includes('_schedule');
    // Check if this is an NBA boxscore module
    const isNBABoxscore = moduleId === 'nba_boxscore';
    // Check if this is an NBA schedule module
    const isNBASchedule = moduleId === 'nba_schedule';

    if (isESPNModule) {
      // For ESPN modules, run ESPN-specific comparison
      return await this.runESPNScheduleComparison(team, moduleId, source, season, targetDate, endDate);
    }

    if (isNBABoxscore) {
      // For NBA boxscore, run NBA-specific comparison
      return await this.runNBABoxscoreComparison(team, source, season, targetDate);
    }

    if (isNBASchedule) {
      // For NBA schedule, run NBA schedule comparison
      return await this.runNBAScheduleComparison(team, source, season, targetDate);
    }

    if (isStatsModule) {
      // For stats modules, run game-by-game comparison
      return await this.runStatsComparison(team, moduleId, source, season, targetDate);
    }

    if (isScheduleModule) {
      // For schedule modules, run schedule comparison
      return await this.runScheduleComparison(team, moduleId, source, season, targetDate);
    }

    // For roster modules, continue with existing logic
    // Get scraped data from MongoDB
    const query = {
      teamId: team.teamId,
      moduleId
    };

    // Filter by targetDate if specified
    if (targetDate) {
      // For stats data, filter by game date in data.date field
      query['data.date'] = {
        $gte: new Date(targetDate + 'T00:00:00.000Z'),
        $lt: new Date(targetDate + 'T23:59:59.999Z')
      };
    }

    const scrapedData = await ScrapedData.find(query)
      .sort({ updatedAt: -1 })
      .maxTimeMS(30000);

    // Determine sport from moduleId
    const sport = this.getSportFromModuleId(moduleId);

    let sourceData = [];

    if (source === 'oracle') {
      let oracleTeamId;

      // Pro leagues use statsId; NCAA uses ncaaSportsConfig
      if (sport === 'mlb' || sport === 'nba') {
        oracleTeamId = team.statsId;
      } else {
        oracleTeamId = team.ncaaSportsConfig?.[sport]?.oracleTeamId;
      }

      if (!oracleTeamId) {
        throw new Error(`Oracle team_id not found for ${sport}. Please ensure the team has been configured with Oracle IDs (statsId for MLB/NBA).`);
      }

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
      sourceData = await oracleService.getBaselineRoster(moduleId, team.teamId, sport);
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

    // Perform comparison using the extracted utility function
    const comparison = await performComparison(
      scrapedData,
      sourceData,
      sport,
      team.teamId,
      team.league,
      source
    );

    return {
      team: team.teamId,
      source,
      comparison
    };
  }

  // Run schedule comparison
  async runScheduleComparison(team, moduleId, source, season, startDate = null) {
    logger.debug(`[${team.teamId}] Running schedule comparison with startDate: ${startDate || 'ALL GAMES'}`);

    // Get scraped schedule data from MongoDB
    let scrapedData = await ScrapedData.find({
      teamId: team.teamId,
      moduleId
    }).sort({ updatedAt: -1 }).maxTimeMS(30000);

    // Filter scraped data by startDate if provided
    if (startDate) {
      const filterDate = new Date(startDate);
      scrapedData = scrapedData.filter(item => {
        const gameDate = item.data?.date || item.data?.gameDate;
        if (!gameDate) return true; // Keep games without dates
        const itemDate = new Date(gameDate.split('T')[0]);
        return itemDate >= filterDate;
      });
      logger.debug(`[${team.teamId}] Filtered scraped games by date >= ${startDate}: ${scrapedData.length} games remaining`);
    }

    // Get ignored games list (don't filter, pass to comparison)
    const ignoredGames = await IgnoredScheduleGame.find({
      teamId: team.teamId,
      moduleId
    }).select('gameDate');

    const ignoredGameDates = new Set(ignoredGames.map(g => g.gameDate));

    if (ignoredGameDates.size > 0) {
      logger.debug(`[${team.teamId}] Found ${ignoredGameDates.size} ignored games - will exclude from match rate calculation`);
    }

    // Determine sport from moduleId
    const sport = this.getSportFromModuleId(moduleId);

    let sourceData = [];

    if (source === 'oracle') {
      let oracleTeamId;

      // Pro leagues use statsId; NCAA uses ncaaSportsConfig
      if (sport === 'mlb' || sport === 'nba') {
        oracleTeamId = team.statsId;
      } else {
        oracleTeamId = team.ncaaSportsConfig?.[sport]?.oracleTeamId;
      }

      if (!oracleTeamId) {
        throw new Error(`Oracle team_id not found for ${sport}. Please ensure the team has been configured with Oracle IDs (statsId for MLB/NBA).`);
      }

      // Calculate seasonId from season year
      let seasonId;
      if (sport === 'mlb') {
        seasonId = `${season}07`;
      } else if (sport === 'nba') {
        seasonId = `${season}01`;
      } else if (sport === 'football') {
        seasonId = `${season}16`;
      } else if (sport === 'mensBasketball' || sport === 'womensBasketball') {
        seasonId = `${season}02`;
      } else if (sport === 'baseball') {
        seasonId = `${season}14`;
      } else {
        seasonId = `${season}`;
      }

      if (sport === 'mlb') {
        sourceData = await oracleService.getMLBSchedule(oracleTeamId, parseInt(seasonId), startDate);
      } else if (sport === 'nba') {
        sourceData = await oracleService.getNBASchedule(oracleTeamId, parseInt(seasonId), startDate);
        // Transform NBA Oracle data to add opponent and H/A indicator
        sourceData = sourceData.map(game => {
          const isHome = Number(game.homeTeam.teamId) === Number(oracleTeamId);
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
        sourceData = await oracleService.getBasketballSchedule(oracleTeamId, seasonId, 2, startDate);
      } else if (sport === 'womensBasketball') {
        sourceData = await oracleService.getBasketballSchedule(oracleTeamId, seasonId, 5, startDate);
      } else if (sport === 'baseball') {
        sourceData = await oracleService.getNCAABaseballSchedule(oracleTeamId, seasonId, startDate);
      }
    } else if (source === 'baseline') {
      sourceData = await oracleService.getBaselineSchedule(moduleId, team.teamId, sport);
    } else {
      throw new Error('API source not supported for schedule comparisons. Use "oracle" or "baseline".');
    }

    // Debug: Log data counts before comparison
    console.log(`[BULK SCHED DEBUG] ${team.teamId}/${moduleId}: ${scrapedData.length} scraped games, ${sourceData.length} oracle games, sport=${sport}, league=${team.league}`);
    if (scrapedData.length > 0) {
      const sample = scrapedData[0];
      const sDate = (sample.data || sample).gameDate || (sample.data || sample).date;
      const sVenue = (sample.data || sample).venue;
      const sTv = (sample.data || sample).tv;
      console.log(`[BULK SCHED DEBUG]   scraped sample: date=${sDate}, venue=${sVenue}, tv=${sTv}`);
    }
    if (sourceData.length > 0) {
      console.log(`[BULK SCHED DEBUG]   oracle sample: date=${sourceData[0].date}, venue=${sourceData[0].venue}, tv=${sourceData[0].tv}`);
    }

    // Perform schedule comparison
    const comparison = await performScheduleComparison(
      scrapedData,
      sourceData,
      sport,
      team.teamId,
      team.league,
      source,
      ignoredGameDates // Pass ignored games to exclude from match rate calculation
    );

    return {
      team: team.teamId,
      source,
      comparison
    };
  }

  // Run NBA boxscore comparison
  async runNBABoxscoreComparison(team, source, season, startDate = null) {
    const { performNBABoxscoreComparison } = require('../utils/comparisonUtils');

    logger.debug(`[${team.teamId}] Running NBA boxscore comparison with startDate: ${startDate || 'ALL GAMES'}`);

    // Get statsId from team config (Oracle uses statsId, not nbaTeamId)
    const statsId = team.statsId;
    if (!statsId && source === 'oracle') {
      logger.warn(`[${team.teamId}] No statsId configured for Oracle comparison`);
      return {
        team: team.teamId,
        source,
        comparison: {
          totalScraped: 0,
          totalSource: 0,
          matches: [],
          matchPercentage: 0,
          summary: {
            perfectMatches: 0,
            matchesWithDiscrepancies: 0,
            uniqueToScraped: 0,
            uniqueToSource: 0,
            totalStatDiscrepancies: 0
          },
          discrepancies: [],
          missingInSource: [],
          missingInScraped: [],
          gameResults: [],
          error: 'Stats ID not configured for this team'
        }
      };
    }

    // Build query for scraped data
    const query = {
      teamId: team.teamId,
      moduleId: 'nba_boxscore'
    };

    // Add date filtering if provided
    if (startDate) {
      query['data.gameDate'] = { $gte: startDate };
    }

    // Get all scraped boxscore data for this team
    const scrapedData = await ScrapedData.find(query).maxTimeMS(30000);

    if (!scrapedData || scrapedData.length === 0) {
      logger.debug(`[${team.teamId}] No NBA boxscore data found`);
      return {
        team: team.teamId,
        source,
        comparison: {
          totalScraped: 0,
          totalSource: 0,
          matches: [],
          matchPercentage: 0,
          summary: {
            perfectMatches: 0,
            matchesWithDiscrepancies: 0,
            uniqueToScraped: 0,
            uniqueToSource: 0,
            totalStatDiscrepancies: 0
          },
          discrepancies: [],
          missingInSource: [],
          missingInScraped: [],
          gameResults: []
        }
      };
    }

    // Group scraped data by gameId and track opponent info
    const ourTeamName = team.teamName || '';
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

    logger.debug(`[${team.teamId}] Found ${gameGroups.size} games to compare`);

    // Process each game
    const gameResults = [];
    let totalIssues = 0;
    let totalPerfectGames = 0;
    let totalGamesWithIssues = 0;
    let totalMissingInScraped = 0;
    let totalMissingInSource = 0;

    for (const [gameId, gameData] of gameGroups.entries()) {
      try {
        // Get Oracle boxscore data for this game using statsId + gameDate
        let oraclePlayers = [];
        if (source === 'oracle') {
          // Season ID for 2024-25 NBA season is 202501
          oraclePlayers = await oracleService.getNBABoxscore(statsId, gameData.gameDate, 202501);
        }

        // Perform comparison
        const comparison = await performNBABoxscoreComparison(
          gameData.players,
          oraclePlayers,
          team.teamId,
          source
        );

        const gameIssues = comparison.summary?.totalStatDiscrepancies || 0;
        totalIssues += gameIssues;
        totalMissingInScraped += (comparison.missingInScraped?.length || 0);
        totalMissingInSource += (comparison.missingInSource?.length || 0);

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
          } else if (isAwayOurs && !isHomeOurs) {
            opponent = gameData.homeTeamName;
          }
        }

        // Transform player discrepancies to match schema format
        // Schema expects: statDiffs with {stat, oracle, sidearm}
        // Comparison returns: statDiscrepancies with {field, scraped, source}
        const transformedPlayerDiscrepancies = comparison.matches
          .filter(m => m.statDiscrepancies && m.statDiscrepancies.length > 0)
          .map(m => ({
            player: m.player,
            scrapedName: m.scrapedName,
            team: m.team,
            oracleStats: m.oracleStats,
            scrapedStats: m.scrapedStats,
            statDiffs: m.statDiscrepancies.map(sd => ({
              stat: sd.field,
              oracle: sd.source,
              sidearm: sd.scraped
            }))
          }));

        gameResults.push({
          gameId,
          date: gameData.gameDate,  // Schema uses 'date' not 'gameDate'
          opponent,
          isHome: gameData.weAreHome,
          matchPercentage: comparison.matchPercentage,
          issues: gameIssues,
          missingInScraped: comparison.missingInScraped.length,
          missingInSource: comparison.missingInSource.length,
          totalPlayers: comparison.totalScraped,
          // Store player details for expanded view (transformed to match schema)
          playerDiscrepancies: transformedPlayerDiscrepancies,
          // Schema uses missingInOracle/missingInSidearm
          missingInOracle: comparison.missingInSource.map(p => ({
            player: p.player,
            team: p.team,
            stats: p.scrapedStats
          })),
          missingInSidearm: comparison.missingInScraped.map(p => ({
            player: p.player,
            team: p.team,
            stats: p.oracleStats
          })),
          comparison
        });

      } catch (gameError) {
        logger.error(`Error comparing NBA game ${gameId}:`, gameError.message);
        gameResults.push({
          gameId,
          gameDate: gameData.gameDate,
          error: gameError.message
        });
      }
    }

    // Calculate aggregate stats
    const avgMatchPercentage = gameResults.filter(g => !g.error).length > 0
      ? Math.round(gameResults.filter(g => !g.error).reduce((sum, g) => sum + g.matchPercentage, 0) / gameResults.filter(g => !g.error).length)
      : 0;

    return {
      team: team.teamId,
      source,
      comparison: {
        totalScraped: gameResults.length,
        totalSource: gameResults.length,
        matches: gameResults.filter(g => !g.error && g.issues === 0),
        matchPercentage: avgMatchPercentage,
        summary: {
          perfectMatches: totalPerfectGames,
          matchesWithDiscrepancies: totalGamesWithIssues,
          uniqueToScraped: totalMissingInSource,
          uniqueToSource: totalMissingInScraped,
          totalStatDiscrepancies: totalIssues
        },
        discrepancies: [],
        missingInSource: [],
        missingInScraped: [],
        mappedFields: {},
        gameResults
      }
    };
  }

  // Run NBA schedule comparison
  async runNBAScheduleComparison(team, source, season, startDate = null) {
    const { performScheduleComparison } = require('../utils/comparisonUtils');

    logger.debug(`[${team.teamId}] Running NBA schedule comparison with startDate: ${startDate || 'ALL GAMES'}`);

    // Get statsId from team config (Oracle uses statsId)
    const statsId = team.statsId;
    if (!statsId && source === 'oracle') {
      logger.warn(`[${team.teamId}] No statsId configured for Oracle comparison`);
      return {
        team: team.teamId,
        source,
        comparison: {
          totalScraped: 0,
          totalSource: 0,
          matches: [],
          matchPercentage: 0,
          summary: {
            perfectMatches: 0,
            matchesWithDiscrepancies: 0,
            uniqueToScraped: 0,
            uniqueToSource: 0,
            totalDiscrepancies: 0
          },
          discrepancies: [],
          missingInSource: [],
          missingInScraped: [],
          mappedFields: {},
          error: 'Stats ID not configured for this team'
        }
      };
    }

    // Build query for scraped schedule data
    const query = {
      teamId: team.teamId,
      moduleId: 'nba_schedule'
    };

    // Add date filtering if provided
    if (startDate) {
      query['data.date'] = { $gte: startDate };
    }

    // Get scraped schedule data
    const scrapedData = await ScrapedData.find(query).maxTimeMS(30000);

    if (!scrapedData || scrapedData.length === 0) {
      logger.debug(`[${team.teamId}] No NBA schedule data found`);
      return {
        team: team.teamId,
        source,
        comparison: {
          totalScraped: 0,
          totalSource: 0,
          matches: [],
          matchPercentage: 0,
          summary: {
            perfectMatches: 0,
            matchesWithDiscrepancies: 0,
            uniqueToScraped: 0,
            uniqueToSource: 0,
            totalDiscrepancies: 0
          },
          discrepancies: [],
          missingInSource: [],
          missingInScraped: []
        }
      };
    }

    logger.debug(`[${team.teamId}] Found ${scrapedData.length} scraped NBA schedule games`);

    // Get Oracle schedule data
    let sourceData = [];
    if (source === 'oracle') {
      // Season ID for 2024-25 NBA season is 202501
      const oracleSchedule = await oracleService.getNBASchedule(statsId, 202501, startDate);

      // Transform Oracle data to add opponent and H/A indicator
      // Note: NBA scraped data uses opponent = city name (e.g., "Boston")
      // Oracle has: name = "Boston Celtics", nickname = "Celtics"
      // We'll use nickname for comparison since it's closer to city names
      sourceData = oracleSchedule.map(game => {
        const homeTeamId = Number(game.homeTeam.teamId);
        const selectedTeamId = Number(statsId);
        const isHome = homeTeamId === selectedTeamId;
        const opponent = isHome ? game.awayTeam : game.homeTeam;

        return {
          ...game,
          // Use nickname for opponentName to better match scraped data
          // Scraped: "Boston" vs Oracle nickname: "Celtics" - both will need mappings
          opponentName: opponent.nickname,  // For comparison
          opponent: opponent.name,          // Full name for display
          opponentNickname: opponent.nickname,
          locationIndicator: isHome ? 'H' : 'A'
        };
      });

      logger.debug(`[${team.teamId}] Found ${sourceData.length} Oracle NBA schedule games`);
    }

    // Perform schedule comparison using existing comparison utility
    const comparison = await performScheduleComparison(
      scrapedData,
      sourceData,
      'nba',
      team.teamId,
      'NBA',
      source,
      new Set() // No ignored games
    );

    return {
      team: team.teamId,
      source,
      comparison
    };
  }

  // Run ESPN schedule comparison
  async runESPNScheduleComparison(team, moduleId, source, season, startDate = null, endDate = null) {
    const { performScheduleComparison } = require('../utils/comparisonUtils');

    const sport = this.getSportFromModuleId(moduleId);

    logger.info(`[${team.teamId}] 📺 ESPN Comparison - startDate: "${startDate}", endDate: "${endDate}", sport: ${sport}`);

    // Get ESPN games for this team
    const espnGames = await ScrapedData.find({
      moduleId,
      $or: [
        { 'data.homeTeam.espnId': team.espnId },
        { 'data.awayTeam.espnId': team.espnId }
      ]
    }).sort({ 'data.date': 1 });

    if (espnGames.length === 0) {
      logger.debug(`[${team.teamId}] No ESPN games found`);
      return {
        team: team.teamId,
        source,
        comparison: {
          totalScraped: 0,
          totalSource: 0,
          matches: [],
          matchPercentage: 0,
          summary: {
            perfectMatches: 0,
            matchesWithDiscrepancies: 0,
            uniqueToScraped: 0,
            uniqueToSource: 0,
            totalDiscrepancies: 0
          },
          discrepancies: [],
          missingInSource: [],
          missingInScraped: [],
          mappedFields: {}
        }
      };
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
    // Both gameDate and startDate/endDate are YYYY-MM-DD strings, so we can use string comparison
    // This avoids timezone issues that occur when using new Date() on date strings
    let filteredEspnGames = transformedEspnGames;

    // Normalize dates to YYYY-MM-DD format (extract date part if it contains time component)
    const normalizeDate = (d) => d ? d.substring(0, 10) : null;
    const normalizedStartDate = normalizeDate(startDate);
    const normalizedEndDate = normalizeDate(endDate);

    logger.debug(`[${team.teamId}] Filtering ESPN games - startDate: ${normalizedStartDate}, endDate: ${normalizedEndDate}`);

    if (normalizedStartDate) {
      filteredEspnGames = filteredEspnGames.filter(g => {
        const gameDate = normalizeDate(g.data?.gameDate);
        if (!gameDate) return true;
        return gameDate >= normalizedStartDate;
      });
    }
    if (normalizedEndDate) {
      filteredEspnGames = filteredEspnGames.filter(g => {
        const gameDate = normalizeDate(g.data?.gameDate);
        if (!gameDate) return true;
        const included = gameDate <= normalizedEndDate;
        if (!included) {
          logger.debug(`[${team.teamId}] Excluding game ${gameDate} - after end date ${normalizedEndDate}`);
        }
        return included;
      });
    }

    logger.info(`[${team.teamId}] 📊 ESPN games: ${transformedEspnGames.length} total -> ${filteredEspnGames.length} after date filter`);
    if (filteredEspnGames.length > 0) {
      const gameDates = filteredEspnGames.map(g => g.data?.gameDate).filter(Boolean);
      logger.info(`[${team.teamId}] 📅 Game dates in filtered set: ${gameDates.slice(0, 5).join(', ')}${gameDates.length > 5 ? '...' : ''}`);
    }

    if (filteredEspnGames.length === 0) {
      return {
        team: team.teamId,
        source,
        comparison: {
          totalScraped: 0,
          totalSource: 0,
          matches: [],
          matchPercentage: 0,
          summary: {
            perfectMatches: 0,
            matchesWithDiscrepancies: 0,
            uniqueToScraped: 0,
            uniqueToSource: 0,
            totalDiscrepancies: 0
          },
          discrepancies: [],
          missingInSource: [],
          missingInScraped: [],
          mappedFields: {}
        }
      };
    }

    // Get Oracle data
    const oracleTeamId = team.ncaaSportsConfig?.[sport]?.oracleTeamId;
    let sourceData = [];

    if (source === 'oracle') {
      // Calculate seasonId
      let seasonId;
      if (sport === 'football') {
        seasonId = `${season}16`;
      } else if (sport === 'womensBasketball') {
        seasonId = `${season}05`;
      } else {
        seasonId = `${season}02`;
      }

      if (sport === 'football') {
        sourceData = await oracleService.getFootballSchedule(oracleTeamId, seasonId, startDate);
      } else if (sport === 'mensBasketball') {
        sourceData = await oracleService.getBasketballSchedule(oracleTeamId, seasonId, 2, startDate);
      } else if (sport === 'womensBasketball') {
        sourceData = await oracleService.getBasketballSchedule(oracleTeamId, seasonId, 5, startDate);
      }

      // Filter Oracle data by endDate (Oracle API only supports startDate filter)
      if (endDate && sourceData.length > 0) {
        const normalizeDate = (d) => d ? d.substring(0, 10) : null;
        const normalizedEndDate = normalizeDate(endDate);
        const beforeFilter = sourceData.length;
        sourceData = sourceData.filter(game => {
          const gameDate = normalizeDate(game.gameDate || game.date);
          if (!gameDate) return true;
          return gameDate <= normalizedEndDate;
        });
        logger.debug(`[${team.teamId}] Filtered Oracle data: ${beforeFilter} -> ${sourceData.length} games (endDate: ${normalizedEndDate})`);
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

    return {
      team: team.teamId,
      source,
      comparison
    };
  }

  // Run stats comparison (game-by-game)
  async runStatsComparison(team, moduleId, source, season, targetDate = null) {
    const { performStatsComparison } = require('../utils/comparisonUtils');

    // Determine sport from moduleId
    const sport = this.getSportFromModuleId(moduleId);
    const isBasketball = sport === 'mensBasketball' || sport === 'womensBasketball';

    // Build query for games
    const query = {
      teamId: team.teamId,
      moduleId
    };

    // Filter by targetDate if specified
    if (targetDate) {
      // Convert targetDate from YYYY-MM-DD to MM/DD/YYYY format to match stored format
      // Need to use padStart to match how dates are saved (with zero-padding)
      const [year, month, day] = targetDate.split('-');
      const formattedDate = `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;

      logger.debug(`🎯 Filtering games for date: ${targetDate} -> ${formattedDate}`);

      // Use string comparison instead of date comparison
      query['data.gameInfo.date'] = formattedDate;
    }

    // Get all games for this team
    let scrapedGames = await ScrapedData.find(query)
      .sort({ 'data.gameInfo.date': 1 })
      .maxTimeMS(30000);

    // For basketball, filter out games before November 3rd
    if (isBasketball && scrapedGames && scrapedGames.length > 0) {
      const gamesBeforeFilter = scrapedGames.length;
      scrapedGames = scrapedGames.filter(game => {
        const gameDate = game.data?.gameInfo?.date; // MM/DD/YYYY format
        if (!gameDate) return true; // Keep if no date

        const [month, day, year] = gameDate.split('/').map(Number);

        // Filter out games before November 3rd (month 11, day 3)
        // Keep games if: month > 11, OR (month == 11 AND day >= 3), OR month < 5 (early season games in new calendar year)
        if (month < 5) return true; // Jan-Apr games (end of season in new calendar year)
        if (month > 11) return true; // Dec games
        if (month === 11 && day >= 3) return true; // Nov 3rd or later

        return false; // Filter out games before Nov 3rd
      });

      if (gamesBeforeFilter > scrapedGames.length) {
        logger.debug(`🗓️  Filtered out ${gamesBeforeFilter - scrapedGames.length} games before November 3rd for ${team.teamName}`);
      }
    }

    if (!scrapedGames || scrapedGames.length === 0) {
      // Return empty result instead of throwing error - graceful handling
      logger.debug(`ℹ️ No games found for ${team.teamName}${targetDate ? ` on ${targetDate}` : ''}`);
      return {
        team: team.teamId,
        source,
        comparison: {
          totalScraped: 0,
          totalSource: 0,
          matches: [],
          matchPercentage: 0,
          summary: {
            perfectMatches: 0,
            matchesWithDiscrepancies: 0,
            uniqueToScraped: 0,
            uniqueToSource: 0,
            totalStatDiscrepancies: 0
          },
          discrepancies: [],
          missingInSource: [],
          missingInScraped: [],
          gameResults: []
        }
      };
    }

    // Get stored Oracle team_id
    const oracleTeamId = team.ncaaSportsConfig?.[sport]?.oracleTeamId;

    if (!oracleTeamId) {
      throw new Error(`Oracle team_id not found for ${sport}. Please ensure the team has been configured with Oracle IDs.`);
    }

    // Process each game
    const gameResults = [];
    let totalIssues = 0;
    let totalGamesWithIssues = 0;
    let totalPerfectGames = 0;
    let totalMissingInScraped = 0; // Players in Oracle but not in scraped boxscore
    let totalMissingInSource = 0;  // Players in scraped boxscore but not in Oracle

    for (const scrapedData of scrapedGames) {
      try {
        const matchKey = scrapedData.matchKey;
        const parts = matchKey.split('_');
        const gameDate = parts[parts.length - 1];
        const gameYear = parseInt(gameDate.split('-')[0]);
        const gameMonth = parseInt(gameDate.split('-')[1]);

        // Calculate season year accounting for seasons that span calendar years
        // Basketball: Jan-June games are part of the previous year's season (2025-26 = 202502)
        // Football: January bowl games are part of the previous year's season
        let seasonYear;
        if (isBasketball) {
          seasonYear = (gameMonth >= 1 && gameMonth <= 6) ? gameYear - 1 : gameYear;
        } else {
          seasonYear = (gameMonth === 1) ? gameYear - 1 : gameYear;
        }

        // Calculate season ID based on sport
        let seasonId;
        if (isBasketball) {
          const leagueId = sport === 'mensBasketball' ? 2 : 5;
          seasonId = parseInt(`${seasonYear}${leagueId.toString().padStart(2, '0')}`);
        } else {
          seasonId = parseInt(`${seasonYear}16`); // Football
        }

        // Get stats from source for this game
        let oracleStats = [];
        if (source === 'oracle') {
          if (isBasketball) {
            // Basketball stats
            const gender = sport === 'mensBasketball' ? 'M' : 'W';
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
            const gender = sport === 'mensBasketball' ? 'M' : 'W';
            oracleStats = await oracleService.getBaselineBasketballStats(moduleId, team.teamId, gameDate, seasonId, gender);
          } else {
            oracleStats = await oracleService.getBaselineFootballStats(moduleId, team.teamId, gameDate, seasonId, 'all');
          }
        }

        // Transform scraped data for football (returns structure)
        let transformedScrapedPlayers;
        if (isBasketball) {
          // Basketball - no transformation needed
          transformedScrapedPlayers = scrapedData.data.players || [];
        } else {
          // Football - transform returns structure
          transformedScrapedPlayers = (scrapedData.data.players || []).map(player => {
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
          team.teamId,
          'NCAA',
          source
        );

        const gameIssues = comparison.summary?.totalStatDiscrepancies || 0;
        totalIssues += gameIssues;

        // Accumulate missing player counts across all games
        totalMissingInScraped += (comparison.missingInScraped?.length || 0);
        totalMissingInSource += (comparison.missingInSource?.length || 0);

        if (gameIssues > 0) {
          totalGamesWithIssues++;
        } else {
          totalPerfectGames++;
        }

        // Extract opponent info
        const teamInfo = scrapedData.data.teamInfo || {};
        const opponent = teamInfo.thisTeamIsHomeTeam
          ? teamInfo.visitorName
          : teamInfo.homeName;

        // Extract detailed player discrepancies for this game
        const playerDiscrepancies = (comparison.discrepancies || []).map(disc => ({
          player: disc.player,
          jersey: disc.jersey,
          sidearmStats: disc.sidearmStats || disc.scrapedStats || {},
          oracleStats: disc.oracleStats || disc.sourceStats || {},
          statDiffs: (disc.statDiscrepancies || disc.discrepancies || []).map(sd => ({
            category: sd.category,
            stat: sd.stat,
            oracle: sd.source,
            sidearm: sd.scraped
          }))
        }));

        // Extract missing players
        const missingInOracle = (comparison.missingInSource || []).map(p => ({
          player: p.player,
          jersey: p.jersey,
          stats: p.sidearmStats
        }));

        const missingInSidearm = (comparison.missingInScraped || []).map(p => ({
          player: p.player,
          jersey: p.jersey,
          stats: p.oracleStats
        }));

        gameResults.push({
          gameId: matchKey,
          date: scrapedData.data.gameInfo?.date || gameDate,
          opponent: opponent || 'Unknown',
          matchPercentage: comparison.matchPercentage || 0,
          issues: gameIssues,
          // Detailed breakdown for expandable view
          playerDiscrepancies: playerDiscrepancies,
          missingInOracle: missingInOracle,
          missingInSidearm: missingInSidearm,
          totalPlayers: comparison.totalScraped || 0
        });

      } catch (gameError) {
        logger.error(`Error processing game ${scrapedData.matchKey}:`, gameError);
        // Continue with next game
      }
    }

    // Calculate aggregate stats
    const avgMatchPercentage = gameResults.length > 0
      ? Math.round(gameResults.reduce((sum, g) => sum + g.matchPercentage, 0) / gameResults.length)
      : 0;

    // Return aggregated comparison data in format expected by bulk comparison
    return {
      team: team.teamId,
      source,
      comparison: {
        totalScraped: gameResults.length,
        totalSource: gameResults.length,
        matches: gameResults.filter(g => g.issues === 0),
        matchPercentage: avgMatchPercentage,
        summary: {
          perfectMatches: totalPerfectGames,
          matchesWithDiscrepancies: totalGamesWithIssues,
          uniqueToScraped: totalMissingInSource, // Players in scraped but not in Oracle (across all games)
          uniqueToSource: totalMissingInScraped, // Players in Oracle but not in scraped (across all games)
          totalStatDiscrepancies: totalIssues
        },
        discrepancies: [], // Individual game discrepancies not stored in bulk
        missingInSource: [],
        missingInScraped: [],
        mappedFields: {},
        // Add custom field for stats
        gameResults: gameResults
      }
    };
  }

  // Get sport from moduleId
  getSportFromModuleId(moduleId) {
    // Pro leagues
    if (moduleId.startsWith('mlb_') || moduleId === 'mlb') return 'mlb';
    if (moduleId.startsWith('nba_') || moduleId === 'nba') return 'nba';

    // ESPN modules use abbreviated sport names
    if (moduleId.includes('cfb')) return 'football';
    if (moduleId.includes('wbb')) return 'womensBasketball';
    if (moduleId.includes('mbb')) return 'mensBasketball';

    if (moduleId.includes('football')) return 'football';
    // IMPORTANT: Check womensBasketball BEFORE mensBasketball (substring issue)
    // Also check for underscore versions (e.g., 'womens_basketball' for schedule modules)
    if (moduleId.includes('womensBasketball') || moduleId.includes('womens_basketball')) return 'womensBasketball';
    if (moduleId.includes('mensBasketball') || moduleId.includes('mens_basketball')) return 'mensBasketball';
    if (moduleId.includes('baseball')) return 'baseball';
    return 'football';
  }

  // Check if module should run for team
  shouldRunModule(team, moduleId) {
    // NCAA modules only for NCAA teams
    if (moduleId.startsWith('ncaa_') && team.league !== 'NCAA') {
      return false;
    }

    // ESPN modules only for NCAA teams with ESPN ID and Oracle ID configured
    if (moduleId.startsWith('espn_')) {
      if (team.league !== 'NCAA') {
        return false;
      }
      // Must have ESPN ID
      if (!team.espnId) {
        return false;
      }
      // Must have Oracle ID for the sport
      const sport = this.getSportFromModuleId(moduleId);
      if (!team.ncaaSportsConfig?.[sport]?.oracleTeamId) {
        return false;
      }
      return true;
    }

    // MLB modules only for MLB/MILB teams with statsId configured
    if (moduleId.startsWith('mlb_')) {
      if (!['MLB', 'MILB'].includes(team.league)) {
        return false;
      }
      if (!team.statsId) {
        return false;
      }
    }

    // NBA modules only for NBA teams with appropriate IDs configured
    // nbaTeamId is needed for NBA API, statsId is needed for Oracle
    if (moduleId.startsWith('nba_')) {
      if (team.league !== 'NBA') {
        return false;
      }
      // At minimum, need nbaTeamId for scraping
      if (!team.nbaTeamId) {
        return false;
      }
      // Note: statsId check happens in the comparison function itself
      // since it depends on the source being used
    }

    // Check if team has required config for NCAA modules
    if (team.league === 'NCAA') {
      if (moduleId === 'ncaa_football_roster' && !team.ncaaSportsConfig?.football?.rosterId) {
        return false;
      }
      if (moduleId === 'ncaa_football_schedule' && !team.ncaaSportsConfig?.football?.sportId) {
        return false;
      }
      if (moduleId === 'ncaa_football_stats' && !team.ncaaSportsConfig?.football?.sportId) {
        return false;
      }
      if (moduleId === 'ncaa_mensBasketball_roster' && !team.ncaaSportsConfig?.mensBasketball?.rosterId) {
        return false;
      }
      if (moduleId === 'ncaa_mensBasketball_schedule' && !team.ncaaSportsConfig?.mensBasketball?.sportId) {
        return false;
      }
      if (moduleId === 'ncaa_mensBasketball_stats' && !team.ncaaSportsConfig?.mensBasketball?.sportId) {
        return false;
      }
      if (moduleId === 'ncaa_womensBasketball_roster' && !team.ncaaSportsConfig?.womensBasketball?.rosterId) {
        return false;
      }
      if (moduleId === 'ncaa_womensBasketball_schedule' && !team.ncaaSportsConfig?.womensBasketball?.sportId) {
        return false;
      }
      if (moduleId === 'ncaa_womensBasketball_stats' && !team.ncaaSportsConfig?.womensBasketball?.sportId) {
        return false;
      }
      if (moduleId === 'ncaa_baseball_schedule' && !team.ncaaSportsConfig?.baseball?.sportId) {
        return false;
      }
    }

    return true;
  }

  // Format differences for storage
  formatDifferences(comparison, teamId) {
    const differences = [];

    // Detect if this is a schedule comparison (has .date on items) vs roster (has .player)
    const isSchedule = comparison.discrepancies?.[0]?.date !== undefined ||
                       comparison.missingInScraped?.[0]?.date !== undefined ||
                       comparison.missingInSource?.[0]?.date !== undefined;

    if (isSchedule) {
      // Schedule comparison format
      comparison.missingInScraped?.forEach(item => {
        differences.push({
          matchKey: item.date,
          teamId,
          type: 'missing_in_web',
          oracleValue: item.game,
          webValue: null
        });
      });

      comparison.missingInSource?.forEach(item => {
        differences.push({
          matchKey: item.date,
          teamId,
          type: 'missing_in_oracle',
          oracleValue: null,
          webValue: item.game
        });
      });

      comparison.discrepancies?.forEach(item => {
        item.discrepancies.forEach(disc => {
          differences.push({
            matchKey: item.date,
            teamId,
            type: 'field_mismatch',
            field: disc.field,
            oracleValue: disc.source,
            webValue: disc.scraped,
            broadcaster: disc.broadcaster || null,
            // Include game context for display
            scraped: item.scraped,
            source: item.source,
            mappedFields: item.mappedFields || {}
          });
        });
      });
    } else {
      // Roster comparison format
      comparison.missingInScraped?.forEach(player => {
        differences.push({
          matchKey: player.player,
          teamId,
          type: 'missing_in_web',
          oracleValue: player,
          webValue: null,
          isIgnored: player.isIgnored || false
        });
      });

      comparison.missingInSource?.forEach(player => {
        differences.push({
          matchKey: player.player,
          teamId,
          type: 'missing_in_oracle',
          oracleValue: null,
          webValue: player,
          isIgnored: player.isIgnored || false
        });
      });

      comparison.discrepancies?.forEach(item => {
        item.discrepancies.forEach(disc => {
          differences.push({
            matchKey: item.player,
            teamId,
            type: 'field_mismatch',
            field: disc.field,
            oracleValue: disc.source,
            webValue: disc.scraped,
            mappingApplied: item.mappedFields?.[disc.field] || false
          });
        });
      });
    }

    return differences;
  }

  // Calculate overall summary
  calculateOverallSummary(results) {
    const successful = results.filter(r => r.status === 'success');

    if (successful.length === 0) {
      return {
        totalComparisons: 0,
        averageMatchPercentage: 0,
        totalDiscrepancies: 0,
        totalMissingInScraped: 0,
        totalMissingInSource: 0
      };
    }

    const totalMatchPercentage = successful.reduce((sum, r) => sum + (r.summary?.matchPercentage || 0), 0);
    const totalDiscrepancies = successful.reduce((sum, r) => sum + (r.summary?.matchesWithDiscrepancies || 0), 0);
    const totalMissingInScraped = successful.reduce((sum, r) => sum + (r.summary?.missingInScraped || 0), 0);
    const totalMissingInSource = successful.reduce((sum, r) => sum + (r.summary?.missingInSource || 0), 0);

    return {
      totalComparisons: successful.length,
      averageMatchPercentage: Math.round(totalMatchPercentage / successful.length),
      totalDiscrepancies,
      totalMissingInScraped,
      totalMissingInSource
    };
  }

  // Cancel a job
  async cancelJob(jobId) {
    const controller = this.runningJobs.get(jobId);
    if (controller) {
      controller.abort();
      return { cancelled: true };
    }
    return { cancelled: false, message: 'Job not running' };
  }

  // Get job status
  async getJobStatus(jobId) {
    const job = await ComparisonJob.findOne({ jobId })
      .populate('results.comparisonResultId');
    if (!job) {
      throw new Error('Job not found');
    }
    return job;
  }

  // Get recent jobs
  async getRecentJobs(limit = 10) {
    return await ComparisonJob.find()
      .sort({ createdAt: -1 })
      .limit(limit);
  }
}

module.exports = new BulkComparisonService();
