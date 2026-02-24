// backend/services/autoPopulateService.js
const axios = require('axios');
const Team = require('../models/Team');
const logger = require('../utils/logger');

class AutoPopulateService {
  // Map sport names to our schema fields - expanded to cover more sports
  sportMapping = {
    'football': 'football',
    'fb': 'football',               // Old Sidearm shortname for football
    'mbball': 'mensBasketball',
    'mbb': 'mensBasketball',        // Alternate: Ohio State uses "mbb"
    'wbball': 'womensBasketball',
    'wbb': 'womensBasketball',      // Alternate: Ohio State uses "wbb"
    'baseball': 'baseball',
    'bb': 'baseball',               // Old Sidearm shortname for baseball
    'softball': 'softball',
    'sb': 'softball',               // Old Sidearm shortname for softball
    'mvball': 'mensVolleyball',
    'wvball': 'womensVolleyball',
    'wvb': 'womensVolleyball',      // Alternate: Ohio State uses "wvb"
    'vb': 'womensVolleyball',       // Old Sidearm shortname for volleyball
    'msoc': 'mensSoccer',
    'wsoc': 'womensSoccer',
    'mice': 'mensIceHockey',
    'mhockey': 'mensIceHockey',     // Alternate: Ohio State uses "mhockey"
    'wice': 'womensIceHockey',
    'whockey': 'womensIceHockey',   // Alternate: Ohio State uses "whockey"
    // Additional sports from old Sidearm
    'mtrack': 'mensTrack',
    'wtrack': 'womensTrack',
    'mcross': 'mensCrossCountry',
    'mxc': 'mensCrossCountry',      // Alternate: Ohio State uses "mxc"
    'wcross': 'womensCrossCountry',
    'wxc': 'womensCrossCountry',    // Alternate: Ohio State uses "wxc"
    'mgolf': 'mensGolf',
    'wgolf': 'womensGolf',
    'mten': 'mensTennis',
    'wten': 'womensTennis',
    'mlax': 'mensLacrosse',
    'wlax': 'womensLacrosse',       // Old Sidearm shortname for women's lacrosse
    'mgym': 'mensGymnastics',
    'wgym': 'womensGymnastics',
    'mswim': 'mensSwimming',
    'wswim': 'womensSwimming',
    'wrestling': 'wrestling',
    'wwrest': 'womensWrestling'     // Old Sidearm shortname for women's wrestling
  };

  async autoPopulateTeam(teamId) {
    try {
      const team = await Team.findOne({ teamId });
      if (!team) {
        throw new Error('Team not found');
      }

      logger.debug(`Auto-populating ${team.teamName}...`);

      // Detect scrape type if not set
      if (!team.scrapeType || team.scrapeType === 'unknown') {
        const detection = await this.detectScrapeType(team.baseUrl);
        team.scrapeType = detection.scrapeType;
        team.subScrapeType = detection.subScrapeType;
      }

      // Fetch sports data based on scrape type
      if (team.scrapeType === 'sidearm' && team.subScrapeType === 'new') {
        await this.populateSidearmNew(team);
      } else if (team.scrapeType === 'sidearm' && team.subScrapeType === 'old') {
        await this.populateSidearmOld(team);
      } else {
        throw new Error(`Unsupported scrape type: ${team.scrapeType} ${team.subScrapeType}`);
      }

      // Auto-populate Oracle team IDs from statsId (COLLEGE_ID) if available
      if (team.league === 'NCAA' && team.statsId) {
        await this.populateOracleTeamIds(team);
      }

      team.lastAutoPopulate = new Date();
      team.autoPopulateStatus = 'success';
      team.autoPopulateError = null;
      await team.save();

      return {
        success: true,
        team: team.toObject()
      };

    } catch (error) {
      logger.error(`Auto-populate failed for ${teamId}:`, error);
      
      // Update team with error status
      await Team.updateOne(
        { teamId },
        {
          lastAutoPopulate: new Date(),
          autoPopulateStatus: 'failed',
          autoPopulateError: error.message
        }
      );

      return {
        success: false,
        error: error.message
      };
    }
  }

