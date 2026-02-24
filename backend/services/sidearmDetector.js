// backend/services/sidearmDetector.js
const axios = require('axios');
const logger = require('../utils/logger');

class SidearmDetector {
  async detectSidearmVersion(baseUrl) {
    // Clean up the URL
    const cleanUrl = baseUrl.replace(/\/$/, '').replace(/^https?:\/\//, '');
    const url = `https://${cleanUrl}`;
    
    logger.debug(`Detecting Sidearm version for: ${url}`);
    
    // FIRST: Check for NEW Sidearm API (v2/sports)
    try {
      const newApiUrl = `${url}/api/v2/sports`;
      const response = await axios.get(newApiUrl, { 
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': `${url}/`
        }
      });
      
      // If we get a response with sports data array, it's new Sidearm
      if (response.data && Array.isArray(response.data)) {
        logger.debug('✅ Detected: New Sidearm API');
        return {
          version: 'sidearm_new',
          baseUrl: url,
          sportsEndpoint: newApiUrl
        };
      }
    } catch (error) {
      logger.debug('Not new Sidearm, checking for old version...');
    }
    
    // SECOND: Check for OLD Sidearm (sportnames endpoint with sports array)
    try {
      const sportNamesUrl = `${url}/api/sportnames`;
      const response = await axios.get(sportNamesUrl, { 
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': `${url}/`
        }
      });
      
      // Check if it has the sports array structure
      if (response.data?.sports && Array.isArray(response.data.sports)) {
        logger.debug('✅ Detected: Old Sidearm API (sportnames)');
        return {
          version: 'sidearm_old',
          baseUrl: url,
          sportsEndpoint: sportNamesUrl
        };
      }
    } catch (error) {
      logger.debug('Not old Sidearm via sportnames');
    }
    
    // FALLBACK: Check responsive-sportschedule endpoint
    try {
      const oldApiUrl = `${url}/services/responsive-sportschedule.ashx?format=json`;
      const response = await axios.get(oldApiUrl, { timeout: 5000 });
      
      if (response.data) {
        logger.debug('✅ Detected: Old Sidearm API (responsive-sportschedule)');
        return {
          version: 'sidearm_old',
          baseUrl: url,
          sportsEndpoint: oldApiUrl
        };
      }
    } catch (error) {
      logger.debug('Not old Sidearm either');
    }
    
