// backend/services/bulkFetchService.js
const FetchJob = require('../models/FetchJob');
const Team = require('../models/Team');
const crypto = require('crypto');

// Import all modules
const NCAAFootballRosterModule = require('../modules/ncaa-football-roster');
const NCAAFootballScheduleModule = require('../modules/ncaa-football-schedule');
const NCAAFootballStatsModule = require('../modules/ncaa-football-stats');
const NCAABasketballRosterModule = require('../modules/ncaa-basketball-roster');
const NCAABasketballScheduleModule = require('../modules/ncaa-basketball-schedule');
const NCAABasketballStatsModule = require('../modules/ncaa-basketball-stats');
const MLBRosterModule = require('../modules/mlb-roster');
const MLBScheduleFetchModule = require('../modules/mlb-schedule-fetch');
const NBAScheduleFetchModule = require('../modules/nba-schedule-fetch');
const NBABoxscoreFetchModule = require('../modules/nba-boxscore-fetch');
const NCAABaseballScheduleModule = require('../modules/ncaa-baseball-schedule');
const logger = require('../utils/logger');

class BulkFetchService {
  constructor() {
    this.modules = {
      'ncaa_football_roster': new NCAAFootballRosterModule(),
      'ncaa_football_schedule': new NCAAFootballScheduleModule(),
      'ncaa_football_stats': new NCAAFootballStatsModule(),
      'ncaa_mensBasketball_roster': new NCAABasketballRosterModule('mensBasketball'),
      'ncaa_mensBasketball_schedule': new NCAABasketballScheduleModule('mensBasketball'),
      'ncaa_womensBasketball_roster': new NCAABasketballRosterModule('womensBasketball'),
      'ncaa_womensBasketball_schedule': new NCAABasketballScheduleModule('womensBasketball'),
      'ncaa_mensBasketball_stats': new NCAABasketballStatsModule('mensBasketball'),
      'ncaa_womensBasketball_stats': new NCAABasketballStatsModule('womensBasketball'),
      'ncaa_baseball_schedule': new NCAABaseballScheduleModule(),
      'mlb_roster': new MLBRosterModule(),
      'mlb_schedule': new MLBScheduleFetchModule(),
      'nba_schedule': new NBAScheduleFetchModule(),
      'nba_boxscore': new NBABoxscoreFetchModule()
    };

    this.runningJobs = new Map();
  }
  