  async detectScrapeType(baseUrl) {
    const cleanUrl = baseUrl.replace(/\/$/, '').replace(/^https?:\/\//, '');
    const url = `https://${cleanUrl}`;

    // FIRST: Check for NEW Sidearm (this was working before)
    try {
      const newSidearmUrl = `${url}/api/v2/sports`;
      const response = await axios.get(newSidearmUrl, { 
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': `${url}/`
        }
      });
      
      if (response.data && Array.isArray(response.data)) {
        logger.debug('Detected: New Sidearm');
        return {
          scrapeType: 'sidearm',
          subScrapeType: 'new'
        };
      }
    } catch (error) {
      logger.debug('Not new Sidearm, checking others...');
    }

    // SECOND: Check for OLD Sidearm using sportnames endpoint
    try {
      const sportNamesUrl = `${url}/api/sportnames`;
      const response = await axios.get(sportNamesUrl, { 
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': `${url}/`
        }
      });
      
      // Check if it's old Sidearm format with sports array
      if (response.data?.sports && Array.isArray(response.data.sports)) {
        logger.debug('Detected: Old Sidearm (sportnames with sports array)');
        return {
          scrapeType: 'sidearm',
          subScrapeType: 'old'
        };
      }
    } catch (error) {
      logger.debug('Not old Sidearm via sportnames');
    }

    // FALLBACK: Check using responsive-sportschedule (original old Sidearm detection)
    try {
      const oldSidearmUrl = `${url}/services/responsive-sportschedule.ashx?format=json`;
      const response = await axios.get(oldSidearmUrl, { 
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      if (response.data) {
        logger.debug('Detected: Old Sidearm (responsive-sportschedule)');
        return {
          scrapeType: 'sidearm',
          subScrapeType: 'old'
        };
      }
    } catch (error) {
      logger.debug('Not old Sidearm either');
    }

    return {
      scrapeType: 'unknown',
      subScrapeType: 'unknown'
    };
  }

  async populateSidearmNew(team) {
    const cleanUrl = team.baseUrl.replace(/\/$/, '').replace(/^https?:\/\//, '');
    const baseUrl = `https://${cleanUrl}`;

    // Fetch all sports with full headers
    const sportsUrl = `${baseUrl}/api/v2/sports`;
    logger.debug(`Fetching sports from: ${sportsUrl}`);
    
    const response = await axios.get(sportsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Referer': `${baseUrl}/`
      }
    });
    
    const sports = response.data;

    if (!Array.isArray(sports)) {
      throw new Error('Invalid sports data received');
    }

    // Initialize ncaaSportsConfig if it doesn't exist
    if (!team.ncaaSportsConfig) {
      team.ncaaSportsConfig = {};
    }

    // Process each sport
    for (const sport of sports) {
      const mappedField = this.sportMapping[sport.shortName];

      if (mappedField) {
        // Get existing config to preserve custom conference/division
        const existingConfig = team.ncaaSportsConfig[mappedField] || {};

        // Create sport config object, preserving custom conference/division/oracleTeamId
        const sportConfig = {
          sportId: sport.id,
          sportTitle: sport.title,
          shortName: sport.shortName,
          abbrev: sport.abbrev,
          rosterId: sport.rosterId,
          scheduleId: sport.scheduleId,
          seasonId: sport.seasonId,
          conferenceId: sport.conferenceId,
          globalSportId: sport.globalSportId,
          lastUpdated: new Date(),
          // PRESERVE custom conference, division, and oracleTeamId if they exist
          conference: existingConfig.conference || '',
          division: existingConfig.division || ''
        };

        // PRESERVE oracleTeamId if it exists
        if (existingConfig.oracleTeamId) {
          sportConfig.oracleTeamId = existingConfig.oracleTeamId;
        }

        // Set nested field
        team.ncaaSportsConfig[mappedField] = sportConfig;

        logger.debug(`Found ${sport.title}: rosterId=${sport.rosterId}, scheduleId=${sport.scheduleId}`);
        if (existingConfig.conference || existingConfig.division) {
          logger.debug(`  Preserved custom settings: conference=${existingConfig.conference}, division=${existingConfig.division}`);
        }
      } else {
        // Log unmapped sports to help identify missing mappings
        logger.debug(`⚠️  Skipped unmapped sport: "${sport.title}" (shortName: "${sport.shortName}")`);
      }
    }
  }

