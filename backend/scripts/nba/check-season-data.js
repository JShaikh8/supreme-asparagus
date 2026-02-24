#!/usr/bin/env node
// Check what data exists for a season
const mongoose = require('mongoose');
require('dotenv').config();

const NBAGame = require('../../models/NBAGame');
const NBAPlayerGameLog = require('../../models/NBAPlayerGameLog');
const NBAPlayerSeasonStats = require('../../models/NBAPlayerSeasonStats');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const season = '2025-26';

  console.log(`\n=📊 Data Check for ${season} Season\n`);

  // Check games
  const totalGames = await NBAGame.countDocuments({ season });
  const finalGames = await NBAGame.countDocuments({ season, gameStatus: 3 });
  const processedGames = await NBAGame.countDocuments({ season, boxscoreProcessed: true });

  console.log('📅 Games:');
  console.log(`   Total: ${totalGames}`);
  console.log(`   Final (completed): ${finalGames}`);
  console.log(`   Box scores processed: ${processedGames}`);
  console.log();

  // Check player game logs
  const gameLogs = await NBAPlayerGameLog.countDocuments({ season });
  const uniquePlayers = await NBAPlayerGameLog.distinct('playerId', { season });

  console.log('🎮 Player Game Logs:');
  console.log(`   Total logs: ${gameLogs}`);
  console.log(`   Unique players: ${uniquePlayers.length}`);
  console.log();

  // Check season stats
  const seasonStats = await NBAPlayerSeasonStats.countDocuments({ season });
  const lakersStats = await NBAPlayerSeasonStats.countDocuments({
    season,
    teamTricode: 'LAL',
    gamesPlayed: { $gt: 0 }
  });

  console.log('📈 Player Season Stats:');
  console.log(`   Total players: ${seasonStats}`);
  console.log(`   Lakers players: ${lakersStats}`);
  console.log();

  // Sample Lakers players
  const lakersPlayers = await NBAPlayerSeasonStats.find({
    season,
    teamTricode: 'LAL',
    gamesPlayed: { $gt: 0 }
  }).sort({ minutesPerGame: -1 }).limit(10);

  console.log('👥 Lakers Roster (Top 10 by MPG):');
  lakersPlayers.forEach((p, idx) => {
    console.log(`   ${idx + 1}. ${p.playerName.padEnd(20)} - ${p.gamesPlayed} GP, ${p.minutesPerGame.toFixed(1)} MPG`);
  });
  console.log();

  // Check if rolling averages need to be calculated
  const needsRollingAvg = await NBAPlayerSeasonStats.countDocuments({
    season,
    gamesPlayed: { $gt: 0 },
    last3Games: null
  });

  if (needsRollingAvg > 0) {
    console.log(`⚠️  WARNING: ${needsRollingAvg} players missing rolling averages!`);
    console.log('   Run: node scripts/nba/calculate-rolling-averages.js --season=2025-26\n');
  }

  await mongoose.disconnect();
  console.log('✅ Done\n');
}

main().catch(console.error);
