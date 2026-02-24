#!/usr/bin/env node
// backend/scripts/nba/calculate-rolling-averages.js
/**
 * Calculate rolling averages and season statistics for all players
 * This creates the NBAPlayerSeasonStats collection used for projections
 *
 * Usage:
 *   node backend/scripts/nba/calculate-rolling-averages.js
 *   node backend/scripts/nba/calculate-rolling-averages.js --season 2023-24
 *   node backend/scripts/nba/calculate-rolling-averages.js --player-id 201939
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Models
const NBAPlayerGameLog = require('../../models/NBAPlayerGameLog');
const NBAPlayerSeasonStats = require('../../models/NBAPlayerSeasonStats');

// Parse command line arguments
const args = process.argv.slice(2);
const seasonArg = args.find(arg => arg.startsWith('--season='))?.split('=')[1];
const playerIdArg = args.find(arg => arg.startsWith('--player-id='))?.split('=')[1];

console.log(`\n=Ê Calculating rolling averages and season statistics\n`);
if (seasonArg) console.log(`   Season: ${seasonArg}`);
if (playerIdArg) console.log(`   Player ID: ${playerIdArg}`);
console.log();

/**
 * Calculate average for a stat across game logs
 */
function calculateAverage(gameLogs, stat) {
  if (gameLogs.length === 0) return 0;

  const sum = gameLogs.reduce((acc, log) => acc + (log[stat] || 0), 0);
  return parseFloat((sum / gameLogs.length).toFixed(2));
}

/**
 * Calculate standard deviation for a stat
 */
function calculateStdDev(gameLogs, stat) {
  if (gameLogs.length === 0) return 0;

  const avg = calculateAverage(gameLogs, stat);
  const squaredDiffs = gameLogs.map(log => {
    const diff = (log[stat] || 0) - avg;
    return diff * diff;
  });

  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / gameLogs.length;
  return parseFloat(Math.sqrt(variance).toFixed(2));
}

/**
 * Calculate rolling stats (last N games)
 */
function calculateRollingStats(gameLogs, n) {
  const recentGames = gameLogs.slice(0, n);

  if (recentGames.length === 0) {
    return null;
  }

  return {
    games: recentGames.length,
    minutes: calculateAverage(recentGames, 'minutes'),
    minutesStdDev: calculateStdDev(recentGames, 'minutes'),
    points: calculateAverage(recentGames, 'points'),
    assists: calculateAverage(recentGames, 'assists'),
    rebounds: calculateAverage(recentGames, 'rebounds'),
    fieldGoalsPercentage: calculateAverage(recentGames, 'fieldGoalsPercentage'),
    threePointersPercentage: calculateAverage(recentGames, 'threePointersPercentage'),
    plusMinus: calculateAverage(recentGames, 'plusMinus')
  };
}

/**
 * Calculate split stats (home/away, starter/bench, etc.)
 */
function calculateSplitStats(gameLogs) {
  const splits = {
    home: gameLogs.filter(g => g.isHome),
    away: gameLogs.filter(g => !g.isHome),
    backToBack: gameLogs.filter(g => g.isBackToBack),
    rested: gameLogs.filter(g => !g.isBackToBack && g.daysRest >= 2),
    starter: gameLogs.filter(g => g.isStarter),
    bench: gameLogs.filter(g => !g.isStarter)
  };

  const result = {};

  for (const [key, logs] of Object.entries(splits)) {
    if (logs.length > 0) {
      result[`${key}Splits`] = {
        games: logs.length,
        minutes: calculateAverage(logs, 'minutes'),
        points: calculateAverage(logs, 'points')
      };
    } else {
      result[`${key}Splits`] = { games: 0, minutes: 0, points: 0 };
    }
  }

  return result;
}

/**
 * Calculate monthly trend
 */
function calculateMonthlyTrend(gameLogs) {
  const monthlyData = {};

  gameLogs.forEach(log => {
    const month = new Date(log.gameDate).toLocaleString('en-US', { month: 'long' });

    if (!monthlyData[month]) {
      monthlyData[month] = {
        games: 0,
        totalMinutes: 0
      };
    }

    monthlyData[month].games++;
    monthlyData[month].totalMinutes += log.minutes;
  });

  const monthlyTrend = Object.entries(monthlyData).map(([month, data]) => ({
    month,
    games: data.games,
    averageMinutes: parseFloat((data.totalMinutes / data.games).toFixed(2))
  }));

  return monthlyTrend;
}

/**
 * Calculate minutes distribution
 */
function calculateMinutesDistribution(gameLogs) {
  const total = gameLogs.length;
  if (total === 0) return null;

  const under20 = gameLogs.filter(g => g.minutes < 20).length;
  const from20to30 = gameLogs.filter(g => g.minutes >= 20 && g.minutes < 30).length;
  const from30to35 = gameLogs.filter(g => g.minutes >= 30 && g.minutes < 35).length;
  const over35 = gameLogs.filter(g => g.minutes >= 35).length;

  return {
    under20: parseFloat((under20 / total * 100).toFixed(1)),
    from20to30: parseFloat((from20to30 / total * 100).toFixed(1)),
    from30to35: parseFloat((from30to35 / total * 100).toFixed(1)),
    over35: parseFloat((over35 / total * 100).toFixed(1))
  };
}