  async populateSidearmOld(team) {
    const cleanUrl = team.baseUrl.replace(/\/$/, '').replace(/^https?:\/\//, '');
    const baseUrl = `https://${cleanUrl}`;

    logger.debug(`Populating OLD Sidearm for ${team.teamName}`);

    // Try to fetch sports list from old Sidearm sportnames endpoint first
    try {
      const sportsUrl = `${baseUrl}/api/sportnames`;
      logger.debug(`Fetching sports from: ${sportsUrl}`);
      
      const response = await axios.get(sportsUrl, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': `${baseUrl}/`
        }
      });
      
      const sportsData = response.data;

      if (sportsData?.sports && Array.isArray(sportsData.sports)) {
        // We have the full sports data with roster IDs!
        return this.populateFromSportNamesData(team, sportsData.sports, baseUrl);
      }
    } catch (error) {
      logger.debug('Could not fetch from sportnames, falling back to basic old Sidearm approach');
    }

    // Fallback: Use basic old Sidearm approach without full sports data
    logger.debug('Using fallback approach for old Sidearm');
    
    // Initialize ncaaSportsConfig if it doesn't exist
    if (!team.ncaaSportsConfig) {
      team.ncaaSportsConfig = {};
    }

    // For old Sidearm without sportnames, we'll need to manually check common sports
    const commonSports = ['football', 'mbball', 'wbball', 'baseball', 'softball', 'wvball'];
    
    for (const sportShortName of commonSports) {
      const mappedField = this.sportMapping[sportShortName];
      if (!mappedField) continue;
      
      try {
        // Try to find roster for this sport
        const rosterCheckUrl = `${baseUrl}/api/roster?sport=${sportShortName}`;
        const rosterResponse = await axios.get(rosterCheckUrl, { timeout: 3000 }).catch(() => null);
        
        if (rosterResponse?.data) {
          // Get existing config to preserve custom settings
          const existingConfig = team.ncaaSportsConfig[mappedField] || {};

          const sportConfig = {
            sportId: null,
            sportTitle: sportShortName,
            shortName: sportShortName,
            abbrev: sportShortName,
            rosterId: null, // Will need to be determined per-sport
            scheduleId: null,
            seasonId: null,
            lastUpdated: new Date(),
            conference: existingConfig.conference || '',
            division: existingConfig.division || ''
          };

          // PRESERVE oracleTeamId if it exists
          if (existingConfig.oracleTeamId) {
            sportConfig.oracleTeamId = existingConfig.oracleTeamId;
          }

          team.ncaaSportsConfig[mappedField] = sportConfig;
          logger.debug(`Found sport: ${sportShortName}`);
        }
      } catch (error) {
        // Sport doesn't exist, continue
      }
    }
    
