// backend/modules/ncaa-football-roster/index.js
// MINIMAL FIX - Only adds OLD Sidearm support without changing NEW Sidearm logic
const BaseModule = require('../BaseModule');
const axios = require('axios');
const ScrapedData = require('../../models/ScrapedData');
const logger = require('../../utils/logger');

class NCAAFootballRosterModule extends BaseModule {
  constructor() {
    super({
      id: 'ncaa_football_roster',
      name: 'NCAA Football Roster',
      league: 'NCAA',
      sport: 'football', 
      dataType: 'roster',
      
      validation: {
        requiredFields: ['firstName', 'lastName'],
      },

      cacheHours: 2 // Match stats cache duration
    });
  }
  
  // Generate unique key for matching
  generateMatchKey(record) {
    // Use playerId as the primary identifier - it's unique and consistent
    const playerId = record.playerId || record.rosterPlayerId;
    if (!playerId) {
      // Fallback if no player ID (shouldn't happen with Sidearm data)
      const name = `${record.firstName}_${record.lastName}`.toUpperCase().replace(/\s+/g, '_');
      return `${record.teamId}_FOOTBALL_${name}`;
    }
    // Simple and consistent: teamId + sport + playerId
    return `${record.teamId}_FOOTBALL_PLAYER_${playerId}`;
  }
  
  // Transform Sidearm roster data to our standard format (ORIGINAL - works for NEW Sidearm)
  transformData(rawData) {
    // Check if it's OLD Sidearm format (has roster array instead of players)
    if (rawData.roster && !rawData.players) {
      return this.transformOldSidearmData(rawData.roster);
    }
    
    // NEW Sidearm format (ORIGINAL CODE - DON'T CHANGE)
    if (!rawData.players) return [];
    
    return rawData.players.map(player => ({
      // Core player fields
      playerId: player.playerId || player.rosterPlayerId,
      firstName: player.firstName,
      lastName: player.lastName,
      displayName: `${player.firstName} ${player.lastName}`,
      jersey: player.jerseyNumber,
      position: player.positionShort || player.positionLong,
      height: player.heightFeet ? `${player.heightFeet}'${player.heightInches}"` : null,
      weight: player.weight,
      year: player.academicYearShort || player.academicYearLong,
      hometown: player.hometown,
      highSchool: player.highSchool,
      previousSchool: player.previousSchool,
      
      // Additional Sidearm fields
      bio: player.bio,
      imageUrl: player.image?.absoluteUrl || player.image?.url,
      socialMedia: player.socialMedia,
      major: player.major,
      isCaptain: player.isCaptain,
      letters: player.letters,
      academicYear: {
        number: player.academicYearNumber,
        short: player.academicYearShort,
        long: player.academicYearLong
      },
      
      // Metadata
      sport: 'football',
      rosterPlayerId: player.rosterPlayerId
    }));
  }
  
  // NEW METHOD - Only for OLD Sidearm
  transformOldSidearmData(roster) {
    if (!roster) return [];
    
    return roster.map(player => {
      const playerInfo = player.playerinfo || {};
      const jersey = playerInfo.uni || playerInfo.uni_2 || '';
      
      let imageUrl = '';
      if (player.photos && player.photos.length > 0) {
        const headshot = player.photos.find(p => p.type === 'headshot');
        imageUrl = headshot ? headshot.fullsize : player.photos[0].fullsize;
      }
      
      return {
        // Map to same structure as NEW Sidearm for consistency
        playerId: player.player_id,
        rosterPlayerId: player.rp_id,
        firstName: player.firstname || '',
        lastName: player.lastname || '',
        displayName: player.name || `${player.firstname} ${player.lastname}`,
        jersey: jersey,
        position: playerInfo.pos_short || '',
        height: playerInfo.height || '',
        weight: playerInfo.weight || '',
        year: playerInfo.year || '',
        hometown: playerInfo.hometown || '',
        highSchool: playerInfo.highschool || '',
        previousSchool: playerInfo.previous_school || '',
        bio: player.bio || '',
        imageUrl: imageUrl,
        socialMedia: {
          twitter: playerInfo.twitter_username || '',
          instagram: playerInfo.instagram_username || ''
        },
        major: playerInfo.major || '',
        isCaptain: playerInfo.captain === 'True',
        academicYear: {
          short: playerInfo.year || '',
          long: playerInfo.year_long || ''
        },
        sport: 'football'
      };
    });
  }
  
