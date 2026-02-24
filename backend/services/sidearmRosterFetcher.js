// backend/services/sidearmRosterFetcher.js
const axios = require('axios');
const Team = require('../models/Team');
const logger = require('../utils/logger');

class SidearmRosterFetcher {
  async fetchRoster(team) {
    try {
      // Determine which Sidearm version we're working with
      if (team.subScrapeType === 'new') {
        return await this.fetchNewSidearmRoster(team);
      } else if (team.subScrapeType === 'old') {
        return await this.fetchOldSidearmRoster(team);
      } else {
        throw new Error(`Unknown Sidearm subtype: ${team.subScrapeType}`);
      }
    } catch (error) {
      logger.error(`Error fetching roster for ${team.teamName}:`, error.message);
      throw error;
    }
  }

  async fetchNewSidearmRoster(team) {
    // Get roster ID from team config
    const sportConfig = team.ncaaSportsConfig?.football;
    if (!sportConfig?.rosterId) {
      throw new Error(`Team ${team.teamId} missing football roster ID. Run auto-populate first.`);
    }
    
    const rosterId = sportConfig.rosterId;
    
    // Ensure baseUrl has protocol
    let baseUrl = team.baseUrl;
    if (!baseUrl.startsWith('http')) {
      baseUrl = `https://${baseUrl}`;
    }
    
    // Construct the NEW Sidearm API URL
    const rosterUrl = `${baseUrl}/api/v2/rosters/${rosterId}`;
    logger.debug(`Fetching NEW Sidearm roster from: ${rosterUrl}`);
    
    // Fetch with full browser headers
    const response = await axios.get(rosterUrl, {
      timeout: 15000,
      headers: this.getHeaders(baseUrl, 'football')
    });
    
    // Transform the NEW Sidearm roster data
    if (!response.data?.players) {
      throw new Error('No players found in NEW Sidearm roster response');
    }
    
    const players = this.transformNewSidearmPlayers(response.data.players, team);
    logger.debug(`Found ${players.length} players for ${team.teamName} (NEW Sidearm)`);
    
    return {
      success: true,
      count: players.length,
      players,
      source: 'sidearm_new',
      url: rosterUrl
    };
  }

  async fetchOldSidearmRoster(team) {
    // Get roster ID from team config
    const sportConfig = team.ncaaSportsConfig?.football;
    if (!sportConfig?.rosterId) {
      throw new Error(`Team ${team.teamId} missing football roster ID. Run auto-populate first.`);
    }
    
    const rosterId = sportConfig.rosterId;
    
    // Ensure baseUrl has protocol
    let baseUrl = team.baseUrl;
    if (!baseUrl.startsWith('http')) {
      baseUrl = `https://${baseUrl}`;
    }
    
    // Construct the OLD Sidearm API URL
    const rosterUrl = `${baseUrl}/api/roster_xml?format=json&roster_id=${rosterId}`;
    logger.debug(`Fetching OLD Sidearm roster from: ${rosterUrl}`);
    
    // Fetch with full browser headers
    const response = await axios.get(rosterUrl, {
      timeout: 15000,
      headers: this.getHeaders(baseUrl, 'football')
    });
    
    // Transform the OLD Sidearm roster data
    if (!response.data?.roster) {
      throw new Error('No roster found in OLD Sidearm response');
    }
    
    const players = this.transformOldSidearmPlayers(response.data.roster, team);
    logger.debug(`Found ${players.length} players for ${team.teamName} (OLD Sidearm)`);
    
    return {
      success: true,
      count: players.length,
      players,
      source: 'sidearm_old',
      url: rosterUrl
    };
  }

  transformNewSidearmPlayers(players, team) {
    return players.map(player => {
      const jersey = player.jersey || 
                    player.uniform || 
                    `${player.firstName}_${player.lastName}`;
      
      return {
        // Core identifiers
        teamId: team.teamId,
        teamName: team.teamName,
        rosterId: player.id || player.rosterId,
        playerId: player.playerId,
        
        // Name info
        firstName: player.firstName || '',
        lastName: player.lastName || '',
        displayName: player.displayName || `${player.firstName} ${player.lastName}`,
        
        // Jersey and position
        jersey: jersey,
        position: player.position || '',
        positionCategory: player.positionCategory || '',
        
        // Physical attributes
        height: player.height || '',
        weight: player.weight || '',
        
        // Academic/year info
        academicYear: player.academicYear || player.year || '',
        eligibility: player.eligibility || '',
        
        // Location
        hometown: player.hometown || '',
        homeState: player.homeState || '',
        homeCountry: player.homeCountry || '',
        highSchool: player.highSchool || '',
        
        // Additional info
        bio: player.bio || '',
        imageUrl: player.imageUrl || '',
        
        // Social media if available
        twitter: player.twitter || '',
        instagram: player.instagram || '',
        
        // Metadata
        fetchedAt: new Date(),
        source: 'sidearm_new'
      };
    });
  }

