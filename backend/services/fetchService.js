// backend/services/fetchService.js
const ScrapedData = require('../models/ScrapedData');
const Team = require('../models/Team');
const scrapeRoster = require('../scrapers/rosterScraper'); // Your existing scraper
const logger = require('../utils/logger');

async function fetchTeamData(teamId, moduleId) {
  const team = await Team.findOne({ teamId });
  if (!team) throw new Error('Team not found');

  // Use your existing scraping logic
  const data = await scrapeRoster(team.rosterUrl);

  // Delete all existing data for this team/module before inserting fresh data
  const deleteResult = await ScrapedData.deleteMany({ teamId, moduleId });
  logger.debug(`Deleted ${deleteResult.deletedCount} old records for ${teamId} ${moduleId}`);

  // Save fresh data to database
  for (const player of data) {
    await ScrapedData.findOneAndUpdate(
      { teamId, moduleId, 'data.id': player.id },
      { teamId, moduleId, data: player },
      { upsert: true }
    );
  }

  logger.debug(`Inserted ${data.length} fresh records for ${teamId} ${moduleId}`);

  return { count: data.length, deletedOld: deleteResult.deletedCount };
}

module.exports = { fetchTeamData };