  // Fetch roster for a specific team
  async fetchTeamRoster(team, options = {}) {
    try {
      // Validate team data (ORIGINAL CODE)
      if (!team) {
        throw new Error('Team object is required');
      }
      
      if (!team.baseUrl) {
        throw new Error(`Team ${team.teamId} missing baseUrl`);
      }
      
      // Check if team has football roster ID (ORIGINAL CODE)
      if (!team.ncaaSportsConfig?.football?.rosterId) {
        const teamDisplay = `${team.teamName}${team.teamNickname ? ` ${team.teamNickname}` : ''}`;
        throw new Error(`Team ${teamDisplay} (${team.teamId}) missing football roster ID. Please run auto-populate first from the Teams page.`);
      }
      
      const rosterId = team.ncaaSportsConfig.football.rosterId;
      
      // Ensure baseUrl has protocol (ORIGINAL CODE)
      let baseUrl = team.baseUrl;
      if (!baseUrl.startsWith('http')) {
        baseUrl = `https://${baseUrl}`;
      }

      // Check cache first (unless forceRefresh is enabled)
      const { forceRefresh = false } = options;
      if (!forceRefresh) {
        const cachedData = await this.getCachedData(team.teamId);
        if (cachedData && cachedData.length > 0) {
          logger.debug(`✅ Returning ${cachedData.length} players from cache`);
          return cachedData;
        }
      } else {
        logger.debug(`🔄 Force refresh enabled - bypassing cache`);
      }

      // MINIMAL CHANGE - Just check subScrapeType for URL
      let rosterUrl;
      if (team.subScrapeType === 'old') {
        // OLD Sidearm uses different URL
        rosterUrl = `${baseUrl}/api/roster_xml?format=json&roster_id=${rosterId}`;
        logger.debug(`Fetching OLD Sidearm roster from: ${rosterUrl}`);
      } else {
        // NEW Sidearm (DEFAULT - ORIGINAL CODE)
        rosterUrl = `${baseUrl}/api/v2/rosters/${rosterId}`;
        logger.debug(`Fetching roster from: ${rosterUrl}`);
      }
      
      // Fetch with full browser headers (ORIGINAL CODE)
      const response = await axios.get(rosterUrl, {
        timeout: 15000,
        family: 4, // Force IPv4 to avoid IPv6 connectivity issues
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
          'Referer': `${baseUrl}/sports/football/roster`
        }
      });
      
      // Transform the roster data (ORIGINAL CODE - transformData handles both)
      const players = this.transformData(response.data);
      const teamDisplay = `${team.teamName}${team.teamNickname ? ` ${team.teamNickname}` : ''}`;
      logger.debug(`Found ${players.length} players for ${teamDisplay}`);

      // Delete all existing roster data for this team before inserting fresh data
      const deleteResult = await ScrapedData.deleteMany({
        teamId: team.teamId,
        moduleId: this.config.id
      });
      logger.debug(`🗑️  Deleted ${deleteResult.deletedCount} old player records for ${teamDisplay}`);

      // Save each player (ORIGINAL CODE)
      const savedPlayers = [];
      for (const player of players) {
        const playerWithTeamInfo = { 
          ...player, 
          teamId: team.teamId,
          teamName: team.teamName,
          teamNickname: team.teamNickname
        };
        
        const saved = await this.saveTransformedData(
          team.teamId,
          playerWithTeamInfo,
          { url: rosterUrl, name: 'Sidearm' },
          options
        );
        savedPlayers.push(saved);
      }
      
      return savedPlayers;
      
    } catch (error) {
      logger.error(`Error fetching roster for ${team.teamName || team.teamId}:`, error.message);
      
      // Provide helpful error messages (ORIGINAL CODE)
      if (error.code === 'ECONNREFUSED') {
        throw new Error(`Cannot connect to ${team.baseUrl}. Server may be down.`);
      } else if (error.code === 'ECONNRESET') {
        throw new Error(`Connection reset by ${team.baseUrl}. May need better headers or rate limiting.`);
      } else if (error.response?.status === 404) {
        throw new Error(`Roster not found. Roster ID ${team.ncaaSportsConfig?.football?.rosterId} may be incorrect.`);
      } else if (error.response?.status === 403) {
        throw new Error(`Access forbidden to ${team.baseUrl}. The site may be blocking automated requests.`);
      }
      
      throw error;
    }
  }
  
  // Alternative method name for compatibility (ORIGINAL CODE)
  async fetchRosterForTeam(team) {
    return this.fetchTeamRoster(team);
  }
}

module.exports = NCAAFootballRosterModule;