const mlbScheduleModule = require('../mlb-schedule');

/**
 * MLB Schedule Fetch Module - Adapter for FetchDashboard
 * This is a thin wrapper that delegates to the main mlb-schedule module
 */
class MLBScheduleFetchModule {
  constructor() {
    // Use the config from the main module
    this.config = mlbScheduleModule.config;
  }

  /**
   * Fetch MLB schedule for a specific team
   * Delegates to the main mlb-schedule module's fetchTeamSchedule method
   * @param {Object} team - Team object with mlbId
   * @param {Object} options - Fetch options
   * @returns {Promise<Array>} Array of ScrapedData documents
   */
  async fetchTeamSchedule(team, options = {}) {
    return await mlbScheduleModule.fetchTeamSchedule(team, options);
  }
}

module.exports = MLBScheduleFetchModule;
