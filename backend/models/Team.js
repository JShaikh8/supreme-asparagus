// backend/models/Team.js
const mongoose = require('mongoose');

const sportConfigSchema = new mongoose.Schema({
  sportId: Number,
  sportTitle: String,
  shortName: String,
  abbrev: String,
  rosterId: Number,
  scheduleId: Number,
  seasonId: Number,
  conferenceId: Number,
  globalSportId: Number,
  // Oracle team_id for this sport (fetched from Oracle DB)
  oracleTeamId: Number,
  // Sport-specific conference and division
  conference: String,
  division: String,
  lastUpdated: Date
});

const teamSchema = new mongoose.Schema({
  // Core fields
  statsId: {
    type: String,
    index: true
  },
  mlbId: String,  // MLB's internal team ID
  nbaTeamId: String,  // NBA's internal team ID
  teamId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    uppercase: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^[A-Z]+_[A-Z_]+$/.test(v);
      },
      message: 'Team ID must be in format LEAGUE_TEAMNAME (uppercase)'
    }
  },
  espnId: String,
  teamName: {
    type: String,
    required: true
  },
  teamNickname: String,
  teamAbbrev: String,
  league: {
    type: String,
    required: true,
    enum: ['NCAA', 'NFL', 'NBA', 'NHL', 'MLB', 'MILB']
  },
  
  // Conference and Division
  conference: String,
  division: {
    type: String,
    enum: [
      // NCAA divisions
      'I', 'II', 'III', 'I-NAIA', 'II-NAIA', 'FBS', 'FCS',
      // MLB divisions  
      'East', 'Central', 'West',
      // MILB levels
      'Triple-A (AAA)', 'Double-A (AA)', 'High-A', 'Low-A', 'Rookie',
      // Empty string for no division
      ''
    ]
  },
  
  // Scraping configuration
  scrapeType: {
    type: String,
    enum: ['sidearm', 'presto', 'custom', 'mlb', 'unknown']
  },
  subScrapeType: {
    type: String,
    enum: ['old', 'new', 'v1', 'v2', 'api', 'unknown']
  },
  baseUrl: {
    type: String,
    required: true
  },
  href: String,
  logoUrl: String,
  timezone: String,
  
  // NCAA specific - stores all sports for this school
  ncaaSportsConfig: {
    football: sportConfigSchema,
    mensBasketball: sportConfigSchema,
    womensBasketball: sportConfigSchema,
    baseball: sportConfigSchema,
    softball: sportConfigSchema,
    mensVolleyball: sportConfigSchema,
    womensVolleyball: sportConfigSchema,
    mensSoccer: sportConfigSchema,
    womensSoccer: sportConfigSchema,
    mensIceHockey: sportConfigSchema,
    womensIceHockey: sportConfigSchema,
  },
  
  // Auto-populate metadata
  lastAutoPopulate: Date,
  autoPopulateStatus: {
    type: String,
    enum: ['success', 'failed', 'partial', 'never_run']
  },
  autoPopulateError: String,
  
  active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
teamSchema.index({ league: 1, active: 1 });
teamSchema.index({ scrapeType: 1, subScrapeType: 1 });
teamSchema.index({ league: 1, conference: 1, active: 1 }); // For conference-based queries

module.exports = mongoose.model('Team', teamSchema);