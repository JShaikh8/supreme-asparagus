#!/usr/bin/env node
// backend/scripts/nba/scrape-historical-boxscores.js
/**
 * Scrape NBA historical box scores to extract player minutes and stats
 * This is the CRITICAL script - it gets our target variable (minutes per game)
 *
 * Usage:
 *   node backend/scripts/nba/scrape-historical-boxscores.js
 *   node backend/scripts/nba/scrape-historical-boxscores.js --season 2023-24
 *   node backend/scripts/nba/scrape-historical-boxscores.js --limit 100
 *   node backend/scripts/nba/scrape-historical-boxscores.js --resume
 */

const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

// Models
const NBAGame = require('../../models/NBAGame');
const NBAPlayerGameLog = require('../../models/NBAPlayerGameLog');
const NBAInjuryReport = require('../../models/NBAInjuryReport');

// Utilities
const { parseMinutes } = require('../../utils/nba/parseMinutes');
const { RateLimiter, retryWithBackoff } = require('../../utils/nba/rateLimiter');
const { calculateDaysRest } = require('../../utils/nba/seasonHelper');

// Rate limiter: 2 requests per second (conservative)
const rateLimiter = new RateLimiter(2);

// Parse command line arguments
const args = process.argv.slice(2);
const seasonArg = args.find(arg => arg.startsWith('--season='))?.split('=')[1];
const limitArg = args.find(arg => arg.startsWith('--limit='))?.split('=')[1];
const resumeArg = args.includes('--resume');

const limit = limitArg ? parseInt(limitArg) : null;

console.log(`\n=æ Scraping NBA box scores for player minutes\n`);
if (seasonArg) console.log(`   Season: ${seasonArg}`);
if (limit) console.log(`   Limit: ${limit} games`);
if (resumeArg) console.log(`   Mode: Resume (skip already processed games)`);
console.log();

/**
 * Fetch box score for a single game
 * @param {string} gameId - NBA game ID
 * @returns {Promise<Object>} - Box score data
 */
async function fetchBoxScore(gameId) {
  const url = `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${gameId}.json`;

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

    return response.data;

  } catch (error) {
    // 404 means game hasn't happened yet or box score not available
    if (error.response?.status === 404) {
      return null;
    }

    console.error(`    L Error fetching box score for ${gameId}:`, error.message);
    throw error;
  }
}

/**
 * Process a single player's box score data
 * @param {Object} playerData - Player data from box score API
 * @param {Object} gameInfo - Game information
 * @returns {Object} - Processed player game log
 */
function processPlayerData(playerData, gameInfo) {
  const { gameId, gameDate, season, teamId, teamTricode, opponentId, opponentTricode, isHome } = gameInfo;

  // Parse minutes
  const minutes = parseMinutes(playerData.statistics?.minutes || playerData.statistics?.minutesCalculated);

  // Check if player played
  const played = playerData.played === "1" || minutes > 0;

  // Build game log
  const gameLog = {
    gameLogId: `${gameId}_${playerData.personId}`,
    gameId,
    playerId: playerData.personId,
    playerName: playerData.name || `${playerData.firstName} ${playerData.familyName}`,
    firstName: playerData.firstName,
    lastName: playerData.familyName || playerData.lastName,

    teamId,
    teamTricode,
    opponentId,
    opponentTricode,

    gameDate,
    season,
    isHome,

    isStarter: playerData.starter === "1",
    position: playerData.position,
    jerseyNum: playerData.jerseyNum,

    minutes,
    minutesRaw: playerData.statistics?.minutes || playerData.statistics?.minutesCalculated,

    played,
    status: playerData.status,

    // Injury/DNP status
    didNotPlay: !played,
    notPlayingReason: playerData.notPlayingReason || null,
    notPlayingDescription: playerData.notPlayingDescription || null,

    // Box score stats
    points: playerData.statistics?.points || 0,
    assists: playerData.statistics?.assists || 0,
    rebounds: playerData.statistics?.reboundsTotal || 0,
    reboundsOffensive: playerData.statistics?.reboundsOffensive || 0,
    reboundsDefensive: playerData.statistics?.reboundsDefensive || 0,
    steals: playerData.statistics?.steals || 0,
    blocks: playerData.statistics?.blocks || 0,
    turnovers: playerData.statistics?.turnovers || 0,

    fieldGoalsMade: playerData.statistics?.fieldGoalsMade || 0,
    fieldGoalsAttempted: playerData.statistics?.fieldGoalsAttempted || 0,
    fieldGoalsPercentage: playerData.statistics?.fieldGoalsPercentage || 0,

    threePointersMade: playerData.statistics?.threePointersMade || 0,
    threePointersAttempted: playerData.statistics?.threePointersAttempted || 0,
    threePointersPercentage: playerData.statistics?.threePointersPercentage || 0,

    freeThrowsMade: playerData.statistics?.freeThrowsMade || 0,
    freeThrowsAttempted: playerData.statistics?.freeThrowsAttempted || 0,
    freeThrowsPercentage: playerData.statistics?.freeThrowsPercentage || 0,

    plusMinus: playerData.statistics?.plusMinusPoints || 0,
    foulsPersonal: playerData.statistics?.foulsPersonal || 0,
    foulsDrawn: playerData.statistics?.foulsDrawn || 0,

    pointsInThePaint: playerData.statistics?.pointsInThePaint || 0,
    pointsFastBreak: playerData.statistics?.pointsFastBreak || 0,
    pointsSecondChance: playerData.statistics?.pointsSecondChance || 0,

    dataSource: 'nba_boxscore_api',
    processed: true
  };

  return gameLog;
}