/**
 * Calculate season stats for a single player
 */
async function calculatePlayerSeasonStats(playerId, season) {
  // Get all game logs for this player in this season (played games only)
  const gameLogs = await NBAPlayerGameLog.find({
    playerId,
    season,
    played: true
  }).sort({ gameDate: -1 }); // Most recent first

  if (gameLogs.length === 0) {
    return null;
  }

  const firstLog = gameLogs[0]; // Most recent game
  const allLogs = gameLogs.reverse(); // Chronological order for calculations

  // Season averages
  const gamesPlayed = allLogs.length;
  const gamesStarted = allLogs.filter(g => g.isStarter).length;

  const seasonStats = {
    statsId: `${playerId}_${season}`,
    playerId,
    playerName: firstLog.playerName,
    season,
    teamId: firstLog.teamId,
    teamTricode: firstLog.teamTricode,
    position: firstLog.position,

    gamesPlayed,
    gamesStarted,

    // Season averages
    minutesPerGame: calculateAverage(allLogs, 'minutes'),
    pointsPerGame: calculateAverage(allLogs, 'points'),
    assistsPerGame: calculateAverage(allLogs, 'assists'),
    reboundsPerGame: calculateAverage(allLogs, 'rebounds'),
    stealsPerGame: calculateAverage(allLogs, 'steals'),
    blocksPerGame: calculateAverage(allLogs, 'blocks'),
    turnoversPerGame: calculateAverage(allLogs, 'turnovers'),

    fieldGoalsPercentage: calculateAverage(allLogs, 'fieldGoalsPercentage'),
    threePointersPercentage: calculateAverage(allLogs, 'threePointersPercentage'),
    freeThrowsPercentage: calculateAverage(allLogs, 'freeThrowsPercentage'),

    plusMinusPerGame: calculateAverage(allLogs, 'plusMinus'),

    // Rolling averages (using chronological order, then reverse to get last N)
    last3Games: calculateRollingStats(gameLogs, 3),
    last5Games: calculateRollingStats(gameLogs, 5),
    last10Games: calculateRollingStats(gameLogs, 10),
    last15Games: calculateRollingStats(gameLogs, 15),
    last20Games: calculateRollingStats(gameLogs, 20),

    // Splits
    ...calculateSplitStats(allLogs),

    // Monthly trend
    monthlyMinutesTrend: calculateMonthlyTrend(allLogs),

    // Consistency metrics
    minutesStdDev: calculateStdDev(allLogs, 'minutes'),
    minutesRange: {
      min: Math.min(...allLogs.map(g => g.minutes)),
      max: Math.max(...allLogs.map(g => g.minutes))
    },

    // Minutes distribution
    minutesDistribution: calculateMinutesDistribution(allLogs),

    // Role metrics
    starterRate: parseFloat((gamesStarted / gamesPlayed * 100).toFixed(1)),
    dnpRate: 0, // Could calculate from all logs including DNPs

    // Games missed (from total possible games)
    gamesMissed: 0, // Would need to calculate from team schedule

    // Flags
    injuryProne: false, // Could set based on games missed
    loadManagementCandidate: false, // Could set based on back-to-back patterns

    // Last game info
    lastGameDate: firstLog.gameDate,
    lastGameMinutes: firstLog.minutes,

    // Metadata
    lastCalculated: new Date(),
    gamesProcessed: gamesPlayed
  };

  return seasonStats;
}

/**
 * Main calculation function
 */
async function main() {
  try {
    // Connect to MongoDB
    console.log('= Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(' Connected to MongoDB\n');

    let query = {};

    if (seasonArg) {
      query.season = seasonArg;
    }

    if (playerIdArg) {
      query.playerId = parseInt(playerIdArg);
    }

    // Get unique player-season combinations
    const playerSeasons = await NBAPlayerGameLog.aggregate([
      { $match: { ...query, played: true } },
      {
        $group: {
          _id: { playerId: '$playerId', season: '$season' },
          playerName: { $first: '$playerName' },
          gamesPlayed: { $sum: 1 }
        }
      },
      { $sort: { 'gamesPlayed': -1 } }
    ]);

    console.log(`=Ê Found ${playerSeasons.length} player-season combinations to process\n`);

    let processed = 0;
    let errors = 0;

    // Process each player-season
    for (let i = 0; i < playerSeasons.length; i++) {
      const { playerId, season } = playerSeasons[i]._id;
      const playerName = playerSeasons[i].playerName;

      try {
        console.log(`[${i + 1}/${playerSeasons.length}] ${playerName} (${season})...`);

        const stats = await calculatePlayerSeasonStats(playerId, season);

        if (stats) {
          await NBAPlayerSeasonStats.findOneAndUpdate(
            { statsId: stats.statsId },
            stats,
            { upsert: true }
          );

          processed++;
        }

        // Progress checkpoint
        if ((i + 1) % 50 === 0) {
          console.log(`\n    =Ê Progress: ${i + 1}/${playerSeasons.length} processed\n`);
        }

      } catch (error) {
        console.error(`    L Error processing ${playerName} (${season}):`, error.message);
        errors++;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('=Ê ROLLING AVERAGES CALCULATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Player-seasons processed: ${processed}`);
    console.log(`Errors:                   ${errors}`);
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

module.exports = { calculatePlayerSeasonStats, calculateRollingStats };
