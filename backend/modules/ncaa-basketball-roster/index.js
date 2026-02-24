// backend/modules/ncaa-basketball-roster/index.js
// MINIMAL FIX - Only adds OLD Sidearm support without changing NEW Sidearm logic
const BaseModule = require('../BaseModule');
const axios = require('axios');
const { retryWithBackoff, UserAgentRotator, getAxiosConfig } = require('../../utils/httpUtils');
const ScrapedData = require('../../models/ScrapedData');
const logger = require('../../utils/logger');

class NCAABasketballRosterModule extends BaseModule {
  constructor(sport = 'mensBasketball') {
    super({
      id: `ncaa_${sport}_roster`,
      name: `NCAA ${sport === 'mensBasketball' ? "Men's" : "Women's"} Basketball Roster`,
      league: 'NCAA',
      sport: sport, // mensBasketball or womensBasketball
      dataType: 'roster',

      validation: {
        requiredFields: ['firstName', 'lastName'],
      },

      cacheHours: 2 // Match stats cache duration
    });

    this.sport = sport;
    // Initialize user-agent rotator for better bot detection avoidance
    this.userAgentRotator = new UserAgentRotator();
  }
  
  // Generate unique key for matching (ORIGINAL CODE)
  generateMatchKey(record) {
    const jersey = record.jersey || `${record.firstName}_${record.lastName}`;
    const season = new Date().getFullYear();
    const sportAbbrev = this.sport === 'mensBasketball' ? 'MBB' : 'WBB';
    return `${record.teamId}_${sportAbbrev}_${jersey}_${season}`.toUpperCase().replace(/\s+/g, '_');
  }
  
  // Transform Sidearm basketball roster data (ORIGINAL CODE FOR NEW SIDEARM)
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
      position: player.positionShort || player.positionLong, // G, F, C, etc.
      height: player.heightFeet ? `${player.heightFeet}'${player.heightInches}"` : null,
      weight: player.weight,
      year: player.academicYearShort || player.academicYearLong,
      hometown: player.hometown,
      highSchool: player.highSchool,
      previousSchool: player.previousSchool,
      
      // Additional fields
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
      
      // Basketball specific metadata
      sport: this.sport,
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
        position: playerInfo.pos_short || '', // G, F, C, etc.
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
        sport: this.sport
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
      
      // Check if team has basketball roster ID (ORIGINAL CODE)
      const sportConfig = team.ncaaSportsConfig?.[this.sport];
      if (!sportConfig?.rosterId) {
        throw new Error(`Team ${team.teamId} missing ${this.sport} roster ID. Run auto-populate first.`);
      }
      
      const rosterId = sportConfig.rosterId;

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

      // Try NEW Sidearm first, fallback to OLD if network issues occur
      let rosterUrl;
      let response;
      let usedOldFallback = false;

      // Determine initial URL based on subScrapeType
      if (team.subScrapeType === 'old') {
        // OLD Sidearm uses different URL
        rosterUrl = `${baseUrl}/api/roster_xml?format=json&roster_id=${rosterId}`;
        logger.debug(`Fetching OLD Sidearm ${this.sport} roster from: ${rosterUrl}`);
      } else {
        // NEW Sidearm (DEFAULT)
        rosterUrl = `${baseUrl}/api/v2/rosters/${rosterId}`;
        logger.debug(`Fetching ${this.sport} roster from: ${rosterUrl}`);
      }