    logger.debug(`Completed old Sidearm population for ${team.teamName} (fallback method)`);
  }

  async populateFromSportNamesData(team, sports, baseUrl) {
    // Initialize ncaaSportsConfig if it doesn't exist
    if (!team.ncaaSportsConfig) {
      team.ncaaSportsConfig = {};
    }

    // Process each sport from the sportnames response
    for (const sportData of sports) {
      // Extract sport info - it's nested in sportInfo object
      const sportInfo = sportData.sportInfo || sportData;
      
      // Skip non-sports entries
      if (sportInfo.is_not_sport === 'True' || sportInfo.is_not_sport === true) {
        continue;
      }
      
      // Map the sport shortname to our schema field (try shortname first, then global_sport_name as fallback)
      const mappedField = this.sportMapping[sportInfo.sport_shortname] || this.sportMapping[sportInfo.global_sport_name];

      if (mappedField) {
        // Get existing config to preserve custom conference/division
        const existingConfig = team.ncaaSportsConfig[mappedField] || {};
        
        // Create sport config object with all the data from old Sidearm
        const sportConfig = {
          sportId: parseInt(sportData.sport) || null,
          sportTitle: sportInfo.sport_title || '',
          shortName: sportInfo.sport_shortname || '',
          abbrev: sportInfo.sport_abbrev || '',
          rosterId: sportInfo.roster_id ? parseInt(sportInfo.roster_id) : null,
          scheduleId: sportInfo.schedule_id ? parseInt(sportInfo.schedule_id) : null,
          seasonId: sportInfo.season_id ? parseInt(sportInfo.season_id) : null,
          conferenceId: sportInfo.conference_id ? parseInt(sportInfo.conference_id) : null,
          globalSportId: sportInfo.global_sport_id ? parseInt(sportInfo.global_sport_id) : null,
          lastUpdated: new Date(),
          // PRESERVE custom conference, division, and oracleTeamId if they exist
          conference: existingConfig.conference || '',
          division: existingConfig.division || ''
        };

        // PRESERVE oracleTeamId if it exists
        if (existingConfig.oracleTeamId) {
          sportConfig.oracleTeamId = existingConfig.oracleTeamId;
        }

        // Set nested field
        team.ncaaSportsConfig[mappedField] = sportConfig;

        logger.debug(`Found ${sportInfo.sport_title}: rosterId=${sportConfig.rosterId}, scheduleId=${sportConfig.scheduleId}`);
        if (existingConfig.conference || existingConfig.division) {
          logger.debug(`  Preserved custom settings: conference=${existingConfig.conference}, division=${existingConfig.division}`);
        }
      } else {
        // Log unmapped sports to help identify missing mappings
        logger.debug(`⚠️  Skipped unmapped sport: "${sportInfo.sport_title}" (shortName: "${sportInfo.sport_shortname}", globalSportName: "${sportInfo.global_sport_name || ''}")`);
      }
    }

    logger.debug(`Completed old Sidearm population for ${team.teamName}`);
  }

  // Look up Oracle TEAM_ID from COLLEGE_ID (statsId) for each sport that has a config but no oracleTeamId
  async populateOracleTeamIds(team) {
    try {
      const oracleService = require('./oracleService');

      const sportsToLookup = [
        { key: 'football', sport: 'football' },
        { key: 'mensBasketball', sport: 'mensBasketball' },
        { key: 'womensBasketball', sport: 'womensBasketball' }
      ];

      for (const { key, sport } of sportsToLookup) {
        const config = team.ncaaSportsConfig?.[key];
        // Only look up if the sport config exists but oracleTeamId is not set
        if (config && config.sportId && !config.oracleTeamId) {
          try {
            const oracleTeamId = await oracleService.getTeamIdFromCollegeId(team.statsId, sport);
            if (oracleTeamId) {
              team.ncaaSportsConfig[key].oracleTeamId = oracleTeamId;
              logger.debug(`✅ Found Oracle TEAM_ID ${oracleTeamId} for ${team.teamName} ${sport} (college_id: ${team.statsId})`);
            } else {
              logger.debug(`⚠️  No Oracle TEAM_ID found for ${team.teamName} ${sport} (college_id: ${team.statsId})`);
            }
          } catch (lookupError) {
            // Oracle might be unavailable (no VPN) - don't fail the whole auto-populate
            if (lookupError.code === 'ORACLE_UNAVAILABLE') {
              logger.debug(`⚠️  Oracle unavailable for team ID lookup - skipping Oracle IDs for ${team.teamName}`);
              break; // No point trying other sports if Oracle is down
            }
            logger.debug(`⚠️  Oracle lookup failed for ${team.teamName} ${sport}: ${lookupError.message}`);
          }
        }
      }
    } catch (error) {
      // Don't fail auto-populate if Oracle lookup fails entirely
      logger.debug(`⚠️  Oracle team ID population skipped: ${error.message}`);
    }
  }

  async autoPopulateBulk(teamIds) {
    const results = [];
    
    for (const teamId of teamIds) {
      try {
        const result = await this.autoPopulateTeam(teamId);
        results.push({
          teamId,
          ...result
        });
      } catch (error) {
        results.push({
          teamId,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  async autoPopulateAllNCAA() {
    const teams = await Team.find({ league: 'NCAA', active: true });
    const teamIds = teams.map(t => t.teamId);
    return this.autoPopulateBulk(teamIds);
  }
}

module.exports = new AutoPopulateService();