/**
 * Process box score and save player game logs
 * @param {Object} boxScore - Box score data from API
 * @param {Object} game - Game document from MongoDB
 * @returns {Promise<number>} - Number of player logs saved
 */
async function processBoxScore(boxScore, game) {
  if (!boxScore || !boxScore.game) {
    return 0;
  }

  const gameData = boxScore.game;
  let savedCount = 0;

  // Process home team players
  if (gameData.homeTeam && gameData.homeTeam.players) {
    for (const player of gameData.homeTeam.players) {
      const gameInfo = {
        gameId: game.gameId,
        gameDate: game.gameDate,
        season: game.season,
        teamId: gameData.homeTeam.teamId,
        teamTricode: gameData.homeTeam.teamTricode,
        opponentId: gameData.awayTeam.teamId,
        opponentTricode: gameData.awayTeam.teamTricode,
        isHome: true
      };

      const playerLog = processPlayerData(player, gameInfo);

      // Add team scores
      playerLog.teamScore = gameData.homeTeam.score;
      playerLog.opponentScore = gameData.awayTeam.score;
      playerLog.teamWon = gameData.homeTeam.score > gameData.awayTeam.score;

      // Save to MongoDB
      await NBAPlayerGameLog.findOneAndUpdate(
        { gameLogId: playerLog.gameLogId },
        playerLog,
        { upsert: true, new: true }
      );

      // Save injury report if player didn't play
      if (playerLog.notPlayingReason) {
        await saveInjuryReport(playerLog);
      }

      savedCount++;
    }
  }

  // Process away team players
  if (gameData.awayTeam && gameData.awayTeam.players) {
    for (const player of gameData.awayTeam.players) {
      const gameInfo = {
        gameId: game.gameId,
        gameDate: game.gameDate,
        season: game.season,
        teamId: gameData.awayTeam.teamId,
        teamTricode: gameData.awayTeam.teamTricode,
        opponentId: gameData.homeTeam.teamId,
        opponentTricode: gameData.homeTeam.teamTricode,
        isHome: false
      };

      const playerLog = processPlayerData(player, gameInfo);

      // Add team scores
      playerLog.teamScore = gameData.awayTeam.score;
      playerLog.opponentScore = gameData.homeTeam.score;
      playerLog.teamWon = gameData.awayTeam.score > gameData.homeTeam.score;

      // Save to MongoDB
      await NBAPlayerGameLog.findOneAndUpdate(
        { gameLogId: playerLog.gameLogId },
        playerLog,
        { upsert: true, new: true }
      );

      // Save injury report if player didn't play
      if (playerLog.notPlayingReason) {
        await saveInjuryReport(playerLog);
      }

      savedCount++;
    }
  }

  // Mark game as processed
  game.boxscoreProcessed = true;
  await game.save();

  return savedCount;
}

/**
 * Save injury report from player game log
 * @param {Object} playerLog - Player game log
 */
async function saveInjuryReport(playerLog) {
  try {
    const injuryReport = {
      playerId: playerLog.playerId,
      playerName: playerLog.playerName,
      teamId: playerLog.teamId,
      teamTricode: playerLog.teamTricode,
      reportDate: playerLog.gameDate,
      gameId: playerLog.gameId,
      gameDate: playerLog.gameDate,
      status: 'Out',
      reason: playerLog.notPlayingReason,
      description: playerLog.notPlayingDescription,
      source: 'nba_boxscore'
    };

    await NBAInjuryReport.findOneAndUpdate(
      {
        playerId: playerLog.playerId,
        gameId: playerLog.gameId
      },
      injuryReport,
      { upsert: true }
    );

  } catch (error) {
    console.error(`       Error saving injury report:`, error.message);
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

    // Build query for games to process
    const query = { gameStatus: 3 }; // Only final games

    if (seasonArg) {
      query.season = seasonArg;
    }

    if (resumeArg) {
      query.boxscoreProcessed = { $ne: true };
    }

    // Get games to process
    const games = await NBAGame.find(query)
      .sort({ gameDate: 1 })
      .limit(limit || 0);

    console.log(`=Ê Found ${games.length} games to process\n`);

    let processedGames = 0;
    let totalPlayerLogs = 0;
    let errors = 0;

    // Process each game
    for (let i = 0; i < games.length; i++) {
      const game = games[i];

      try {
        console.log(`[${i + 1}/${games.length}] Processing ${game.gameId} (${game.awayTeam.teamTricode} @ ${game.homeTeam.teamTricode}) on ${game.gameDate.toISOString().split('T')[0]}...`);

        const boxScore = await fetchBoxScore(game.gameId);

        if (!boxScore) {
          console.log(`       Box score not available (game may not have finished)`);
          continue;
        }

        const savedCount = await processBoxScore(boxScore, game);
        totalPlayerLogs += savedCount;
        processedGames++;

        console.log(`     Saved ${savedCount} player logs`);

        // Progress checkpoint every 50 games
        if ((i + 1) % 50 === 0) {
          console.log(`\n    =Ê Progress: ${i + 1}/${games.length} games, ${totalPlayerLogs} player logs\n`);
        }

      } catch (error) {
        console.error(`    L Error processing ${game.gameId}:`, error.message);
        errors++;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('=Ê BOX SCORE SCRAPING SUMMARY');
    console.log('='.repeat(60));
    console.log(`Games processed:      ${processedGames}`);
    console.log(`Player logs saved:    ${totalPlayerLogs}`);
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

module.exports = { fetchBoxScore, processBoxScore };
