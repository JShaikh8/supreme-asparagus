// backend/scripts/seedMLBTeams.js
// Run with: node backend/scripts/seedMLBTeams.js

const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const Team = require('../models/Team');

// MLB API teams endpoint
const MLB_API_URL = 'https://statsapi.mlb.com/api/v1/teams?sportId=1';

// Map MLB team fileCode to URL slug (some differ from abbreviation)
const teamUrlSlugs = {
  'ana': 'angels',
  'ari': 'd-backs',
  'atl': 'braves',
  'bal': 'orioles',
  'bos': 'redsox',
  'chc': 'cubs',
  'cin': 'reds',
  'cle': 'guardians',
  'col': 'rockies',
  'cws': 'whitesox',
  'det': 'tigers',
  'hou': 'astros',
  'kc': 'royals',
  'la': 'dodgers',
  'mia': 'marlins',
  'mil': 'brewers',
  'min': 'twins',
  'nym': 'mets',
  'nyy': 'yankees',
  'oak': 'athletics',
  'phi': 'phillies',
  'pit': 'pirates',
  'sd': 'padres',
  'sea': 'mariners',
  'sf': 'giants',
  'stl': 'cardinals',
  'tb': 'rays',
  'tex': 'rangers',
  'tor': 'bluejays',
  'wsh': 'nationals'
};

/**
 * Extract division from full division name
 * "American League East" → "East"
 * "National League Central" → "Central"
 */
function extractDivision(divisionName) {
  if (!divisionName) return '';
  const parts = divisionName.split(' ');
  return parts[parts.length - 1]; // Last word is East/Central/West
}

/**
 * Generate team URL slug from fileCode
 */
function getTeamUrlSlug(fileCode) {
  return teamUrlSlugs[fileCode.toLowerCase()] || fileCode.toLowerCase();
}

/**
 * Transform MLB API team to our Team model format
 */
function transformTeam(apiTeam) {
  const urlSlug = getTeamUrlSlug(apiTeam.fileCode);

  return {
    teamId: `MLB_${apiTeam.abbreviation}`,
    teamName: apiTeam.franchiseName,       // "Arizona", "New York", "Los Angeles"
    teamNickname: apiTeam.teamName,        // "Diamondbacks", "Yankees", "Dodgers"
    teamAbbrev: apiTeam.abbreviation,
    league: 'MLB',
    conference: apiTeam.league?.name || '', // "American League" or "National League"
    division: extractDivision(apiTeam.division?.name), // "East", "Central", or "West"
    mlbId: String(apiTeam.id),
    baseUrl: `https://www.mlb.com/${urlSlug}`,
    scrapeType: 'mlb',
    active: apiTeam.active !== false,
    // Fields to be populated later:
    // statsId: null,  // Oracle team ID
    // espnId: null,   // ESPN team ID
  };
}

async function seedMLBTeams() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Fetch teams from MLB API
    console.log('Fetching teams from MLB API...');
    const response = await axios.get(MLB_API_URL);
    const apiTeams = response.data.teams;

    console.log(`Found ${apiTeams.length} teams from MLB API`);

    // Filter to only active MLB teams (not spring training, etc.)
    const activeTeams = apiTeams.filter(t => t.active && t.sport?.id === 1);
    console.log(`${activeTeams.length} active MLB teams`);

    // Transform and insert each team
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const apiTeam of activeTeams) {
      try {
        const teamData = transformTeam(apiTeam);

        // Check if team already exists
        const existing = await Team.findOne({ teamId: teamData.teamId });

        if (existing) {
          // Update existing team (but don't overwrite statsId/espnId if already set)
          const updateData = { ...teamData };
          if (existing.statsId) delete updateData.statsId;
          if (existing.espnId) delete updateData.espnId;

          await Team.updateOne({ teamId: teamData.teamId }, { $set: updateData });
          console.log(`  Updated: ${teamData.teamId} (${teamData.teamName})`);
          updated++;
        } else {
          // Create new team
          await Team.create(teamData);
          console.log(`  Created: ${teamData.teamId} (${teamData.teamName})`);
          created++;
        }
      } catch (err) {
        console.error(`  Error processing ${apiTeam.name}: ${err.message}`);
        errors++;
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Created: ${created}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);
    console.log(`Total: ${activeTeams.length}`);

    // List all MLB teams now in database
    console.log('\n=== MLB Teams in Database ===');
    const mlbTeams = await Team.find({ league: 'MLB' }).sort({ teamId: 1 });
    console.log(`\nTotal MLB teams: ${mlbTeams.length}\n`);

    console.log('TeamID              | Name                      | mlbId | statsId | espnId');
    console.log('-'.repeat(80));
    for (const team of mlbTeams) {
      const row = [
        team.teamId.padEnd(18),
        team.teamName.padEnd(25),
        (team.mlbId || '-').toString().padEnd(5),
        (team.statsId || '-').toString().padEnd(7),
        (team.espnId || '-').toString()
      ].join(' | ');
      console.log(row);
    }

  } catch (error) {
    console.error('Error seeding MLB teams:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run the script
seedMLBTeams();
