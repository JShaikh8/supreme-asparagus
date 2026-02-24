// backend/modules/espn-tv/index.js
const BaseModule = require('../BaseModule');
const axios = require('axios');
const logger = require('../../utils/logger');

class ESPNTVModule extends BaseModule {
  constructor() {
    super({
      id: 'espn_tv',
      name: 'ESPN TV/Broadcast Data',
      sport: 'CFB',
      dataType: 'tv',
      
      validation: {
        requiredFields: ['gameId', 'date'],
      },
      
      cacheHours: 6, // TV data can change more frequently
      
      endpoints: {
        schedule: 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/{teamId}/schedule',
        scoreboard: 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates={date}'
      }
    });
  }
  
  // Generate match key for games
  generateMatchKey(record) {
    const date = record.date.split('T')[0];
    const teams = [record.homeTeamId, record.awayTeamId].sort().join('_');
    return `${date}_${teams}`.toLowerCase();
  }
  
  // Transform ESPN data focusing on TV/broadcast info
  transformData(rawData) {
    if (!rawData.events) return [];
    
    return rawData.events.map(event => {
      const competition = event.competitions[0];
      const broadcast = competition.broadcasts?.[0] || {};
      
      return {
        gameId: event.id,
        date: event.date,
        
        // This is what you care about - TV data
        tv: {
          network: broadcast.names?.[0] || null,
          networkId: broadcast.type?.id,
          networkAbbreviation: broadcast.type?.abbreviation,
          market: broadcast.market,
          isNational: broadcast.national || false,
          mediaId: broadcast.media?.id,
          callLetters: broadcast.callLetters,
          lang: broadcast.lang || 'en',
        },
        
        // Include team IDs for matching
        homeTeamId: competition.competitors?.find(c => c.homeAway === 'home')?.team?.id,
        awayTeamId: competition.competitors?.find(c => c.homeAway === 'away')?.team?.id,
        
        // Include game time for comparison
        gameTime: event.date,
        timeValid: event.timeValid || true,
      };
    });
  }
  
  // Fetch TV data for a specific team's schedule
  async fetchTeamTVData(team) {
    try {
      const url = this.config.endpoints.schedule.replace('{teamId}', team.externalIds.espnId);
      logger.debug(`Fetching TV data from ESPN: ${url}`);
      
      const response = await axios.get(url);
      
      const games = this.transformData(response.data);
      logger.debug(`Found TV data for ${games.length} games`);
      
      // Save TV data for each game
      const savedGames = [];
      for (const game of games) {
        const saved = await this.saveScrapedData(
          team.internalId,
          game,
          { url, name: 'ESPN' }
        );
        savedGames.push(saved);
      }
      
      return savedGames;
    } catch (error) {
      logger.error(`Error fetching TV data for ${team.displayName}:`, error.message);
      throw error;
    }
  }
}

module.exports = ESPNTVModule;