    throw new Error(`Could not detect Sidearm API at ${url}. None of the known endpoints are accessible.`);
  }
  
  async getSidearmInfo(baseUrl) {
    const detection = await this.detectSidearmVersion(baseUrl);
    
    if (detection.version === 'sidearm_new') {
      return await this.getNewSidearmInfo(detection.baseUrl);
    } else if (detection.version === 'sidearm_old') {
      return await this.getOldSidearmInfo(detection.baseUrl);
    } else {
      throw new Error(`Unknown Sidearm version: ${detection.version}`);
    }
  }
  
  async getNewSidearmInfo(baseUrl) {
    try {
      // Step 1: Get all sports
      const sportsUrl = `${baseUrl}/api/v2/sports`;
      logger.debug(`Fetching sports from: ${sportsUrl}`);
      const sportsResponse = await axios.get(sportsUrl);
      
      // Find football sport (as an example - you can search for any sport)
      const football = sportsResponse.data.find(sport => 
        sport.shortName === 'football' || 
        sport.title === 'Football' ||
        sport.abbrev === 'FB'
      );
      
      if (!football) {
        // Return first available sport if football not found
        const firstSport = sportsResponse.data[0];
        if (!firstSport) {
          throw new Error('No sports found');
        }
        
        logger.debug(`Football not found, using ${firstSport.title} instead`);
        return this.getSportInfo(baseUrl, firstSport, 'new');
      }
      
      return this.getSportInfo(baseUrl, football, 'new');
    } catch (error) {
      logger.error('Error getting new Sidearm info:', error.message);
      throw error;
    }
  }
  
  async getOldSidearmInfo(baseUrl) {
    try {
      // Step 1: Get all sports from old endpoint
      const sportsUrl = `${baseUrl}/api/sportnames`;
      logger.debug(`Fetching sports from: ${sportsUrl}`);
      const sportsResponse = await axios.get(sportsUrl);
      
      let sports = [];
      
      // Parse the response based on the format {sports: [{sport: "id", sportInfo: {...}}]}
      if (sportsResponse.data?.sports && Array.isArray(sportsResponse.data.sports)) {
        // This is the expected format for old Sidearm
        sports = sportsResponse.data.sports.filter(s => 
          s.sportInfo && s.sportInfo.is_not_sport !== 'True' && s.sportInfo.is_not_sport !== true
        );
      } else if (Array.isArray(sportsResponse.data)) {
        // Direct array format
        sports = sportsResponse.data.filter(s => 
          !s.is_not_sport || (s.is_not_sport !== 'True' && s.is_not_sport !== true)
        );
      }
      
      // Find football or first available sport
      const football = sports.find(sportData => {
        const sportInfo = sportData.sportInfo || sportData;
        return sportInfo.sport_shortname === 'football' || 
               sportInfo.sport_title === 'Football';
      });
      
      const targetSport = football || sports[0];
      
      if (!targetSport) {
        throw new Error('No sports found in old Sidearm API');
      }
      
      // Extract sport info from the nested structure
      const sportInfo = targetSport.sportInfo || targetSport;
      
      // Return the complete info using the data from sportnames endpoint
      return {
        baseUrl,
        version: 'sidearm_old',
        sportId: parseInt(targetSport.sport) || null,
        sportTitle: sportInfo.sport_title,
        sportShortName: sportInfo.sport_shortname,
        rosterId: sportInfo.roster_id ? parseInt(sportInfo.roster_id) : null,
        scheduleId: sportInfo.schedule_id ? parseInt(sportInfo.schedule_id) : null,
        seasonId: sportInfo.season_id ? parseInt(sportInfo.season_id) : null,
        conferenceId: sportInfo.conference_id ? parseInt(sportInfo.conference_id) : null,
        globalSportId: sportInfo.global_sport_id ? parseInt(sportInfo.global_sport_id) : null,
        rosterUrl: sportInfo.roster_id ? `${baseUrl}/api/roster/${sportInfo.roster_id}` : null,
        scheduleUrl: sportInfo.schedule_id ? `${baseUrl}/api/schedule/${sportInfo.schedule_id}` : null
      };
    } catch (error) {
      logger.error('Error getting old Sidearm info:', error.message);
      throw error;
    }
  }
  
  async getSportInfo(baseUrl, sport, version) {
    if (version === 'new') {
      // Step 2: Get roster list to find the latest roster_id
      const rosterListUrl = `${baseUrl}/api/roster?format=json&sport_id=${sport.id}`;
      logger.debug(`Fetching roster list from: ${rosterListUrl}`);
      
      try {
        const rosterListResponse = await axios.get(rosterListUrl);
        
        if (!rosterListResponse.data?.data || rosterListResponse.data.data.length === 0) {
          throw new Error('No rosters found');
        }
        
        // Get the most recent roster (first in array)
        const currentRoster = rosterListResponse.data.data[0];
        logger.debug(`Found current roster:`, currentRoster);
        
        return {
          baseUrl,
          version: 'sidearm_new',
          sportId: sport.id,
          sportTitle: sport.title,
          scheduleId: sport.scheduleId,
          rosterId: currentRoster.roster_id,
          seasonId: currentRoster.season_id,
          seasonTitle: currentRoster.season_title,
          rosterUrl: `${baseUrl}/api/v2/rosters/${currentRoster.roster_id}`,
          scheduleUrl: `${baseUrl}/api/v2/schedule/${sport.scheduleId}`
        };
      } catch (error) {
        // Fallback to basic info if roster details not available
        return {
          baseUrl,
          version: 'sidearm_new',
          sportId: sport.id,
          sportTitle: sport.title,
          scheduleId: sport.scheduleId,
          rosterId: sport.rosterId,
          rosterUrl: sport.rosterId ? `${baseUrl}/api/v2/rosters/${sport.rosterId}` : null,
          scheduleUrl: sport.scheduleId ? `${baseUrl}/api/v2/schedule/${sport.scheduleId}` : null
        };
      }
    }
  }
  
  // This method is no longer needed since old Sidearm sportnames gives us all the info
  // Keeping it for backward compatibility if needed for edge cases
  async getOldSportInfo(baseUrl, sport) {
    const sportInfo = sport.sportInfo || sport;
    
    return {
      baseUrl,
      version: 'sidearm_old',
      sportId: parseInt(sport.sport) || null,
      sportTitle: sportInfo.sport_title || sportInfo.title,
      sportShortName: sportInfo.sport_shortname || sportInfo.shortName,
      rosterId: sportInfo.roster_id ? parseInt(sportInfo.roster_id) : null,
      scheduleId: sportInfo.schedule_id ? parseInt(sportInfo.schedule_id) : null,
      seasonId: sportInfo.season_id ? parseInt(sportInfo.season_id) : null,
      conferenceId: sportInfo.conference_id ? parseInt(sportInfo.conference_id) : null,
      globalSportId: sportInfo.global_sport_id ? parseInt(sportInfo.global_sport_id) : null,
      rosterUrl: sportInfo.roster_id ? `${baseUrl}/api/roster/${sportInfo.roster_id}` : null,
      scheduleUrl: sportInfo.schedule_id ? `${baseUrl}/api/schedule/${sportInfo.schedule_id}` : null
    };
  }
}

module.exports = new SidearmDetector();