      try {
        // Fetch with retry logic and rotated user agents for better reliability
        response = await retryWithBackoff(async () => {
          return await axios.get(rosterUrl, {
            timeout: 30000, // Increased to 30s for servers with aggressive bot protection
            family: 4, // Force IPv4 to avoid IPv6 connectivity issues
            headers: {
              'User-Agent': this.userAgentRotator.getNext(),
              'Accept': 'application/json, text/plain, */*',
              'Accept-Language': 'en-US,en;q=0.9',
              'Accept-Encoding': 'gzip, deflate, br',
              'Connection': 'keep-alive',
              'Referer': `${baseUrl}/sports/${this.sport === 'mensBasketball' ? 'mens-basketball' : 'womens-basketball'}/roster`
            }
          });
        }, `${team.teamName} roster fetch`, 3, 5000); // Increased delay to 5s/10s/20s for aggressive bot protection
      } catch (newSidearmError) {
        // Check if this was a NEW Sidearm attempt that failed with network issues
        const isNetworkError = newSidearmError.code === 'ETIMEDOUT' ||
                               newSidearmError.code === 'ECONNRESET' ||
                               newSidearmError.code === 'ECONNABORTED' ||
                               newSidearmError.message?.includes('timeout');

        if (team.subScrapeType !== 'old' && isNetworkError) {
          // Try OLD Sidearm format as fallback
          logger.debug(`⚠️  NEW Sidearm failed (${newSidearmError.code || newSidearmError.message}), trying OLD Sidearm format as fallback...`);
          rosterUrl = `${baseUrl}/api/roster_xml?format=json&roster_id=${rosterId}`;
          logger.debug(`Fetching OLD Sidearm ${this.sport} roster from: ${rosterUrl}`);

          try {
            response = await retryWithBackoff(async () => {
              return await axios.get(rosterUrl, {
                timeout: 30000,
                family: 4, // Force IPv4 to avoid IPv6 connectivity issues
                headers: {
                  'User-Agent': this.userAgentRotator.getNext(),
                  'Accept': 'application/json, text/plain, */*',
                  'Accept-Language': 'en-US,en;q=0.9',
                  'Accept-Encoding': 'gzip, deflate, br',
                  'Connection': 'keep-alive',
                  'Referer': `${baseUrl}/sports/${this.sport === 'mensBasketball' ? 'mens-basketball' : 'womens-basketball'}/roster`
                }
              });
            }, `${team.teamName} OLD Sidearm roster fetch`, 3, 5000);

            usedOldFallback = true;
            logger.debug(`✅ OLD Sidearm fallback succeeded!`);
          } catch (oldSidearmError) {
            logger.debug(`❌ OLD Sidearm fallback also failed: ${oldSidearmError.code || oldSidearmError.message}`);
            throw newSidearmError; // Throw original error
          }
        } else {
          // Not a network error or already tried OLD, re-throw
          throw newSidearmError;
        }
      }
      
      // Transform the roster data (ORIGINAL CODE - transformData handles both)
      const players = this.transformData(response.data);
      logger.debug(`Found ${players.length} ${this.sport} players for ${team.teamName}`);

      // Delete all existing roster data for this team before inserting fresh data
      const deleteResult = await ScrapedData.deleteMany({
        teamId: team.teamId,
        moduleId: this.config.id
      });
      logger.debug(`🗑️  Deleted ${deleteResult.deletedCount} old player records for ${team.teamName}`);

      // Save each player (ORIGINAL CODE)
      const savedPlayers = [];
      for (const player of players) {
        const playerWithTeamInfo = { 
          ...player, 
          teamId: team.teamId,
          teamName: team.teamName
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
      logger.error(`Error fetching ${this.sport} roster for ${team.teamName || team.teamId}:`, error.message);
      
      // Error handling (ORIGINAL CODE)
      if (error.code === 'ECONNREFUSED') {
        throw new Error(`Cannot connect to ${team.baseUrl}. Server may be down.`);
      } else if (error.code === 'ECONNRESET') {
        throw new Error(`Connection reset by ${team.baseUrl}. May need better headers or rate limiting.`);
      } else if (error.response?.status === 404) {
        throw new Error(`Roster not found. Roster ID ${team.ncaaSportsConfig?.[this.sport]?.rosterId} may be incorrect.`);
      } else if (error.response?.status === 403) {
        throw new Error(`Access forbidden to ${team.baseUrl}. The site may be blocking automated requests.`);
      }
      
      throw error;
    }
  }
}

module.exports = NCAABasketballRosterModule;