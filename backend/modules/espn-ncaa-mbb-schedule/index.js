// backend/modules/espn-ncaa-mbb-schedule/index.js
// ESPN Team Schedule API module for NCAA Men's Basketball Schedule
const BaseModule = require('../BaseModule');
const axios = require('axios');
const logger = require('../../utils/logger');
const Team = require('../../models/Team');
const ScrapedData = require('../../models/ScrapedData');

class ESPNNCAAMBBScheduleModule extends BaseModule {
  constructor() {
    super({
      id: 'espn_ncaa_mbb_schedule',
      name: 'ESPN NCAA MBB Schedule',
      league: 'NCAA',
      sport: 'mensBasketball',
      dataType: 'schedule',
      validation: {
        requiredFields: ['espnGameId', 'gameDate', 'homeTeam', 'awayTeam'],
      },
      cacheHours: 6 // ESPN data refreshes frequently
    });

    // Team-specific schedule endpoint (for single-team fetch)
    this.ESPN_TEAM_SCHEDULE_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams';
    // Scoreboard endpoint (for bulk fetch by week)
    this.ESPN_SCOREBOARD_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';
    this.REQUEST_DELAY_MS = 500; // Delay between requests
  }

  // Generate unique key for matching - use ESPN game ID
  generateMatchKey(record) {
    return `ESPN_MBB_${record.espnGameId}`;
  }

