// backend/models/NBAPlayerSeasonStats.js
const mongoose = require('mongoose');

const rollingStatsSchema = new mongoose.Schema({
  games: Number,
  minutes: Number,
  minutesStdDev: Number, // Standard deviation (consistency metric)
  points: Number,
  assists: Number,
  rebounds: Number,
  fieldGoalsPercentage: Number,
  threePointersPercentage: Number,
  plusMinus: Number
}, { _id: false });

const splitStatsSchema = new mongoose.Schema({
  games: Number,
  minutes: Number,
  points: Number
}, { _id: false });

const nbaPlayerSeasonStatsSchema = new mongoose.Schema({
  // Unique identifier
  statsId: {
    type: String,
    required: true,
    unique: true,
    index: true
    // Format: {playerId}_{season}
  },

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

  // Season and team
  season: {
    type: String,
    required: true,
    index: true
  },

  teamId: {
    type: Number,
    required: true
  },

  teamTricode: String,

  position: String,

  // Season totals
  gamesPlayed: {
    type: Number,
    default: 0
  },

  gamesStarted: {
    type: Number,
    default: 0
  },

  // Season averages (per game)
  minutesPerGame: Number,
  pointsPerGame: Number,
  assistsPerGame: Number,
  reboundsPerGame: Number,
  stealsPerGame: Number,
  blocksPerGame: Number,
  turnoversPerGame: Number,

  fieldGoalsPercentage: Number,
  threePointersPercentage: Number,
  freeThrowsPercentage: Number,

  plusMinusPerGame: Number,

  // Rolling averages (most important for projections!)
  last3Games: rollingStatsSchema,
  last5Games: rollingStatsSchema,
  last10Games: rollingStatsSchema,
  last15Games: rollingStatsSchema,
  last20Games: rollingStatsSchema,

  // Situational splits
  homeSplits: splitStatsSchema,
  awaySplits: splitStatsSchema,

  backToBackSplits: splitStatsSchema,
  restedSplits: splitStatsSchema,

  starterSplits: splitStatsSchema,
  benchSplits: splitStatsSchema,

  // Monthly trend (is player's role increasing/decreasing?)
  monthlyMinutesTrend: [{
    month: String,
    averageMinutes: Number,
    games: Number
  }],

  // Consistency metrics
  minutesStdDev: Number, // Standard deviation
  minutesRange: {
    min: Number,
    max: Number
  },

  // Minutes distribution
  minutesDistribution: {
    under20: Number,  // % of games with <20 min
    from20to30: Number,
    from30to35: Number,
    over35: Number    // % of games with 35+ min
  },

  // Role metrics
  starterRate: Number, // % of games started
  dnpRate: Number,     // % of games DNP

  // Injury history (this season)
  gamesMissed: {
    type: Number,
    default: 0
  },

  injuryProne: {
    type: Boolean,
    default: false
  },

  // Load management candidate
  loadManagementCandidate: {
    type: Boolean,
    default: false
  },

  // Last game info (for quick reference)
  lastGameDate: Date,
  lastGameMinutes: Number,

  // Calculation metadata
  lastCalculated: Date,
  gamesProcessed: Number

}, {
  timestamps: true
});

// Indexes
nbaPlayerSeasonStatsSchema.index({ playerId: 1, season: 1 });
nbaPlayerSeasonStatsSchema.index({ season: 1, minutesPerGame: -1 });
nbaPlayerSeasonStatsSchema.index({ teamId: 1, season: 1 });

// Instance methods
nbaPlayerSeasonStatsSchema.methods.getProjectedMinutes = function() {
  // Simple weighted average (baseline algorithm)
  if (!this.last3Games || !this.last10Games || !this.minutesPerGame) {
    return this.minutesPerGame || 0;
  }

  // Weight: Season (30%), Last 10 (50%), Last 3 (20%)
  const seasonWeight = 0.3;
  const last10Weight = 0.5;
  const last3Weight = 0.2;

  return (
    (this.minutesPerGame * seasonWeight) +
    (this.last10Games.minutes * last10Weight) +
    (this.last3Games.minutes * last3Weight)
  );
};

nbaPlayerSeasonStatsSchema.methods.isConsistent = function() {
  // Player is consistent if std dev < 5 minutes
  return this.minutesStdDev && this.minutesStdDev < 5;
};

nbaPlayerSeasonStatsSchema.methods.getMinutesTrend = function() {
  // Increasing, decreasing, or stable
  if (!this.last3Games || !this.last10Games) {
    return 'unknown';
  }

  const diff = this.last3Games.minutes - this.last10Games.minutes;

  if (diff > 3) return 'increasing';
  if (diff < -3) return 'decreasing';
  return 'stable';
};

// Static methods
nbaPlayerSeasonStatsSchema.statics.findByPlayer = function(playerId, season = null) {
  const query = { playerId };
  if (season) {
    query.season = season;
  }
  return this.findOne(query);
};

nbaPlayerSeasonStatsSchema.statics.getTopMinutesPlayers = function(season, limit = 50) {
  return this.find({ season })
    .sort({ minutesPerGame: -1 })
    .limit(limit);
};

module.exports = mongoose.model('NBAPlayerSeasonStats', nbaPlayerSeasonStatsSchema);