  // Create a new bulk fetch job
  async createJob(filters) {
    const jobId = crypto.randomBytes(16).toString('hex');

    // Get matching teams
    const teamQuery = {};
    if (filters.league) teamQuery.league = filters.league;
    if (filters.conference) teamQuery.conference = filters.conference;
    if (filters.division) teamQuery.division = filters.division;
    if (filters.teams && filters.teams.length > 0) {
      teamQuery.teamId = { $in: filters.teams };
    }

    const allTeams = await Team.find(teamQuery);

    // Determine which modules to use
    let modulesToRun = filters.modules || [];
    const targetDate = filters.targetDate || null; // Add targetDate support

    // If no modules specified, use all applicable modules for the league
    if (modulesToRun.length === 0) {
      if (filters.league === 'NCAA') {
        modulesToRun = [
          'ncaa_football_roster',
          'ncaa_football_schedule',
          'ncaa_football_stats',
          'ncaa_mensBasketball_roster',
          'ncaa_mensBasketball_schedule',
          'ncaa_womensBasketball_roster',
          'ncaa_womensBasketball_schedule',
          'ncaa_mensBasketball_stats',
          'ncaa_womensBasketball_stats',
          'ncaa_baseball_schedule'
        ];
      } else if (filters.league === 'MLB' || filters.league === 'MILB') {
        modulesToRun = ['mlb_roster', 'mlb_schedule'];
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

    // Get roster types for MLB (default to ['active'] if not specified)
    const rosterTypes = filters.rosterTypes && filters.rosterTypes.length > 0
      ? filters.rosterTypes
      : ['active'];
    const season = filters.season || new Date().getFullYear();

    // Calculate total operations (only counting teams that will actually be processed)
    // For mlb_roster, multiply by number of roster types
    let totalOperations = 0;
    for (const team of teams) {
      for (const moduleId of modulesToRun) {
        if (this.shouldRunModule(team, moduleId)) {
          if (moduleId === 'mlb_roster') {
            // MLB roster will run once per roster type
            totalOperations += rosterTypes.length;
          } else {
            totalOperations++;
          }
        }
      }
    }

    // Estimate time (5 seconds per operation)
    const estimatedSeconds = totalOperations * 5;

    // Create job record
    const job = await FetchJob.create({
      jobId,
      filters: {
        league: filters.league,
        conference: filters.conference,
        division: filters.division,
        teams: filters.teams,
        modules: modulesToRun,
        targetDate: targetDate, // Store targetDate in job filters
        startDate: filters.startDate || null, // Store startDate for date range filtering
        endDate: filters.endDate || null, // Store endDate for date range filtering
        createBaseline: filters.createBaseline || false, // Store createBaseline flag
        forceRefresh: filters.forceRefresh || false, // Store forceRefresh flag
        rosterTypes: rosterTypes, // Store roster types for MLB bulk fetch
        season: season // Store season for MLB bulk fetch
      },
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
      modules: modulesToRun
    };
  }
  
  // Execute a job
  async executeJob(jobId) {
    const job = await FetchJob.findOne({ jobId });
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
      logger.error(`Job ${jobId} failed:`, error);
      job.status = 'failed';
      job.save();
    });
    
    return { started: true, jobId };
  }
  
  // Helper: Retry with exponential backoff
  async retryWithBackoff(fn, maxRetries = 3, baseDelay = 2000) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt); // 2s, 4s, 8s
          logger.debug(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  // Helper: Process single team-module combination with retry
  async processTeamModule(team, moduleId, job, retryQueue, rosterType = null, season = null) {
    const teamName = `${team.teamName} ${team.teamNickname || ''}`;
    const startTime = new Date();
    const targetDate = job.filters.targetDate || null; // Get targetDate from job filters
    const startDate = job.filters.startDate || null; // Get startDate from job filters
    const endDate = job.filters.endDate || null; // Get endDate from job filters
    const createBaseline = job.filters.createBaseline || false; // Get createBaseline flag
    const forceRefresh = job.filters.forceRefresh || false; // Get forceRefresh flag
    // Use passed rosterType/season or fall back to job filters
    const effectiveRosterType = rosterType || job.filters.rosterTypes?.[0] || 'active';
    const effectiveSeason = season || job.filters.season || new Date().getFullYear();

    logger.info(`🔧 processTeamModule: moduleId=${moduleId}, rosterType=${effectiveRosterType}, season=${effectiveSeason}`);

    try {
      const module = this.modules[moduleId];
      if (!module) {
        throw new Error(`Module ${moduleId} not found`);
      }

      // Wrap fetch in retry logic
      const result = await this.retryWithBackoff(async () => {
        if (module.config.dataType === 'roster') {
          // For MLB roster, pass rosterType and season
          if (moduleId === 'mlb_roster') {
            return await module.fetchTeamRoster(team, {
              rosterType: effectiveRosterType,
              season: effectiveSeason,
              createBaseline,
              forceRefresh
            });
          }
          return await module.fetchTeamRoster(team, { createBaseline, forceRefresh });
        } else if (module.config.dataType === 'schedule') {
          // Pass startDate, endDate, createBaseline, and forceRefresh to fetchTeamSchedule
          return await module.fetchTeamSchedule(team, { startDate, endDate, createBaseline, forceRefresh });
        } else if (module.config.dataType === 'stats') {
          // Pass targetDate, startDate, endDate, createBaseline, and forceRefresh to fetchTeamStats
          return await module.fetchTeamStats(team, new Date().getFullYear(), targetDate, { startDate, endDate, createBaseline, forceRefresh });
        }
      });

      // For stats module, extract detailed game results
      let gameResults = null;
      if (moduleId.includes('stats') && result.gameResults) {
        gameResults = result.gameResults;
      }

      // Record success
      const successResult = {
        teamId: team.teamId,
        teamName: teamName,
        module: moduleId,
        status: 'success',
        count: Array.isArray(result) ? result.length : 1,
        startedAt: startTime,
        completedAt: new Date()
      };

      // Add MLB roster-specific info
      if (moduleId === 'mlb_roster') {
        successResult.rosterType = effectiveRosterType;
        successResult.season = effectiveSeason;
      }

      // Add game-level details if available
      if (gameResults) {
        successResult.gamesSucceeded = gameResults.succeeded;
        successResult.gamesFailed = gameResults.failed;
        successResult.gamesTotal = gameResults.total;
      }

      job.results.push(successResult);
      job.progress.completed++;

      return { success: true, result: successResult };

    } catch (error) {
      // After all retries failed, record failure
      const failureResult = {
        teamId: team.teamId,
        teamName: teamName,
        module: moduleId,
        status: 'failed',
        error: error.message,
        startedAt: startTime,
        completedAt: new Date(),
        retriesAttempted: 3
      };

      // Add MLB roster-specific info to failure
      if (moduleId === 'mlb_roster') {
        failureResult.rosterType = effectiveRosterType;
        failureResult.season = effectiveSeason;
      }

      job.results.push(failureResult);
      job.progress.failed++;

      return { success: false, result: failureResult };
    }
  }

  // Helper: Process multiple teams in parallel with concurrency limit
  async processTeamsInParallel(teams, moduleIds, job, signal, concurrency = 10) {
    const retryQueue = []; // Track items that need retry

    // Get roster types for MLB (from job filters)
    const rosterTypes = job.filters.rosterTypes || ['active'];
    const season = job.filters.season || new Date().getFullYear();

    logger.info(`🏷️ processTeamsInParallel: rosterTypes=${JSON.stringify(rosterTypes)}, season=${season}`);

    // Create all tasks (team-module combinations)
    // For mlb_roster, create a task for each roster type
    const tasks = [];
    for (const team of teams) {
      for (const moduleId of moduleIds) {
        if (this.shouldRunModule(team, moduleId)) {
          if (moduleId === 'mlb_roster') {
            // Create a task for each roster type
            for (const rosterType of rosterTypes) {
              tasks.push({ team, moduleId, rosterType, season });
            }
          } else {
            tasks.push({ team, moduleId });
          }
        }
      }
    }

    logger.debug(`Processing ${tasks.length} total operations with concurrency=${concurrency}`);

    // Process tasks in batches of 'concurrency'
    for (let i = 0; i < tasks.length; i += concurrency) {
      // Check if cancelled
      if (signal.aborted) {
        job.status = 'cancelled';
        await job.save();
        return;
      }

      const batch = tasks.slice(i, i + concurrency);
      logger.debug(`Processing batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(tasks.length / concurrency)} (${batch.length} teams)`);

      // Update progress to show current batch
      job.progress.currentTeam = `Batch ${Math.floor(i / concurrency) + 1}: ${batch.map(t => t.team.teamName).join(', ')}`;
      await job.save();

      // Process batch in parallel
      const batchPromises = batch.map(task =>
        this.processTeamModule(task.team, task.moduleId, job, retryQueue, task.rosterType, task.season)
      );

      await Promise.all(batchPromises);

      // Save progress after each batch
      await job.save();
    }
  }

  // Process the job
  async processJob(job, signal) {
    try {
      // Get teams
      const teamQuery = {};
      if (job.filters.league) teamQuery.league = job.filters.league;
      if (job.filters.conference) teamQuery.conference = job.filters.conference;
      if (job.filters.division) teamQuery.division = job.filters.division;
      if (job.filters.teams && job.filters.teams.length > 0) {
        teamQuery.teamId = { $in: job.filters.teams };
      }

      const teams = await Team.find(teamQuery);

      // Process teams in parallel (10 at a time)
      await this.processTeamsInParallel(teams, job.filters.modules, job, signal, 10);

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
  
  // Check if module should run for team
  shouldRunModule(team, moduleId) {
    // NCAA modules only for NCAA teams
    if (moduleId.startsWith('ncaa_') && team.league !== 'NCAA') {
      return false;
    }

    // MLB modules require MLB/MILB league and mlbId to be configured
    if (moduleId === 'mlb_roster' || moduleId === 'mlb_schedule') {
      if (!['MLB', 'MILB'].includes(team.league)) {
        return false;
      }
      if (!team.mlbId) {
        return false;
      }
    }

    // NBA modules only for NBA teams with nbaTeamId configured
    if (moduleId.startsWith('nba_')) {
      if (team.league !== 'NBA') {
        return false;
      }
      if (!team.nbaTeamId) {
        return false;
      }
    }

    // Check if team has required config for NCAA modules
    if (team.league === 'NCAA') {
      if (moduleId === 'ncaa_football_roster' && !team.ncaaSportsConfig?.football?.rosterId) {
        return false;
      }
      if (moduleId === 'ncaa_football_schedule' && !team.ncaaSportsConfig?.football?.sportId) {
        return false;
      }
      if (moduleId === 'ncaa_football_stats' && !team.ncaaSportsConfig?.football?.scheduleId) {
        return false;
      }
      if (moduleId === 'ncaa_mensBasketball_roster' && !team.ncaaSportsConfig?.mensBasketball?.rosterId) {
        return false;
      }
      if (moduleId === 'ncaa_mensBasketball_schedule' && !team.ncaaSportsConfig?.mensBasketball?.sportId) {
        return false;
      }
      if (moduleId === 'ncaa_womensBasketball_roster' && !team.ncaaSportsConfig?.womensBasketball?.rosterId) {
        return false;
      }
      if (moduleId === 'ncaa_womensBasketball_schedule' && !team.ncaaSportsConfig?.womensBasketball?.sportId) {
        return false;
      }
      if (moduleId === 'ncaa_mensBasketball_stats' && !team.ncaaSportsConfig?.mensBasketball?.sportId) {
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
    const job = await FetchJob.findOne({ jobId });
    if (!job) {
      throw new Error('Job not found');
    }
    return job;
  }
  
  // Get recent jobs
  async getRecentJobs(limit = 10) {
    return await FetchJob.find()
      .sort({ createdAt: -1 })
      .limit(limit);
  }
}

module.exports = new BulkFetchService();