// backend/services/sidearmFetcher.js
const axios = require('axios');
const sidearmDetector = require('./sidearmDetector');
const ScrapedData = require('../models/ScrapedData');
const logger = require('../utils/logger');

class SidearmFetcher {
  async fetchRosterFromUrl(baseUrl, teamInternalId) {
    try {
      // Get Sidearm info (auto-detect version and get IDs)
      logger.debug(`\n🔍 Processing: ${baseUrl}`);
      const sidearmInfo = await sidearmDetector.getSidearmInfo(baseUrl);
      
      // Fetch the roster data
      logger.debug(`📥 Fetching roster from: ${sidearmInfo.rosterUrl}`);
      const rosterResponse = await axios.get(sidearmInfo.rosterUrl);
      
      if (!rosterResponse.data?.players) {
        throw new Error('No players found in roster response');
      }
      
      const players = rosterResponse.data.players;
      logger.debug(`✅ Found ${players.length} players`);
      
      // Transform and save each player
      const savedPlayers = [];
      for (const player of players) {
        const transformedPlayer = this.transformPlayer(player, teamInternalId);
        
        // Save to MongoDB
        const saved = await ScrapedData.findOneAndUpdate(
          {
            moduleId: 'sidearm_roster',
            teamId: teamInternalId,
            matchKey: transformedPlayer.matchKey
          },
          {
            moduleId: 'sidearm_roster',
            teamId: teamInternalId,
            matchKey: transformedPlayer.matchKey,
            data: transformedPlayer,
            source: {
              url: sidearmInfo.rosterUrl,
              name: 'Sidearm',
              fetchedAt: new Date()
            },
            validation: {
              isValid: true,
              errors: [],
              warnings: []
            }
          },
          {
            upsert: true,
            new: true
          }
        );
        
        savedPlayers.push(saved);
      }
      
      return {
        success: true,
        baseUrl,
        sidearmInfo,
        playerCount: savedPlayers.length,
        players: savedPlayers
      };
      
    } catch (error) {
      logger.error(`❌ Error processing ${baseUrl}:`, error.message);
      return {
        success: false,
        baseUrl,
        error: error.message
      };
    }
  }
  
  transformPlayer(sidearmPlayer, teamId) {
    const jersey = sidearmPlayer.jersey || 
                  sidearmPlayer.uniform || 
                  `${sidearmPlayer.firstName}_${sidearmPlayer.lastName}`;
    
    const matchKey = `${teamId}_${jersey}_${new Date().getFullYear()}`
      .toLowerCase()
      .replace(/\s+/g, '_');
    
    return {
      matchKey,
      
      // Core fields
      rosterId: sidearmPlayer.rosterNo || sidearmPlayer.id,
      firstName: sidearmPlayer.firstName || '',
      lastName: sidearmPlayer.lastName || '',
      displayName: sidearmPlayer.displayName || `${sidearmPlayer.firstName} ${sidearmPlayer.lastName}`,
      jersey: jersey,
      
      // Position info
      position: sidearmPlayer.position || '',
      positionCategory: sidearmPlayer.positionCategory || '',
      
      // Physical attributes
      height: sidearmPlayer.height || '',
      weight: sidearmPlayer.weight || '',
      
      // Academic/year info
      academicYear: sidearmPlayer.academicYear || sidearmPlayer.year || '',
      eligibility: sidearmPlayer.eligibility || '',
      
      // Location
      hometown: sidearmPlayer.hometown || '',
      homeState: sidearmPlayer.homeState || '',
      homeCountry: sidearmPlayer.homeCountry || '',
      highSchool: sidearmPlayer.highSchool || '',
      
      // Additional info
      bio: sidearmPlayer.bio || '',
      imageUrl: sidearmPlayer.imageUrl || '',
      
      // Social media if available
      twitter: sidearmPlayer.twitter || '',
      instagram: sidearmPlayer.instagram || '',
      
      // Metadata
      fetchedAt: new Date(),
      teamId
    };
  }
}

module.exports = new SidearmFetcher();