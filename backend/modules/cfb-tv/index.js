// backend/modules/cfb-tv/index.js
const BaseModule = require('../BaseModule');
const axios = require('axios');
const logger = require('../../utils/logger');

class CFBTVModule extends BaseModule {
  constructor() {
    super({
      id: 'cfb_tv',
      name: 'College Football TV Data',
      sport: 'CFB',
      dataType: 'tv',
      
      validation: {
        requiredFields: ['gameId', 'date'],
      },
      
      cacheHours: 6, // TV data can change more frequently
    });
  }
  
  // ESPN endpoints for TV data
  async fetchTVData(team) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/${team.externalIds.espnId}/schedule`;
      logger.debug(`Fetching TV data from ESPN: ${url}`);
      
      const response = await axios.get(url);
      
      const games = this.transformTVData(response.data, team);
      
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
  
  transformTVData(data, team) {
    if (!data.events) return [];
    
    return data.events.map(event => {
      const competition = event.competitions?.[0];
      const broadcast = competition?.broadcasts?.[0];
      
      return {
        gameId: event.id,
        teamId: team.internalId,
        date: event.date,
        name: event.name,
        
        // This is the main TV data we want
        tv: {
          network: broadcast?.names?.[0] || broadcast?.media?.shortName,
          market: broadcast?.market,
          type: broadcast?.type?.shortName, // TV, Radio, etc
          isNational: broadcast?.national || false,
          language: broadcast?.lang || 'en',
          region: broadcast?.region
        },
        
        // Additional broadcast details
        alternateNetworks: competition?.broadcasts?.slice(1)?.map(b => b.names?.[0]),
        streamingAvailable: competition?.broadcasts?.some(b => b.type?.shortName === 'Web'),
        
        // Game info for matching
        homeTeam: competition?.competitors?.find(c => c.homeAway === 'home')?.team?.displayName,
        awayTeam: competition?.competitors?.find(c => c.homeAway === 'away')?.team?.displayName,
      };
    });
  }
  
  generateMatchKey(record) {
    const date = record.date.split('T')[0];
    const teams = [record.homeTeam, record.awayTeam].sort().join('_');
    return `${date}_${teams}`.toLowerCase().replace(/\s+/g, '_');
  }
}

module.exports = CFBTVModule;