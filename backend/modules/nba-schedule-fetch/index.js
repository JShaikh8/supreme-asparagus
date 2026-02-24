const nbaScheduleModule = require('../nba-schedule');

/**
 * NBA Schedule Fetch Module - Adapter for FetchDashboard
 * This is a thin wrapper that delegates to the main nba-schedule module
 */
class NBAScheduleFetchModule {
  constructor() {
    // Use the config from the main module
    this.config = nbaScheduleModule.config;
  }

  /**
   * Fetch NBA schedule for a specific team
   * Delegates to the main nba-schedule module's fetchTeamSchedule method
   * @param {Object} team - Team object with nbaTeamId
   * @param {Object} options - Fetch options
   * @returns {Promise<Array>} Array of ScrapedData documents
   */
  async fetchTeamSchedule(team, options = {}) {
    return await nbaScheduleModule.fetchTeamSchedule(team, options);
  }
}

module.exports = NBAScheduleFetchModule;
