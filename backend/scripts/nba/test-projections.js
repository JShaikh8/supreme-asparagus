#!/usr/bin/env node
// backend/scripts/nba/test-projections.js
/**
 * Test the Minutes Projection Engine
 *
 * Usage:
 *   node backend/scripts/nba/test-projections.js --player="LeBron James" --season=2024-25
 *   node backend/scripts/nba/test-projections.js --team=LAL --season=2025-26
 *   node backend/scripts/nba/test-projections.js --team=LAL --season=2025-26 --date=2025-10-20
 *   node backend/scripts/nba/test-projections.js --playerId=2544 --season=2024-25
 *
 * Options:
 *   --player      Player name (e.g., "LeBron James")
 *   --playerId    Player ID (e.g., 2544)
 *   --team        Team tricode (e.g., LAL)
 *   --season      Season (e.g., 2025-26) [default: 2024-25]
 *   --date        Projection date (e.g., 2025-10-20) [default: today]
 */

const mongoose = require('mongoose');
require('dotenv').config();

const projectionEngine = require('../../services/nba/MinutesProjectionEngine');
const NBAPlayerSeasonStats = require('../../models/NBAPlayerSeasonStats');
const NBAGame = require('../../models/NBAGame');

// Parse command line arguments
const args = process.argv.slice(2);
const playerName = args.find(arg => arg.startsWith('--player='))?.split('=')[1];
const teamTricode = args.find(arg => arg.startsWith('--team='))?.split('=')[1];
const playerId = args.find(arg => arg.startsWith('--playerId='))?.split('=')[1];
const season = args.find(arg => arg.startsWith('--season='))?.split('=')[1] || '2024-25';
const dateArg = args.find(arg => arg.startsWith('--date='))?.split('=')[1];

// Parse date or use today
const projectionDate = dateArg ? new Date(dateArg) : new Date();

console.log('\n=🔮 NBA Minutes Projection Engine - Test Mode\n');
if (dateArg) {
  console.log(`📅 Projection Date: ${projectionDate.toISOString().split('T')[0]}\n`);
}

/**
 * Find player by name
 */
async function findPlayerByName(name, season) {
  const player = await NBAPlayerSeasonStats.findOne({
    playerName: new RegExp(name, 'i'),
    season
  });

  return player;
}

/**
 * Get team ID from tricode
 */
async function getTeamIdFromTricode(tricode) {
  const game = await NBAGame.findOne({
    $or: [
      { 'homeTeam.teamTricode': tricode },
      { 'awayTeam.teamTricode': tricode }
    ]
  });

  if (!game) return null;

  return game.homeTeam.teamTricode === tricode ?
    game.homeTeam.teamId :
    game.awayTeam.teamId;
}

/**
 * Test single player projection
 */
