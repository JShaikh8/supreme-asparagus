// backend/modules/mlb-roster/index.js
const BaseModule = require('../BaseModule');
const axios = require('axios');
const ScrapedData = require('../../models/ScrapedData');
const logger = require('../../utils/logger');

class MLBRosterModule extends BaseModule {
  constructor() {
    super({
      id: 'mlb_roster',
      name: 'MLB Roster',
      league: 'MLB',
      sport: 'baseball',
      dataType: 'roster',
      
      validation: {
        requiredFields: ['personId', 'fullName'],
      },

      cacheHours: 2 // Match stats cache duration
    });
    
    // MLB roster types mapping (key = frontend value, value = API lookupName)
    this.rosterTypes = {
      '40man': '40Man',
      'fullSeason': 'fullSeason',
      'fullRoster': 'fullRoster',
      'nonRosterInvitees': 'nonRosterInvitees',
      'active': 'active',
      'allTime': 'allTime',
      'depthChart': 'depthChart',
      'gameday': 'gameday',
      'coach': 'coach'
    };
  }
  
  // Generate unique key for MLB players
  generateMatchKey(record) {
    const season = record.season || new Date().getFullYear();
    const jersey = record.jerseyNumber || record.personId;
    return `${record.teamId}_MLB_${jersey}_${season}`.toUpperCase().replace(/\s+/g, '_');
  }
  
  // Transform MLB API data to our standard format
  transformData(rawData, teamId, season, rosterType) {
    if (!rawData.roster) return [];

    return rawData.roster.map(entry => ({
      // Core player fields from MLB API
      personId: entry.person.id,
      playerId: entry.person.id, // Alias for Oracle compatibility
      fullName: entry.person.fullName,
      firstName: entry.person.firstName,
      lastName: entry.person.lastName,
      displayName: entry.person.fullName,
      moniker: entry.person.nickName || entry.person.fullName, // Nickname/moniker
      jerseyNumber: entry.jerseyNumber,
      uniform: entry.jerseyNumber, // Alias for Oracle compatibility
      position: entry.position?.abbreviation || entry.position?.name,
      positionType: entry.position?.type,
      positionName: entry.position?.name,
      isPitcher: entry.position?.type === 'Pitcher',

      // MLB specific fields
      mlbDebutDate: entry.person.mlbDebutDate,
      debutDate: entry.person.mlbDebutDate, // Alias
      birthDate: entry.person.birthDate,
      birthCity: entry.person.birthCity,
      birthStateProvince: entry.person.birthStateProvince,
      birthCountry: entry.person.birthCountry,
      height: entry.person.height,
      weight: entry.person.weight,
      strikeZoneTop: entry.person.strikeZoneTop,
      strikeZoneBottom: entry.person.strikeZoneBottom,

      // Status info
      status: entry.status?.code,
      statusCode: entry.status?.code,
      statusDescription: entry.status?.description,
      is40Man: rosterType === '40Man' || entry.status?.code === 'A',

      // Batting/Throwing info
      batSide: entry.person.batSide?.code,
      batSideDescription: entry.person.batSide?.description,
      pitchHand: entry.person.pitchHand?.code,
      throwingHand: entry.person.pitchHand?.code, // Alias
      pitchHandDescription: entry.person.pitchHand?.description,

      // Rookie info
      isRookie: entry.person.rookieSeasons?.some(s => s === season),
      rookieSeasons: entry.person.rookieSeasons,
      rookieYear: entry.person.rookieSeasons?.[0] || null,

      // Career years
      yearFirst: entry.person.rookieSeasons?.[0] || null,
      yearLast: season,

      // External references - extract EBIS ID (xrefType === 'bis') from xrefIds array
      ebisId: Array.isArray(entry.person.xrefIds)
        ? entry.person.xrefIds.find(x => x.xrefType === 'bis')?.xrefId || null
        : null,
      mlbamId: entry.person.id, // MLB Advanced Media ID

      // Metadata
      sport: 'baseball',
      league: 'MLB',
      season: season,
      teamId: teamId,
      rosterType: rosterType
    }));
  }
  
  // Get MLB team's internal ID
  getMLBTeamId(team) {
    // Use mlbId from team config (consistent with mlb-schedule module)
    if (team.mlbId) {
      return team.mlbId;
    }

    // Fallback to espnId for backwards compatibility
    if (team.espnId) {
      return team.espnId;
    }

    return null;
  }
  
