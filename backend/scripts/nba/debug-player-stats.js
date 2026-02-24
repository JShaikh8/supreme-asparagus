#!/usr/bin/env node
// Quick debug script to check player stats data
const mongoose = require('mongoose');
require('dotenv').config();

const NBAPlayerSeasonStats = require('../../models/NBAPlayerSeasonStats');
const NBAPlayerGameLog = require('../../models/NBAPlayerGameLog');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  console.log('\n=🔍 Debugging Player Stats Data\n');

  // Check a LAL player
  const player = await NBAPlayerSeasonStats.findOne({
    teamTricode: 'LAL',
    season: '2025-26'
  }).sort({ minutesPerGame: -1 });

  if (!player) {
    console.log('❌ No LAL players found for 2025-26 season\n');
    await mongoose.disconnect();
    return;
  }

  console.log('Sample Player:', player.playerName);
  console.log('Team:', player.teamTricode);
  console.log('Season:', player.season);
  console.log('Games Played:', player.gamesPlayed);
  console.log('\n📊 Season Stats:');
  console.log('  Minutes Per Game:', player.minutesPerGame);
  console.log('  Points Per Game:', player.pointsPerGame);
  console.log('\n📈 Rolling Averages:');
  console.log('  Last 3 Games:', JSON.stringify(player.last3Games, null, 2));
  console.log('  Last 5 Games:', JSON.stringify(player.last5Games, null, 2));
  console.log('  Last 10 Games:', JSON.stringify(player.last10Games, null, 2));
  console.log('\n🏠 Splits:');
  console.log('  Home:', JSON.stringify(player.homeSplits, null, 2));
  console.log('  Away:', JSON.stringify(player.awaySplits, null, 2));

  // Check raw game logs
  console.log('\n\n=🎮 Checking Raw Game Logs:\n');
  const gameLogs = await NBAPlayerGameLog.find({
    playerId: player.playerId,
    season: '2025-26'
  }).sort({ gameDate: -1 }).limit(5);

  console.log(`Found ${gameLogs.length} game logs for this player in 2025-26\n`);

  gameLogs.forEach((log, idx) => {
    console.log(`Game ${idx + 1}:`);
    console.log(`  Date: ${log.gameDate.toISOString().split('T')[0]}`);
    console.log(`  Minutes: ${log.minutes}`);
    console.log(`  Points: ${log.points}`);
    console.log(`  Team: ${log.teamTricode}`);
    console.log();
  });

  await mongoose.disconnect();
  console.log('✅ Done\n');
}

main().catch(console.error);
