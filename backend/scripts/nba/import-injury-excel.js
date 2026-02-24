#!/usr/bin/env node
// backend/scripts/nba/import-injury-excel.js
/**
 * Import historical injury data from Excel file
 *
 * Excel format expected:
 * PLAYER | STATUS | REASON | TEAM | GAME | DATE
 *
 * Usage:
 *   node backend/scripts/nba/import-injury-excel.js <path-to-excel-file>
 *   node backend/scripts/nba/import-injury-excel.js ./injuries.xlsx
 */

const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');
require('dotenv').config();

// Models
const NBAInjuryReport = require('../../models/NBAInjuryReport');
const NBAPlayerGameLog = require('../../models/NBAPlayerGameLog');

// Get file path from command line arguments
const args = process.argv.slice(2);
const filePath = args[0];

if (!filePath) {
  console.error('\nL Error: Please provide path to Excel file');
  console.log('\nUsage:');
  console.log('  node backend/scripts/nba/import-injury-excel.js <path-to-excel-file>');
  console.log('\nExample:');
  console.log('  node backend/scripts/nba/import-injury-excel.js ./data/injuries.xlsx\n');
  process.exit(1);
}

const absolutePath = path.resolve(filePath);

console.log(`\n=å Importing injury data from Excel file\n`);
console.log(`   File: ${absolutePath}\n`);

/**
 * Parse team tricode from various formats
 * @param {string} team - Team name/code
 * @returns {string} - Standardized team tricode
 */
function parseTeamTricode(team) {
  // Common team name mappings
  const teamMappings = {
    'New York Knicks': 'NYK',
    'Boston Celtics': 'BOS',
    'Los Angeles Lakers': 'LAL',
    'Golden State Warriors': 'GSW',
    'Miami Heat': 'MIA',
    'Chicago Bulls': 'CHI',
    'Brooklyn Nets': 'BKN',
    'Philadelphia 76ers': 'PHI',
    'Milwaukee Bucks': 'MIL',
    'Toronto Raptors': 'TOR',
    'Dallas Mavericks': 'DAL',
    'Houston Rockets': 'HOU',
    'Phoenix Suns': 'PHX',
    'LA Clippers': 'LAC',
    'Denver Nuggets': 'DEN',
    'Utah Jazz': 'UTA',
    'Portland Trail Blazers': 'POR',
    'Oklahoma City Thunder': 'OKC',
    'San Antonio Spurs': 'SAS',
    'Memphis Grizzlies': 'MEM',
    'New Orleans Pelicans': 'NOP',
    'Sacramento Kings': 'SAC',
    'Minnesota Timberwolves': 'MIN',
    'Indiana Pacers': 'IND',
    'Detroit Pistons': 'DET',
    'Cleveland Cavaliers': 'CLE',
    'Atlanta Hawks': 'ATL',
    'Charlotte Hornets': 'CHA',
    'Washington Wizards': 'WAS',
    'Orlando Magic': 'ORL'
  };

  return teamMappings[team] || team.toUpperCase().substring(0, 3);
}

/**
 * Parse player name to match format in database
 * @param {string} playerName - Name from Excel (Last, First format)
 * @returns {Object} - {lastName, firstName, fullName}
 */
function parsePlayerName(playerName) {
  // Handle "Last, First" format from Excel
  if (playerName.includes(',')) {
    const [lastName, firstName] = playerName.split(',').map(s => s.trim());
    return {
      lastName,
      firstName,
      fullName: `${firstName} ${lastName}`
    };
  }

  // Handle "First Last" format
  const parts = playerName.trim().split(' ');
  if (parts.length >= 2) {
    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');
    return {
      firstName,
      lastName,
      fullName: playerName.trim()
    };
  }

  return {
    firstName: '',
    lastName: playerName.trim(),
    fullName: playerName.trim()
  };
}

/**
 * Find player ID by name from game logs
 * @param {string} playerName - Player's full name
 * @param {string} teamTricode - Team tricode
 * @returns {Promise<number|null>} - Player ID or null
 */
