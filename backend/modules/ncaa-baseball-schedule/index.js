// backend/modules/ncaa-baseball-schedule/index.js
// UNIFIED VERSION using adaptive_components endpoint for both NEW and OLD Sidearm
const BaseModule = require('../BaseModule');
const axios = require('axios');
const { retryWithBackoff, UserAgentRotator, getAxiosConfig } = require('../../utils/httpUtils');
const logger = require('../../utils/logger');

class NCAABaseballScheduleModule extends BaseModule {
  constructor() {
    super({
      id: 'ncaa_baseball_schedule',
      name: 'NCAA Baseball Schedule',
      league: 'NCAA',
      sport: 'baseball',
      dataType: 'schedule',

      validation: {
        requiredFields: ['gameId', 'date', 'opponent'],
      },

      cacheHours: 12
    });

    // Initialize user-agent rotator for better bot detection avoidance
    this.userAgentRotator = new UserAgentRotator();
  }

  // Generate unique key for matching
  generateMatchKey(record) {
    // Use date and teams for unique game identification
    const gameDate = record.date.split('T')[0];
    const teams = [record.teamId, record.opponentId || record.opponent].sort().join('_');
    return `${gameDate}_${teams}`.toUpperCase();
  }

  // Transform adaptive_components schedule data to our schema
  transformScheduleData(eventsData, teamId) {
    if (!Array.isArray(eventsData)) {
      logger.warn('Events data is not an array:', typeof eventsData);
      return [];
    }

    return eventsData.map(event => {
      // Parse date from ISO format to just the date part
      const gameDate = event.date ? event.date.split('T')[0] : null;

      // Determine result if game is completed
      let result = null;
      if (event.result && event.result.status && event.result.team_score !== null) {
        const status = event.result.status; // 'W' or 'L'
        result = `${status} ${event.result.team_score}-${event.result.opponent_score}`;
      }

      return {
        gameId: event.id,
        date: event.date, // Full ISO timestamp
        gameDate: gameDate, // Just the date part (YYYY-MM-DD)
        time: event.time,
        opponent: event.opponent?.name || 'Unknown',
        opponentId: event.opponent?.id,
        isHome: event.location_indicator === 'H',
        isAway: event.location_indicator === 'A',
        isNeutral: event.location_indicator === 'N',
        locationIndicator: event.location_indicator, // 'H', 'A', or 'N'
        neutralHometeam: event.neutral_hometeam,
        location: event.location,
        venue: event.game_facility?.title,
        venueId: event.game_facility?.id,

        // Result info (null for upcoming games)
        status: event.status, // 'A' = upcoming, 'O' = completed
        result: result, // e.g., "W 8-3" or "L 2-5"
        resultStatus: event.result?.status, // 'W' or 'L'
        teamScore: event.result?.team_score,
        opponentScore: event.result?.opponent_score,

        // Conference info
        conference: event.conference,
        conferenceAbbrev: event.conference_abbrev,
        isConferenceGame: event.is_conference,

        // Tournament info (conference tournaments, regionals, CWS, etc.)
        tournament: event.tournament,

        // Media info
        tv: event.media?.tv,
        tvImage: event.media?.tv_image,
        audio: event.media?.audio,
        video: event.media?.video,
        tickets: event.pac_tickets?.ticketLink || event.media?.tickets,

        // Promotion info
        promotion: event.promotion?.name,
        promotionImage: event.promotion?.image,

        // Boxscore ID (useful for fetching stats later)
        bid: event.result?.bid,

        // Additional metadata
        teamId: teamId,
        sport: 'baseball',
        sportId: event.sport?.id,
        scheduleId: event.schedule?.id,
        scheduleTitle: event.schedule?.title,

        // Legacy fields for backward compatibility
        firstPitchTime: event.time,
        network: event.media?.tv,
        notes: event.notes
      };
    });
  }

  // Fetch schedule for a specific team
  async fetchTeamSchedule(team, options = {}) {
    try {
      // Validate team data
      if (!team) {
        throw new Error('Team object is required');
      }

      if (!team.baseUrl) {
        throw new Error(`Team ${team.teamId} missing baseUrl`);
      }

      // Check if team has baseball sport ID
      const sportConfig = team.ncaaSportsConfig?.baseball;
      if (!sportConfig?.sportId) {
        throw new Error(`Team ${team.teamId} missing baseball sport ID. Run auto-populate first.`);
      }

      const sportId = sportConfig.sportId;

      // Ensure baseUrl has protocol
      let baseUrl = team.baseUrl;
      if (!baseUrl.startsWith('http')) {
        baseUrl = `https://${baseUrl}`;
      }

      // Check cache first (unless forceRefresh is enabled)
      const { forceRefresh = false } = options;
      if (!forceRefresh) {
        const cachedData = await this.getCachedData(team.teamId);
        if (cachedData && cachedData.length > 0) {
          logger.debug(`Returning ${cachedData.length} games from cache`);
          return cachedData;
        }
      } else {
        logger.debug(`Force refresh enabled - bypassing cache`);
      }

      // Use unified adaptive_components endpoint (works for both OLD and NEW Sidearm)
      // Baseball has 50-60+ games per season, so use count=100 to capture full season
      const scheduleUrl = `${baseUrl}/services/adaptive_components.ashx?type=events&count=100&sport_id=${sportId}`;
      logger.debug(`Fetching baseball schedule from unified endpoint: ${scheduleUrl}`);

      // Fetch with retry logic and rotated user agents
      const response = await retryWithBackoff(async () => {
        return await axios.get(scheduleUrl, {
          timeout: 30000, // 30s timeout
          family: 4, // Force IPv4
          headers: {
            'User-Agent': this.userAgentRotator.getNext(),
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Referer': `${baseUrl}/sports/baseball/schedule`
          }
        });
      }, `${team.teamName} baseball schedule fetch`, 3, 5000);

      // Transform the schedule data
      const games = this.transformScheduleData(response.data, team.teamId);
      logger.debug(`Found ${games.length} baseball games for ${team.teamName}`);

      // Debug: Show breakdown of upcoming vs completed games
      const upcomingGames = games.filter(g => g.status === 'A');
      const completedGames = games.filter(g => g.status === 'O');
      logger.debug(`  - ${upcomingGames.length} upcoming games`);
      logger.debug(`  - ${completedGames.length} completed games`);

      // Save each game
      const savedGames = [];
      for (const game of games) {
        const gameWithTeamInfo = {
          ...game,
          teamId: team.teamId,
          teamName: team.teamName
        };

        const saved = await this.saveTransformedData(
          team.teamId,
          gameWithTeamInfo,
          { url: scheduleUrl, name: 'Sidearm adaptive_components' },
          options
        );
        savedGames.push(saved);
      }

      return savedGames;

    } catch (error) {
      logger.error(`Error fetching baseball schedule for ${team.teamName || team.teamId}:`, error.message);

      // Error handling
      if (error.code === 'ECONNREFUSED') {
        throw new Error(`Cannot connect to ${team.baseUrl}. Server may be down.`);
      } else if (error.code === 'ECONNRESET') {
        throw new Error(`Connection reset by ${team.baseUrl}. May need better headers or rate limiting.`);
      } else if (error.response?.status === 404) {
        throw new Error(`Schedule not found. Sport ID ${team.ncaaSportsConfig?.baseball?.sportId} may be incorrect.`);
      } else if (error.response?.status === 403) {
        throw new Error(`Access forbidden to ${team.baseUrl}. The site may be blocking automated requests.`);
      }

      throw error;
    }
  }
}

module.exports = NCAABaseballScheduleModule;