  transformOldSidearmPlayers(roster, team) {
    return roster.map(player => {
      const playerInfo = player.playerinfo || {};
      
      // Extract jersey number from uni field
      const jersey = playerInfo.uni || playerInfo.uni_2 || '';
      
      // Build image URL from photos array
      let imageUrl = '';
      if (player.photos && player.photos.length > 0) {
        const headshot = player.photos.find(p => p.type === 'headshot');
        imageUrl = headshot ? headshot.fullsize : player.photos[0].fullsize;
      }
      
      // Extract social media from the social_media object
      const socialMedia = playerInfo.social_media || {};
      
      return {
        // Core identifiers
        teamId: team.teamId,
        teamName: team.teamName,
        rosterId: player.rp_id,
        playerId: player.player_id,
        
        // Name info
        firstName: player.firstname || '',
        lastName: player.lastname || '',
        displayName: player.name || `${player.firstname} ${player.lastname}`,
        
        // Jersey and position
        jersey: jersey,
        position: playerInfo.pos_short || '',
        positionLong: playerInfo.pos_long || '',
        positionList: playerInfo.pos_short_list || [],
        
        // Physical attributes
        height: playerInfo.height || '',
        weight: playerInfo.weight || '',
        heightFeet: playerInfo.height_feet || '',
        heightInches: playerInfo['height-inches'] || '',
        
        // Academic/year info
        academicYear: playerInfo.year || '',
        academicYearLong: playerInfo.year_long || '',
        
        // Location
        hometown: playerInfo.hometown || '',
        highSchool: playerInfo.highschool || '',
        previousSchool: playerInfo.previous_school || '',
        
        // Additional info
        bio: player.bio || '',
        imageUrl: imageUrl,
        bioLink: playerInfo.biolink || '',
        major: playerInfo.major || '',
        captain: playerInfo.captain === 'True',
        
        // Social media
        twitter: playerInfo.twitter_username || socialMedia.Twitter || '',
        instagram: playerInfo.instagram_username || socialMedia.Instagram || '',
        facebook: playerInfo.facebook_username || socialMedia.Facebook || '',
        snapchat: playerInfo.snapchat_username || '',
        tiktok: playerInfo.tiktok_username || socialMedia.TikTok || '',
        youtube: playerInfo.youtube_username || '',
        twitch: playerInfo.twitch_username || '',
        
        // Custom fields
        customFields: player.custom_fields || {},
        
        // All photos
        photos: player.photos || [],
        
        // Metadata
        fetchedAt: new Date(),
        source: 'sidearm_old'
      };
    });
  }

  getHeaders(baseUrl, sport = 'football') {
    return {
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
      'Referer': `${baseUrl}/sports/${sport}/roster`
    };
  }

  // Method to fetch roster for any sport (not just football)
  async fetchSportRoster(team, sportName) {
    const sportConfig = team.ncaaSportsConfig?.[sportName];
    if (!sportConfig?.rosterId) {
      throw new Error(`Team ${team.teamId} missing ${sportName} roster ID. Run auto-populate first.`);
    }
    
    const rosterId = sportConfig.rosterId;
    let baseUrl = team.baseUrl;
    if (!baseUrl.startsWith('http')) {
      baseUrl = `https://${baseUrl}`;
    }
    
    let rosterUrl;
    if (team.subScrapeType === 'new') {
      rosterUrl = `${baseUrl}/api/v2/rosters/${rosterId}`;
    } else if (team.subScrapeType === 'old') {
      rosterUrl = `${baseUrl}/api/roster_xml?format=json&roster_id=${rosterId}`;
    } else {
      throw new Error(`Unknown Sidearm subtype: ${team.subScrapeType}`);
    }
    
    logger.debug(`Fetching ${sportName} roster from: ${rosterUrl}`);
    
    const response = await axios.get(rosterUrl, {
      timeout: 15000,
      headers: this.getHeaders(baseUrl, this.getSportSlug(sportName))
    });
    
    let players;
    if (team.subScrapeType === 'new') {
      if (!response.data?.players) {
        throw new Error(`No players found in ${sportName} roster response`);
      }
      players = this.transformNewSidearmPlayers(response.data.players, team);
    } else {
      if (!response.data?.roster) {
        throw new Error(`No roster found in ${sportName} response`);
      }
      players = this.transformOldSidearmPlayers(response.data.roster, team);
    }
    
    logger.debug(`Found ${players.length} ${sportName} players for ${team.teamName}`);
    
    return {
      success: true,
      sport: sportName,
      count: players.length,
      players,
      source: `sidearm_${team.subScrapeType}`,
      url: rosterUrl
    };
  }

  // Helper to convert sportName to URL slug
  getSportSlug(sportName) {
    const slugMap = {
      'football': 'football',
      'mensBasketball': 'mens-basketball',
      'womensBasketball': 'womens-basketball',
      'baseball': 'baseball',
      'softball': 'softball',
      'mensVolleyball': 'mens-volleyball',
      'womensVolleyball': 'womens-volleyball',
      'mensSoccer': 'mens-soccer',
      'womensSoccer': 'womens-soccer',
      'mensIceHockey': 'mens-ice-hockey',
      'womensIceHockey': 'womens-ice-hockey',
      'mensTrack': 'mens-track',
      'womensTrack': 'womens-track',
      'mensCrossCountry': 'mens-cross-country',
      'womensCrossCountry': 'womens-cross-country',
      'mensGolf': 'mens-golf',
      'womensGolf': 'womens-golf',
      'mensTennis': 'mens-tennis',
      'womensTennis': 'womens-tennis',
      'mensGymnastics': 'mens-gymnastics',
      'womensGymnastics': 'womens-gymnastics',
      'mensSwimming': 'mens-swimming',
      'womensSwimming': 'womens-swimming',
      'wrestling': 'wrestling'
    };
    
    return slugMap[sportName] || sportName.toLowerCase();
  }
}

module.exports = new SidearmRosterFetcher();