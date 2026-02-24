// backend/services/statsApiService.js
const axios = require('axios');
const xml2js = require('xml2js');
const logger = require('../utils/logger');

class StatsApiService {
  constructor() {
    this.baseUrl = process.env.STATS_API_URL || 'https://your_stats_api_url/v1/stats';
    this.parser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: true
    });
  }

  async getFootballRoster(statsId) {
    try {
      const url = `${this.baseUrl}/football/cfb/participants/teams/${statsId}`;
      logger.debug(`Fetching from Stats API: ${url}`);
      
      const response = await axios.get(url, {
        headers: {
          'Accept': 'application/xml',
          'User-Agent': 'Mozilla/5.0'
        }
      });
      
      // Parse XML to JSON
      const result = await this.parser.parseStringPromise(response.data);
      
      if (result.apiReturn && result.apiReturn.apiResults) {
        return this.transformApiData(result.apiReturn.apiResults);
      }
      
      return [];
    } catch (error) {
      logger.error('Stats API error:', error);
      throw error;
    }
  }

  transformApiData(apiResults) {
    const players = [];
    
    // Navigate the XML structure
    const sport = apiResults.sport;
    if (sport && sport.league && sport.league.players) {
      const playerList = Array.isArray(sport.league.players.player) 
        ? sport.league.players.player 
        : [sport.league.players.player];
      
      playerList.forEach(player => {
        players.push({
          playerId: player.playerId,
          firstName: player.firstName,
          lastName: player.lastName,
          displayName: `${player.firstName} ${player.lastName}`,
          jersey: player.uniform,
          height: player.height?.inches ? `${Math.floor(player.height.inches / 12)}'${player.height.inches % 12}"` : null,
          weight: player.weight?.pounds,
          position: player.positions?.position?.abbreviation || player.positions?.position?.name,
          positionName: player.positions?.position?.name,
          year: player.schoolYear?.year,
          eligibility: player.schoolYear?.eligibility,
          hometown: player.hometown?.city,
          homeState: player.hometown?.state?.abbreviation,
          teamId: player.team?.teamId,
          teamName: player.team?.location,
          teamNickname: player.team?.nickname,
          source: 'api',
          isActive: player.isActive === 'true'
        });
      });
    }
    
    return players;
  }

  async getBasketballRoster(statsId, gender = 'mens') {
    try {
      const league = gender === 'mens' ? 'cbk' : 'cwk';
      const url = `${this.baseUrl}/basketball/${league}/participants/teams/${statsId}`;
      
      const response = await axios.get(url, {
        headers: {
          'Accept': 'application/xml',
          'User-Agent': 'Mozilla/5.0'
        }
      });
      
      const result = await this.parser.parseStringPromise(response.data);
      
      if (result.apiReturn && result.apiReturn.apiResults) {
        return this.transformApiData(result.apiReturn.apiResults);
      }
      
      return [];
    } catch (error) {
      logger.error('Stats API basketball error:', error);
      throw error;
    }
  }
}

module.exports = new StatsApiService();