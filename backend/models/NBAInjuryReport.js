// backend/models/NBAInjuryReport.js
const mongoose = require('mongoose');

const nbaInjuryReportSchema = new mongoose.Schema({
  // Player identification
  playerId: {
    type: Number,
    required: true,
    index: true
  },

  playerName: {
    type: String,
    required: true
  },

  // Team
  teamId: Number,
  teamTricode: String,
  teamName: String,

  // Report details
  reportDate: {
    type: Date,
    required: true,
    index: true
  },

  gameId: String, // Game they missed (if applicable)
  gameDate: Date,

  // Injury status
  status: {
    type: String,
    required: true,
    enum: ['Out', 'Doubtful', 'Questionable', 'Probable', 'GTD', 'Available'],
    index: true
  },

  // Reason
  reason: String,
  // Examples from box score API:
  // "INACTIVE_INJURY", "INACTIVE_COACHES_DECISION",
  // "DND_INJURY", "INACTIVE_GLEAGUE_TWOWAY", "INACTIVE_SUSPENSION"

  // From Excel: "Injury/Illness - Left Hamstring; Strained"

  description: String,
  // Detailed injury description
  // Example: "Left Ankle; Sprain", "Bilateral Low Back; Soreness"

  injuryType: String,
  // Parsed injury type: "ankle", "hamstring", "knee", etc.

  injuryLocation: String,
  // "left", "right", "bilateral"

  // Data source
  source: {
    type: String,
    required: true,
    enum: ['nba_boxscore', 'excel_import', 'rotowire_api', 'manual'],
    index: true
  },

  // Historical tracking
  isActive: {
    type: Boolean,
    default: true
  },

  resolvedDate: Date,

  daysMissed: Number

}, {
  timestamps: true
});

// Indexes
nbaInjuryReportSchema.index({ playerId: 1, reportDate: -1 });
nbaInjuryReportSchema.index({ reportDate: -1, status: 1 });
nbaInjuryReportSchema.index({ teamId: 1, reportDate: -1 });
nbaInjuryReportSchema.index({ gameId: 1 });

// Instance methods
nbaInjuryReportSchema.methods.parseInjuryDetails = function() {
  // Parse description like "Left Ankle; Sprain"
  if (!this.description) return;

  const descLower = this.description.toLowerCase();

  // Extract location
  if (descLower.includes('left')) {
    this.injuryLocation = 'left';
  } else if (descLower.includes('right')) {
    this.injuryLocation = 'right';
  } else if (descLower.includes('bilateral')) {
    this.injuryLocation = 'bilateral';
  }

  // Extract injury type (common injuries)
  const injuries = [
    'ankle', 'knee', 'hamstring', 'quad', 'calf', 'foot',
    'back', 'shoulder', 'wrist', 'hand', 'finger', 'toe',
    'hip', 'groin', 'achilles', 'concussion', 'illness'
  ];

  for (const injury of injuries) {
    if (descLower.includes(injury)) {
      this.injuryType = injury;
      break;
    }
  }
};

// Static methods
nbaInjuryReportSchema.statics.getActiveInjuries = function(date = new Date()) {
  return this.find({
    reportDate: { $lte: date },
    $or: [
      { isActive: true },
      { resolvedDate: { $gte: date } }
    ]
  });
};

nbaInjuryReportSchema.statics.getPlayerInjuryHistory = function(playerId, season = null) {
  const query = { playerId };

  if (season) {
    // Parse season like "2023-24" to date range
    const [startYear] = season.split('-');
    const seasonStart = new Date(`${startYear}-10-01`);
    const seasonEnd = new Date(`${parseInt(startYear) + 1}-06-30`);

    query.reportDate = {
      $gte: seasonStart,
      $lte: seasonEnd
    };
  }

  return this.find(query).sort({ reportDate: -1 });
};

nbaInjuryReportSchema.statics.getTeamInjuriesForGame = function(gameId) {
  return this.find({ gameId, status: { $in: ['Out', 'Doubtful'] } });
};

nbaInjuryReportSchema.statics.getInjuriesByDate = function(date) {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  return this.find({
    reportDate: {
      $gte: dayStart,
      $lte: dayEnd
    }
  });
};

module.exports = mongoose.model('NBAInjuryReport', nbaInjuryReportSchema);