async function testPlayerProjection() {
  let player;

  if (playerId) {
    player = await NBAPlayerSeasonStats.findOne({
      playerId: parseInt(playerId),
      season
    });
  } else if (playerName) {
    player = await findPlayerByName(playerName, season);
  }

  if (!player) {
    console.log('❌ Player not found\n');
    return;
  }

  console.log(`📊 Player: ${player.playerName}`);
  console.log(`   Team: ${player.teamTricode}`);
  console.log(`   Season: ${season}`);
  console.log(`   Games Played: ${player.gamesPlayed}`);
  console.log(`   Season Avg: ${player.minutesPerGame} MPG\n`);

  // Test different scenarios
  const scenarios = [
    {
      name: 'Home Game - 2 Days Rest',
      isHome: true,
      daysRest: 2,
      injuredTeammates: []
    },
    {
      name: 'Away Game - Back-to-Back',
      isHome: false,
      daysRest: 0,
      injuredTeammates: []
    },
    {
      name: 'Home Game - 3+ Days Rest',
      isHome: true,
      daysRest: 4,
      injuredTeammates: []
    },
    {
      name: 'Away Game - 1 Teammate Injured',
      isHome: false,
      daysRest: 1,
      injuredTeammates: [999999] // Fake injured teammate
    },
    {
      name: 'Home Game - 2 Teammates Injured',
      isHome: true,
      daysRest: 2,
      injuredTeammates: [999999, 999998] // Fake injured teammates
    }
  ];

  console.log('=⚡ Testing Different Scenarios:\n');

  for (const scenario of scenarios) {
    const projection = await projectionEngine.projectMinutes({
      playerId: player.playerId,
      teamId: player.teamId,
      season,
      ...scenario
    });

    if (projection.success) {
      console.log(`📌 ${scenario.name}`);
      console.log(`   Projected: ${projection.projectedMinutes} minutes`);
      console.log(`   Confidence: ${(projection.confidence * 100).toFixed(1)}% (${projection.confidenceLevel})`);
      console.log(`   Baseline: ${projection.breakdown.baselineMinutes} min`);

      if (projection.breakdown.adjustments.length > 0) {
        console.log(`   Adjustments:`);
        projection.breakdown.adjustments.forEach(adj => {
          const sign = adj.value >= 0 ? '+' : '';
          console.log(`     ${sign}${adj.value} min - ${adj.reason}`);
        });
      }
      console.log();
    } else {
      console.log(`   ❌ Error: ${projection.error}\n`);
    }
  }
}

/**
 * Test team projection
 */
async function testTeamProjection() {
  const teamId = await getTeamIdFromTricode(teamTricode);

  if (!teamId) {
    console.log('❌ Team not found\n');
    return;
  }

  console.log(`📊 Team: ${teamTricode}`);
  console.log(`   Season: ${season}`);
  console.log(`   Projection Date: ${projectionDate.toISOString().split('T')[0]}\n`);

  const gameContext = {
    isHome: true,
    daysRest: 2,
    gameDate: projectionDate,
    opponentId: null
  };

  console.log('=⚡ Projecting Team Minutes (Home Game, 2 Days Rest):\n');

  const teamProjection = await projectionEngine.projectTeamMinutes(
    teamId,
    season,
    gameContext
  );

  if (teamProjection.success) {
    console.log('=📋 Projected Rotation:\n');

    // Show top 12 players
    const rotation = teamProjection.projections
      .filter(p => p.status === 'ACTIVE')
      .slice(0, 12);

    rotation.forEach((proj, idx) => {
      const starter = proj.context.isStarter ? '⭐' : '  ';
      const conf = (proj.confidence * 100).toFixed(0);
      console.log(`${starter} ${idx + 1}. ${proj.playerName.padEnd(20)} ${proj.projectedMinutes.toFixed(1)} min (${conf}% confidence)`);
    });

    console.log('\n=📊 Summary:');
    console.log(`   Total Projected Minutes: ${teamProjection.summary.totalProjectedMinutes}`);
    console.log(`   Active Players: ${teamProjection.summary.activePlayers}`);
    console.log(`   Injured Players: ${teamProjection.summary.injuredPlayers}`);
    console.log(`   Average Confidence: ${(teamProjection.summary.averageConfidence * 100).toFixed(1)}%`);
    console.log();

  } else {
    console.log(`   ❌ Error: ${teamProjection.error}\n`);
  }
}

/**
 * Main
 */
async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    if (playerName || playerId) {
      await testPlayerProjection();
    } else if (teamTricode) {
      await testTeamProjection();
    } else {
      console.log('❌ Please provide --player, --playerId, or --team parameter\n');
      console.log('Examples:');
      console.log('  node backend/scripts/nba/test-projections.js --player="LeBron James" --season=2024-25');
      console.log('  node backend/scripts/nba/test-projections.js --team=LAL --season=2024-25');
      console.log('  node backend/scripts/nba/test-projections.js --playerId=2544 --season=2024-25\n');
    }

    await mongoose.disconnect();
    console.log('✅ Done!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error);
    console.error(error.stack);
    await mongoose.disconnect();
    process.exit(1);
  }
}

main();