  // Fetch roster for a specific MLB team
  async fetchTeamRoster(team, options = {}) {
    try {
      // Validate team data
      if (!team) {
        throw new Error('Team object is required');
      }
      
      if (team.league !== 'MLB') {
        throw new Error(`Team ${team.teamId} is not an MLB team`);
      }
      
      const mlbTeamId = this.getMLBTeamId(team);
      if (!mlbTeamId) {
        throw new Error(`No MLB team ID found for ${team.teamId}. Please set mlbId to the MLB team ID.`);
      }
      
      // Get options
      const season = options.season || new Date().getFullYear();
      const rosterType = this.rosterTypes[options.rosterType] || 'active';
      const forceRefresh = options.forceRefresh || false;

      logger.info(`📋 MLB Roster fetch: options.rosterType=${options.rosterType}, mapped rosterType=${rosterType}, season=${season}`);

      // Check cache first (unless forceRefresh is enabled)
      // Cache must match team, season, AND rosterType
      if (!forceRefresh) {
        const cachedData = await ScrapedData.find({
          teamId: team.teamId,
          moduleId: this.config.id,
          'data.season': season,
          'data.rosterType': rosterType
        });
        if (cachedData && cachedData.length > 0) {
          // Check if cache is still valid (within cacheHours)
          const cacheAge = Date.now() - new Date(cachedData[0].updatedAt).getTime();
          const maxAge = (this.config.cacheHours || 2) * 60 * 60 * 1000;
          if (cacheAge < maxAge) {
            logger.debug(`✅ Returning ${cachedData.length} players from cache (${rosterType}, ${season})`);
            return cachedData;
          }
          logger.debug(`⏰ Cache expired for ${team.teamName} (${rosterType}, ${season})`);
        }
      } else {
        logger.debug(`🔄 Force refresh enabled - bypassing cache`);
      }

      // Construct the MLB API URL
      const apiUrl = `https://statsapi.mlb.com/api/v1/teams/${mlbTeamId}/roster` +
                     `?rosterType=${rosterType}&season=${season}` +
                     `&hydrate=person(rookieSeasons,xrefId)`;
      
      logger.debug(`Fetching MLB roster from: ${apiUrl}`);
      
      // Fetch from MLB API - no special headers needed
      const response = await axios.get(apiUrl, {
        timeout: 10000
      });
      
      // Transform the roster data
      // Debug: Log first player's xrefIds to verify hydration is working
      if (response.data.roster?.[0]?.person?.xrefIds) {
        logger.debug(`✅ xrefIds hydration working - first player has ${response.data.roster[0].person.xrefIds.length} xrefIds`);
        const bisId = response.data.roster[0].person.xrefIds.find(x => x.xrefType === 'bis');
        logger.debug(`   BIS ID for first player: ${bisId?.xrefId || 'NOT FOUND'}`);
      } else {
        logger.warn(`⚠️ xrefIds NOT in API response - hydration may not be working`);
      }
      const players = this.transformData(response.data, team.teamId, season, rosterType);
      logger.debug(`Found ${players.length} players for ${team.teamName} (${season} ${rosterType})`);

      // Delete existing roster data for this team/season/rosterType combo before inserting fresh data
      const deleteResult = await ScrapedData.deleteMany({
        teamId: team.teamId,
        moduleId: this.config.id,
        'data.season': season,
        'data.rosterType': rosterType
      });
      logger.debug(`🗑️  Deleted ${deleteResult.deletedCount} old player records for ${team.teamName} (${season} ${rosterType})`);

      // Save each player
      const savedPlayers = [];
      for (const player of players) {
        const playerWithTeamInfo = { 
          ...player,
          teamName: team.teamName,
          rosterType: rosterType
        };
        
        const saved = await this.saveTransformedData(
          team.teamId,
          playerWithTeamInfo,
          { url: apiUrl, name: 'MLB Stats API' },
          options
        );
        savedPlayers.push(saved);
      }
      
      return savedPlayers;
      
    } catch (error) {
      logger.error(`Error fetching MLB roster for ${team.teamName || team.teamId}:`, error.message);
      
      if (error.response?.status === 404) {
        throw new Error(`Team or roster not found. MLB team ID ${this.getMLBTeamId(team)} may be incorrect.`);
      } else if (error.response?.status === 500) {
        throw new Error(`MLB API server error. Try again later.`);
      }
      
      throw error;
    }
  }
  
  // Fetch all roster types for a team
  async fetchAllRosterTypes(team, season) {
    const results = {};
    const rosterTypes = ['active', '40man', 'fullSeason'];
    
    for (const type of rosterTypes) {
      try {
        results[type] = await this.fetchTeamRoster(team, { 
          season, 
          rosterType: type 
        });
      } catch (error) {
        logger.error(`Failed to fetch ${type} roster:`, error.message);
        results[type] = { error: error.message };
      }
    }
    
    return results;
  }
}

module.exports = MLBRosterModule;