#!/usr/bin/env node
// backend/scripts/nba/scrape-historical-schedules.js
/**
 * Scrape NBA historical schedules from 2021-2024 seasons
 * Uses NBA's mobile schedule API
 *
 * Usage:
 *   node backend/scripts/nba/scrape-historical-schedules.js
 *   node backend/scripts/nba/scrape-historical-schedules.js --season 2023-24
 *   node backend/scripts/nba/scrape-historical-schedules.js --from 2021-22 --to 2023-24
 */

const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

// Models
const NBAGame = require('../../models/NBAGame');

// Utilities
const { yearToSeason, seasonToYears, getSeasonRange } = require('../../utils/nba/seasonHelper');
const { RateLimiter, retryWithBackoff } = require('../../utils/nba/rateLimiter');

// Rate limiter: 2 requests per second
const rateLimiter = new RateLimiter(2);

// Parse command line arguments
const args = process.argv.slice(2);
const seasonArg = args.find(arg => arg.startsWith('--season='));
const fromArg = args.find(arg => arg.startsWith('--from='));
const toArg = args.find(arg => arg.startsWith('--to='));

let seasonsToScrape;

if (seasonArg) {
  // Single season
  seasonsToScrape = [seasonArg.split('=')[1]];
} else if (fromArg && toArg) {
  // Range of seasons
  const fromSeason = fromArg.split('=')[1];
  const toSeason = toArg.split('=')[1];
  seasonsToScrape = getSeasonRange(fromSeason, toSeason);
} else {
  // Default: all 4 seasons
  seasonsToScrape = ['2021-22', '2022-23', '2023-24', '2024-25'];
}

console.log(`\n=Å Scraping NBA schedules for seasons: ${seasonsToScrape.join(', ')}\n`);

/**
 * Fetch schedule for a single season
 * @param {string} season - Season in format "2023-24"
 * @returns {Promise<Array>} - Array of games
 */
async function fetchScheduleForSeason(season) {
  const { startYear } = seasonToYears(season);

  // NBA API URL format:
  // https://data.nba.com/data/10s/v2015/json/mobile_teams/nba/2023/league/00_full_schedule.json
  const url = `https://data.nba.com/data/10s/v2015/json/mobile_teams/nba/${startYear}/league/00_full_schedule.json`;

  console.log(`  Fetching ${season} schedule from: ${url}`);

  try {
    const response = await rateLimiter.execute(async () => {
      return await retryWithBackoff(async () => {
        return await axios.get(url, {
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json'
          }
        });
      });
    });

    // Parse response
    const data = response.data;

    if (!data.lscd || !Array.isArray(data.lscd)) {
      console.warn(`     No schedule data found for ${season}`);
      return [];
    }

    // Extract all games from all months
    const games = [];

    data.lscd.forEach(monthData => {
      if (monthData.mscd && monthData.mscd.g && Array.isArray(monthData.mscd.g)) {
        monthData.mscd.g.forEach(game => {
          games.push({
            ...game,
            season,
            month: monthData.mscd.mon
          });
        });
      }
    });

    console.log(`   Found ${games.length} games for ${season}`);
    return games;

  } catch (error) {
    console.error(`  L Error fetching ${season} schedule:`, error.message);
    return [];
  }
}

/**
 * Parse and save a single game to MongoDB
 * @param {Object} gameData - Raw game data from API
 * @returns {Promise<Object>} - Saved game document
 */
async function saveGame(gameData) {
  const gameId = gameData.gid;

  try {
    // Check if game already exists
    let game = await NBAGame.findOne({ gameId });

    const gameDoc = {
      gameId,
      gameDate: new Date(gameData.gdte),
      season: gameData.season,
      gameCode: gameData.gcode,
      gameStatus: parseInt(gameData.st) || 1,
      gameStatusText: gameData.stt || 'Scheduled',

      arenaName: gameData.an,
      arenaCity: gameData.ac,
      arenaState: gameData.as,

      homeTeam: {
        teamId: gameData.h.tid,
        teamName: gameData.h.tn,
        teamCity: gameData.h.tc,
        teamTricode: gameData.h.ta,
        score: parseInt(gameData.h.s) || 0
      },

      awayTeam: {
        teamId: gameData.v.tid,
        teamName: gameData.v.tn,
        teamCity: gameData.v.tc,
        teamTricode: gameData.v.ta,
        score: parseInt(gameData.v.s) || 0
      }
    };

    if (game) {
      // Update existing game
      Object.assign(game, gameDoc);
      await game.save();
    } else {
      // Create new game
      game = await NBAGame.create(gameDoc);
    }

    return game;

  } catch (error) {
    console.error(`  L Error saving game ${gameId}:`, error.message);
    throw error;
  }
}

/**
 * Main scraping function
 */
async function main() {
  try {
    // Connect to MongoDB
    console.log('= Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(' Connected to MongoDB\n');

    let totalGames = 0;
    let savedGames = 0;
    let errors = 0;

    // Scrape each season
    for (const season of seasonsToScrape) {
      console.log(`\n=Å Processing ${season} season...`);

      const games = await fetchScheduleForSeason(season);
      totalGames += games.length;

      // Save each game
      for (let i = 0; i < games.length; i++) {
        const game = games[i];

        try {
          await saveGame(game);
          savedGames++;

          // Progress indicator
          if ((i + 1) % 100 === 0) {
            console.log(`    Processed ${i + 1}/${games.length} games...`);
          }
        } catch (error) {
          errors++;
        }
      }

      console.log(`   Saved ${games.length} games for ${season}`);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('=Ê SCRAPING SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total games found:    ${totalGames}`);
    console.log(`Successfully saved:   ${savedGames}`);
    console.log(`Errors:               ${errors}`);
    console.log('='.repeat(60) + '\n');

    // Disconnect
    await mongoose.disconnect();
    console.log(' Done! MongoDB connection closed.\n');

    process.exit(0);

  } catch (error) {
    console.error('\nL Fatal error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { fetchScheduleForSeason, saveGame };