async function findPlayerIdByName(playerName, teamTricode) {
  const { fullName } = parsePlayerName(playerName);

  // Try exact match first
  let gameLog = await NBAPlayerGameLog.findOne({
    playerName: fullName,
    teamTricode
  }).sort({ gameDate: -1 });

  if (gameLog) {
    return gameLog.playerId;
  }

  // Try case-insensitive match
  gameLog = await NBAPlayerGameLog.findOne({
    playerName: { $regex: new RegExp(`^${fullName}$`, 'i') },
    teamTricode
  }).sort({ gameDate: -1 });

  if (gameLog) {
    return gameLog.playerId;
  }

  // Try partial match (last name only)
  const { lastName } = parsePlayerName(playerName);
  gameLog = await NBAPlayerGameLog.findOne({
    lastName: { $regex: new RegExp(lastName, 'i') },
    teamTricode
  }).sort({ gameDate: -1 });

  if (gameLog) {
    return gameLog.playerId;
  }

  return null;
}

/**
 * Parse game info to find game ID
 * @param {string} game - Game string (e.g., "NYK@BOS")
 * @param {Date} date - Game date
 * @returns {Promise<string|null>} - Game ID or null
 */
async function findGameId(game, date) {
  if (!game || game === 'N/A') {
    return null;
  }

  // Parse game format: NYK@BOS (away@home)
  const [away, home] = game.split('@').map(s => s.trim());

  if (!away || !home) {
    return null;
  }

  // Find game in database
  const NBAGame = require('../../models/NBAGame');

  const gameDate = new Date(date);
  const dayStart = new Date(gameDate);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(gameDate);
  dayEnd.setHours(23, 59, 59, 999);

  const gameDoc = await NBAGame.findOne({
    'homeTeam.teamTricode': home,
    'awayTeam.teamTricode': away,
    gameDate: {
      $gte: dayStart,
      $lte: dayEnd
    }
  });

  return gameDoc ? gameDoc.gameId : null;
}

/**
 * Main import function
 */
async function main() {
  try {
    // Read Excel file
    console.log('=Ö Reading Excel file...');
    const workbook = XLSX.readFile(absolutePath);

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON
    const data = XLSX.utils.sheet_to_json(worksheet);

    console.log(` Found ${data.length} rows in Excel file\n`);

    // Connect to MongoDB
    console.log('= Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(' Connected to MongoDB\n');

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    // Process each row
    for (let i = 0; i < data.length; i++) {
      const row = data[i];

      try {
        const playerName = row.PLAYER;
        const status = row.STATUS;
        const reason = row.REASON;
        const team = row.TEAM;
        const game = row.GAME;
        const date = row.DATE;

        if (!playerName || !date) {
          skipped++;
          continue;
        }

        // Parse date (Excel dates can be numbers)
        let reportDate;
        if (typeof date === 'number') {
          // Excel serial date
          reportDate = XLSX.SSF.parse_date_code(date);
          reportDate = new Date(reportDate.y, reportDate.m - 1, reportDate.d);
        } else {
          reportDate = new Date(date);
        }

        if (isNaN(reportDate.getTime())) {
          console.warn(`       Invalid date for ${playerName}: ${date}`);
          skipped++;
          continue;
        }

        // Parse team
        const teamTricode = parseTeamTricode(team);

        // Find player ID
        const playerId = await findPlayerIdByName(playerName, teamTricode);

        if (!playerId) {
          console.warn(`       Could not find player ID for: ${playerName} (${teamTricode})`);
          skipped++;
          continue;
        }

        // Find game ID
        const gameId = await findGameId(game, reportDate);

        // Create injury report
        const injuryReport = {
          playerId,
          playerName: parsePlayerName(playerName).fullName,
          teamTricode,
          teamName: team,
          reportDate,
          gameId,
          gameDate: reportDate,
          status,
          reason,
          description: reason,
          source: 'excel_import'
        };

        // Save to MongoDB
        await NBAInjuryReport.findOneAndUpdate(
          {
            playerId,
            reportDate
          },
          injuryReport,
          { upsert: true }
        );

        imported++;

        // Progress indicator
        if ((i + 1) % 100 === 0) {
          console.log(`    Processed ${i + 1}/${data.length} rows...`);
        }

      } catch (error) {
        console.error(`    L Error processing row ${i + 1}:`, error.message);
        errors++;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('=Ê IMPORT SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total rows:           ${data.length}`);
    console.log(`Successfully imported: ${imported}`);
    console.log(`Skipped:              ${skipped}`);
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

module.exports = { parsePlayerName, parseTeamTricode, findPlayerIdByName };