  /**
   * Convert UTC date to CST (Central Standard Time)
   * CST is UTC-6, CDT is UTC-5
   */
  convertToCST(utcDateString) {
    if (!utcDateString) return null;

    const utcDate = new Date(utcDateString);

    // Use Intl to get the correct offset (handles DST automatically)
    const cstOptions = { timeZone: 'America/Chicago' };
    const cstDateStr = utcDate.toLocaleDateString('en-CA', cstOptions); // en-CA gives YYYY-MM-DD format

    // 12-hour format (e.g., "7:00 PM")
    const cstTimeStr = utcDate.toLocaleTimeString('en-US', {
      ...cstOptions,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // 24-hour format (e.g., "19:00") - for comparison matching
    const cstTime24 = utcDate.toLocaleTimeString('en-GB', {
      ...cstOptions,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    return {
      date: cstDateStr,  // YYYY-MM-DD in CST
      time: cstTimeStr,  // h:mm AM/PM in CST
      time24: cstTime24  // HH:mm in CST (24-hour)
    };
  }

  /**
   * Transform ESPN team schedule event to our standard schema
   * This uses the richer team schedule endpoint data structure
   */
  transformTeamScheduleEvent(event, requestingTeamEspnId) {
    // Get the first competition (main game data)
    const competition = event.competitions?.[0];
    if (!competition) {
      logger.warn(`⚠️ Event ${event.id} has no competition data`);
      return null;
    }

    const homeCompetitor = competition.competitors?.find(c => c.homeAway === 'home');
    const awayCompetitor = competition.competitors?.find(c => c.homeAway === 'away');

    if (!homeCompetitor || !awayCompetitor) {
      logger.warn(`⚠️ Game ${event.id} missing home/away competitor`);
      return null;
    }

    // Parse date - handle timeValid flag
    // When timeValid is false, ESPN uses a placeholder time (like 05:00Z) just to set the date
    // In this case, extract the date directly from UTC and show TBA for time
    let gameDate, gameTime, gameTime24;

    if (event.timeValid === false) {
      // Time is not valid - extract date directly from UTC (ESPN has set the correct date)
      // The UTC date string like "2026-01-11T05:00Z" - just take the date part
      gameDate = event.date ? event.date.split('T')[0] : null;
      gameTime = 'TBA';
      gameTime24 = null; // No valid time for comparison
    } else {
      // Time is valid - convert from UTC to CST
      const cstDateTime = this.convertToCST(event.date);
      gameDate = cstDateTime?.date || null;
      gameTime = cstDateTime?.time || null;
      gameTime24 = cstDateTime?.time24 || null;
    }

    // Extract broadcasts - get all TV channels
    const broadcasts = competition.broadcasts || [];
    const tvChannels = broadcasts
      .map(b => b.media?.shortName || b.media?.name)
      .filter(Boolean);

    // Extract venue info
    const venue = competition.venue;
    const venueFullName = venue?.fullName || null;
    const venueCity = venue?.address?.city || null;
    const venueState = venue?.address?.state || null;
    const venueLocation = venueCity && venueState ? `${venueCity}, ${venueState}` : (venueCity || venueState || null);

    // Neutral site flag
    const neutralSite = competition.neutralSite === true;

    // Determine if this is a conference game
    // Check if both teams are in the same conference group
    const homeConferenceId = homeCompetitor.team?.conferenceId;
    const awayConferenceId = awayCompetitor.team?.conferenceId;
    const isConferenceGame = homeConferenceId && awayConferenceId && homeConferenceId === awayConferenceId;

    // Determine home/away from requesting team's perspective
    const isHome = homeCompetitor.team?.id === requestingTeamEspnId;
    const isAway = !isHome;

    // Extract status time from status detail
    const statusDetail = competition.status?.type?.shortDetail || '';
    const timeParts = statusDetail.split(' - ');
    const statusTime = timeParts.length > 1 ? timeParts[1] : statusDetail;

    // Build opponent info based on requesting team perspective
    const opponentTeam = isHome ? awayCompetitor : homeCompetitor;
    const teamCompetitor = isHome ? homeCompetitor : awayCompetitor;

    // Build result string for completed games
    const gameCompleted = competition.status?.type?.completed === true;
    const teamScore = teamCompetitor.score?.displayValue;
    const opponentScore = opponentTeam.score?.displayValue;
    let result = null;
    let resultStatus = null;
    if (gameCompleted && teamScore && opponentScore) {
      const teamWon = parseInt(teamScore) > parseInt(opponentScore);
      resultStatus = teamWon ? 'W' : 'L';
      result = `${resultStatus} ${teamScore}-${opponentScore}`;
    }

    // Determine location indicator
    let locationIndicator;
    if (neutralSite) {
      locationIndicator = 'N';
    } else {
      locationIndicator = isHome ? 'H' : 'A';
    }

    // TV as string for display
    const tvString = tvChannels.length > 0 ? tvChannels.join(', ') : null;

    return {
      // ESPN identifiers
      espnGameId: event.id,

      // Date/Time (all converted to CST)
      // Use gameDate for both 'date' and 'gameDate' so ScheduleTable can find it
      date: gameDate, // YYYY-MM-DD in CST (for ScheduleTable display)
      gameDate: gameDate, // YYYY-MM-DD in CST (for comparison matching)
      dateUTC: event.date, // Full ISO timestamp (UTC) - preserved for reference
      time: gameTime || statusTime, // Time in CST (h:mm AM/PM)
      time24: gameTime24, // Time in 24-hour format (HH:mm) for comparison
      timeCST: gameTime, // Explicit CST time
      statusTime: statusTime, // Original status time
      timeValid: event.timeValid,

      // Location info
      neutralSite: neutralSite,
      isNeutral: neutralSite, // Alias for ScheduleTable
      venue: venueFullName,
      venueCity: venueCity,
      venueState: venueState,
      location: venueLocation,

      // Flat opponent fields for ScheduleTable display
      opponent: opponentTeam.team?.shortDisplayName || opponentTeam.team?.displayName,
      opponentAbbrev: opponentTeam.team?.abbreviation,
      opponentFullName: opponentTeam.team?.displayName,

      // Home/Away indicators for ScheduleTable
      isHome: isHome,
      isAway: isAway,
      locationIndicator: locationIndicator,
      neutralHometeam: neutralSite ? isHome : undefined, // For neutral games

      // Result for completed games
      result: result,
      resultStatus: resultStatus,

      // Status - 'A' for active/upcoming, 'F' for final (ScheduleTable checks status === 'A')
      status: gameCompleted ? 'F' : 'A',
      statusState: competition.status?.type?.state, // pre, in, post
      statusDescription: competition.status?.type?.description,
      completed: gameCompleted,

      // Teams - using the richer team schedule data structure (for comparison)
      homeTeam: {
        espnId: homeCompetitor.team?.id,
        name: homeCompetitor.team?.displayName, // Full name "Illinois Fighting Illini"
        shortName: homeCompetitor.team?.shortDisplayName, // "Illinois"
        nickname: homeCompetitor.team?.nickname, // "Illinois" (location-based)
        location: homeCompetitor.team?.location, // "Illinois"
        abbreviation: homeCompetitor.team?.abbreviation, // "ILL"
        isWinner: homeCompetitor.winner,
        score: homeCompetitor.score?.displayValue
      },
      awayTeam: {
        espnId: awayCompetitor.team?.id,
        name: awayCompetitor.team?.displayName,
        shortName: awayCompetitor.team?.shortDisplayName,
        nickname: awayCompetitor.team?.nickname,
        location: awayCompetitor.team?.location,
        abbreviation: awayCompetitor.team?.abbreviation,
        isWinner: awayCompetitor.winner,
        score: awayCompetitor.score?.displayValue
      },

      // Game info
      displayName: event.name,
      shortName: event.shortName,
      isConferenceGame: isConferenceGame,

      // TV/Broadcast - string for display, array preserved for comparison
      tv: tvString,
      tvArray: tvChannels,
      broadcasts: broadcasts.map(b => ({
        type: b.type?.shortName, // "TV"
        market: b.market?.type, // "National"
        mediaName: b.media?.shortName || b.media?.name
      })),

      // League info
      league: 'NCAA',
      sport: 'mensBasketball',

      // Requesting team perspective (for single-team fetches)
      _requestingTeamEspnId: requestingTeamEspnId,
      _isHome: isHome
    };
  }

  /**
   * Transform ESPN scoreboard event to our standard schema
   * This is used for bulk fetch - saves game for BOTH teams (home and away perspectives)
   * Returns an array of transformed games (one for each team in our database)
   */
  transformScoreboardEvent(event, espnTeamMap) {
    const competition = event.competitions?.[0];
    if (!competition) {
      logger.warn(`⚠️ Event ${event.id} has no competition data`);
      return [];
    }

    const homeCompetitor = competition.competitors?.find(c => c.homeAway === 'home');
    const awayCompetitor = competition.competitors?.find(c => c.homeAway === 'away');

    if (!homeCompetitor || !awayCompetitor) {
      logger.warn(`⚠️ Game ${event.id} missing home/away competitor`);
      return [];
    }

    // Check if either team is in our database
    const homeTeamInfo = espnTeamMap.get(homeCompetitor.team?.id);
    const awayTeamInfo = espnTeamMap.get(awayCompetitor.team?.id);

    // If neither team is in our database, skip this game
    if (!homeTeamInfo && !awayTeamInfo) {
      return [];
    }

    const results = [];

    // Build the game data once, then create perspective-specific versions
    // Parse date - handle timeValid flag from competition level
    const timeValid = competition.timeValid !== false;
    let gameDate, gameTime, gameTime24;

    if (!timeValid) {
      gameDate = event.date ? event.date.split('T')[0] : null;
      gameTime = 'TBA';
      gameTime24 = null;
    } else {
      const cstDateTime = this.convertToCST(event.date);
      gameDate = cstDateTime?.date || null;
      gameTime = cstDateTime?.time || null;
      gameTime24 = cstDateTime?.time24 || null;
    }

    // Extract broadcasts
    const broadcasts = competition.broadcasts || [];
    const tvChannels = broadcasts
      .flatMap(b => b.names || [b.media?.shortName || b.media?.name])
      .filter(Boolean);
    const tvString = tvChannels.length > 0 ? tvChannels.join(', ') : null;

    // Extract venue info
    const venue = competition.venue;
    const venueFullName = venue?.fullName || null;
    const venueCity = venue?.address?.city || null;
    const venueState = venue?.address?.state || null;
    const venueLocation = venueCity && venueState ? `${venueCity}, ${venueState}` : (venueCity || venueState || null);

    // Neutral site and conference game
    const neutralSite = competition.neutralSite === true;
    const homeConferenceId = homeCompetitor.team?.conferenceId;
    const awayConferenceId = awayCompetitor.team?.conferenceId;
    const isConferenceGame = homeConferenceId && awayConferenceId && homeConferenceId === awayConferenceId;

    // Game completion status
    const gameCompleted = competition.status?.type?.completed === true;
    const statusDetail = competition.status?.type?.shortDetail || '';

    // Helper to build game from a team's perspective
    const buildGameForTeam = (teamInfo, isHome) => {
      const teamCompetitor = isHome ? homeCompetitor : awayCompetitor;
      const opponentCompetitor = isHome ? awayCompetitor : homeCompetitor;

      // Build result for completed games
      const teamScore = teamCompetitor.score;
      const opponentScore = opponentCompetitor.score;
      let result = null;
      let resultStatus = null;
      if (gameCompleted && teamScore && opponentScore) {
        const teamWon = parseInt(teamScore) > parseInt(opponentScore);
        resultStatus = teamWon ? 'W' : 'L';
        result = `${resultStatus} ${teamScore}-${opponentScore}`;
      }

      // Location indicator
      let locationIndicator;
      if (neutralSite) {
        locationIndicator = 'N';
      } else {
        locationIndicator = isHome ? 'H' : 'A';
      }

      return {
        // ESPN identifiers
        espnGameId: event.id,

        // Date/Time (all converted to CST)
        date: gameDate,
        gameDate: gameDate,
        dateUTC: event.date,
        time: gameTime || statusDetail,
        time24: gameTime24,
        timeCST: gameTime,
        timeValid: timeValid,

        // Location info
        neutralSite: neutralSite,
        isNeutral: neutralSite,
        venue: venueFullName,
        venueCity: venueCity,
        venueState: venueState,
        location: venueLocation,

        // Opponent fields for ScheduleTable display
        opponent: opponentCompetitor.team?.shortDisplayName || opponentCompetitor.team?.displayName,
        opponentAbbrev: opponentCompetitor.team?.abbreviation,
        opponentFullName: opponentCompetitor.team?.displayName,

        // Home/Away indicators
        isHome: isHome,
        isAway: !isHome,
        locationIndicator: locationIndicator,
        neutralHometeam: neutralSite ? isHome : undefined,

        // Result for completed games
        result: result,
        resultStatus: resultStatus,

        // Status
        status: gameCompleted ? 'F' : 'A',
        statusState: competition.status?.type?.state,
        statusDescription: competition.status?.type?.description,
        completed: gameCompleted,

        // Teams (for comparison)
        homeTeam: {
          espnId: homeCompetitor.team?.id,
          name: homeCompetitor.team?.displayName,
          shortName: homeCompetitor.team?.shortDisplayName,
          location: homeCompetitor.team?.location,
          abbreviation: homeCompetitor.team?.abbreviation,
          isWinner: homeCompetitor.winner,
          score: homeCompetitor.score
        },
        awayTeam: {
          espnId: awayCompetitor.team?.id,
          name: awayCompetitor.team?.displayName,
          shortName: awayCompetitor.team?.shortDisplayName,
          location: awayCompetitor.team?.location,
          abbreviation: awayCompetitor.team?.abbreviation,
          isWinner: awayCompetitor.winner,
          score: awayCompetitor.score
        },

        // Game info
        displayName: event.name,
        shortName: event.shortName,
        isConferenceGame: isConferenceGame,

        // TV/Broadcast
        tv: tvString,
        tvArray: tvChannels,

        // League info
        league: 'NCAA',
        sport: 'mensBasketball',

        // Meta
        _teamId: teamInfo.teamId,
        _isHome: isHome
      };
    };

    // Create game records for teams that exist in our database
    if (homeTeamInfo) {
      results.push({
        teamInfo: homeTeamInfo,
        game: buildGameForTeam(homeTeamInfo, true)
      });
    }

    if (awayTeamInfo) {
      results.push({
        teamInfo: awayTeamInfo,
        game: buildGameForTeam(awayTeamInfo, false)
      });
    }

    return results;
  }

  /**
   * Fetch all games for a specific week from the scoreboard
   */
  async fetchWeekScoreboard(week, options = {}) {
    const url = `${this.ESPN_SCOREBOARD_BASE}?week=${week}&limit=1000`;

    logger.info(`🏀 Fetching ESPN scoreboard for week ${week}`);
    logger.debug(`  URL: ${url}`);

    try {
      const response = await axios.get(url, {
        timeout: 60000, // Longer timeout for bulk data
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });

      const data = response.data;
      const events = data.events || [];
      const season = data.season || {};

      logger.info(`  Found ${events.length} games for week ${week}`);

      return {
        success: true,
        week: week,
        season: season,
        events: events,
        eventsCount: events.length
      };

    } catch (error) {
      logger.error(`Error fetching ESPN scoreboard for week ${week}:`, error.message);
      throw error;
    }
  }

  /**
   * Bulk fetch by weeks - fetches all games for a range of weeks
   * Uses the scoreboard endpoint which is more efficient than per-team fetching
   */
  async fetchByWeeks(options = {}) {
    const { startWeek = 1, endWeek = 20, createBaseline = false } = options;

    logger.info(`🏀 ESPN NCAA MBB Bulk Fetch: Weeks ${startWeek} to ${endWeek}`);

    // Build ESPN team ID map
    const espnTeamMap = await this.buildEspnTeamMap();
    if (espnTeamMap.size === 0) {
      throw new Error('No teams with ESPN IDs found in database');
    }
    logger.info(`  Found ${espnTeamMap.size} teams with ESPN IDs`);

    // Clear existing ESPN data before bulk fetch
    logger.info(`🗑️ Clearing existing ESPN NCAA MBB schedule data...`);
    const deleteResult = await ScrapedData.deleteMany({
      moduleId: this.config.id
    });
    logger.info(`  Deleted ${deleteResult.deletedCount} existing records`);

    const results = {
      success: true,
      weeksProcessed: 0,
      weeksFailed: 0,
      totalEventsFound: 0,
      totalGamesMatched: 0,
      totalGamesSaved: 0,
      errors: []
    };

    // Track saved games to avoid duplicates (same game for same team)
    const savedGameKeys = new Set();

    for (let week = startWeek; week <= endWeek; week++) {
      try {
        const weekResult = await this.fetchWeekScoreboard(week);
        results.weeksProcessed++;
        results.totalEventsFound += weekResult.eventsCount;

        // Transform and save games for each event
        for (const event of weekResult.events) {
          const gameRecords = this.transformScoreboardEvent(event, espnTeamMap);

          for (const { teamInfo, game } of gameRecords) {
            // Create unique key to avoid duplicate saves
            const gameKey = `${teamInfo.teamId}_${game.espnGameId}`;
            if (savedGameKeys.has(gameKey)) {
              continue;
            }

            try {
              await this.saveTransformedData(
                teamInfo.teamId,
                game,
                {
                  url: `${this.ESPN_SCOREBOARD_BASE}?week=${week}`,
                  name: 'ESPN Scoreboard API'
                },
                { createBaseline }
              );
              savedGameKeys.add(gameKey);
              results.totalGamesSaved++;
              results.totalGamesMatched++;
            } catch (saveError) {
              logger.warn(`⚠️ Failed to save game ${game.espnGameId} for ${teamInfo.teamId}: ${saveError.message}`);
            }
          }
        }

        logger.info(`  Week ${week}: ${weekResult.eventsCount} events, ${results.totalGamesSaved} games saved so far`);

        // Rate limiting between weeks
        await this.sleep(this.REQUEST_DELAY_MS);

      } catch (error) {
        results.weeksFailed++;
        results.errors.push({ week, error: error.message });
        logger.warn(`⚠️ Failed to fetch week ${week}: ${error.message}`);
      }
    }

    logger.info(`✅ ESPN bulk fetch complete: ${results.weeksProcessed} weeks, ${results.totalGamesSaved} games saved`);

    return results;
  }

  /**
   * Sleep helper for rate limiting
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Fetch schedule for a specific team by ESPN ID
   */
  async fetchTeamSchedule(espnTeamId, options = {}) {
    const { createBaseline = false } = options;

    const url = `${this.ESPN_TEAM_SCHEDULE_BASE}/${espnTeamId}/schedule`;

    logger.info(`🏀 Fetching ESPN schedule for team ${espnTeamId}`);
    logger.debug(`  URL: ${url}`);

    try {
      const response = await axios.get(url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });

      const data = response.data;
      const events = data.events || [];
      const teamInfo = data.team || {};

      logger.info(`  Found ${events.length} games for ${teamInfo.displayName || espnTeamId}`);

      // Transform all events
      const transformedGames = [];
      for (const event of events) {
        const transformed = this.transformTeamScheduleEvent(event, espnTeamId);
        if (transformed) {
          transformedGames.push(transformed);
        }
      }

      return {
        success: true,
        teamInfo: {
          espnId: teamInfo.id,
          name: teamInfo.displayName,
          abbreviation: teamInfo.abbreviation,
          location: teamInfo.location
        },
        games: transformedGames,
        gamesCount: transformedGames.length
      };

    } catch (error) {
      logger.error(`Error fetching ESPN schedule for team ${espnTeamId}:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch and save schedule for a single team
   * This is the primary method for single-team fetching
   */
  async fetchForTeam(teamId, options = {}) {
    const { createBaseline = false } = options;

    // Get the team to find their ESPN ID
    const team = await Team.findOne({ teamId });
    if (!team) {
      throw new Error(`Team not found: ${teamId}`);
    }

    if (!team.espnId) {
      throw new Error(`Team ${teamId} does not have an ESPN ID configured`);
    }

    logger.info(`🏀 ESPN Schedule fetch for ${team.teamName} (ESPN ID: ${team.espnId})`);

    // Fetch from ESPN
    const result = await this.fetchTeamSchedule(team.espnId, { createBaseline });

    // Delete existing ESPN schedule data for this team
    const deleteResult = await ScrapedData.deleteMany({
      moduleId: this.config.id,
      teamId: teamId
    });
    logger.debug(`  Deleted ${deleteResult.deletedCount} existing records for ${teamId}`);

    // Save all games
    const savedGames = [];
    for (const game of result.games) {
      try {
        const saved = await this.saveTransformedData(
          teamId,
          game,
          {
            url: `${this.ESPN_TEAM_SCHEDULE_BASE}/${team.espnId}/schedule`,
            name: 'ESPN Team Schedule API'
          },
          { createBaseline }
        );
        savedGames.push(saved);
      } catch (error) {
        logger.warn(`⚠️ Failed to save game ${game.espnGameId}: ${error.message}`);
      }
    }

    logger.info(`💾 Saved ${savedGames.length} games for ${team.teamName}`);

    // Return savedGames (MongoDB documents with .data property) like other modules do
    return savedGames;
  }

  /**
   * Bulk fetch - fetches schedules for all teams with ESPN IDs
   * Replaces the date-range based fetchSchedule method
   */
  async fetchSchedule(options = {}) {
    const { createBaseline = false, teamIds = null } = options;

    // Get all teams with ESPN IDs (or specific teams if provided)
    const query = {
      league: 'NCAA',
      espnId: { $exists: true, $ne: null, $ne: '' }
    };

    if (teamIds && teamIds.length > 0) {
      query.teamId = { $in: teamIds };
    }

    const teams = await Team.find(query);

    if (teams.length === 0) {
      throw new Error('No teams with ESPN IDs found');
    }

    logger.info(`🏀 ESPN NCAA MBB Schedule: Fetching for ${teams.length} teams`);

    // Clear existing ESPN data if doing a full fetch
    if (!teamIds) {
      logger.info(`🗑️ Clearing existing ESPN NCAA MBB schedule data...`);
      const deleteResult = await ScrapedData.deleteMany({
        moduleId: this.config.id
      });
      logger.info(`  Deleted ${deleteResult.deletedCount} existing records`);
    }

    const results = {
      success: true,
      teamsProcessed: 0,
      teamsFailed: 0,
      totalGamesFound: 0,
      totalGamesSaved: 0,
      errors: []
    };

    for (const team of teams) {
      try {
        const result = await this.fetchForTeam(team.teamId, { createBaseline });
        results.teamsProcessed++;
        results.totalGamesFound += result.gamesFound;
        results.totalGamesSaved += result.gamesSaved;

        // Progress logging
        if (results.teamsProcessed % 10 === 0) {
          logger.info(`  Processed ${results.teamsProcessed}/${teams.length} teams`);
        }

        // Rate limiting
        await this.sleep(this.REQUEST_DELAY_MS);

      } catch (error) {
        results.teamsFailed++;
        results.errors.push({ teamId: team.teamId, error: error.message });
        logger.warn(`⚠️ Failed to fetch for ${team.teamId}: ${error.message}`);
      }
    }

    logger.info(`✅ ESPN fetch complete: ${results.teamsProcessed} teams, ${results.totalGamesSaved} games saved`);

    return results;
  }

  /**
   * Get games for a specific team by their ESPN ID
   * Useful for comparisons
   */
  async getTeamGames(espnTeamId, options = {}) {
    const { startDate, endDate } = options;

    const query = {
      moduleId: this.config.id,
      $or: [
        { 'data.homeTeam.espnId': espnTeamId },
        { 'data.awayTeam.espnId': espnTeamId }
      ]
    };

    // Add date filters if provided
    if (startDate || endDate) {
      query['data.gameDate'] = {};
      if (startDate) query['data.gameDate'].$gte = startDate;
      if (endDate) query['data.gameDate'].$lte = endDate;
    }

    const games = await ScrapedData.find(query).sort({ 'data.gameDate': 1 });

    // Transform to include perspective (home/away/opponent)
    return games.map(g => {
      const data = g.data;
      const isHome = data.homeTeam?.espnId === espnTeamId;

      return {
        ...data,
        teamPerspective: {
          isHome,
          team: isHome ? data.homeTeam : data.awayTeam,
          opponent: isHome ? data.awayTeam : data.homeTeam,
          locationIndicator: data.neutralSite ? 'N' : (isHome ? 'H' : 'A')
        },
        matchKey: g.matchKey,
        _id: g._id
      };
    });
  }

  /**
   * Build ESPN team ID lookup map from your Team collection
   * Maps ESPN IDs to your team data
   */
  async buildEspnTeamMap() {
    const teams = await Team.find({
      league: 'NCAA',
      espnId: { $exists: true, $ne: null, $ne: '' }
    });

    const map = new Map();
    for (const team of teams) {
      map.set(team.espnId, {
        teamId: team.teamId,
        teamName: team.teamName,
        oracleTeamId: team.ncaaSportsConfig?.mensBasketball?.oracleTeamId,
        espnId: team.espnId
      });
    }

    logger.debug(`📍 Built ESPN team map with ${map.size} teams`);
    return map;
  }
}

module.exports = ESPNNCAAMBBScheduleModule;
