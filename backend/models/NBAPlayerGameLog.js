// backend/models/NBAPlayerGameLog.js
const mongoose = require('mongoose');

const nbaPlayerGameLogSchema = new mongoose.Schema({
  // Unique identifier for this specific game log
  gameLogId: {
    type: String,
    required: true,
    unique: true,
    index: true
    // Format: {gameId}_{playerId}
  },

  // Game reference
  gameId: {
    type: String,
    required: true,
    index: true
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

  firstName: String,
  lastName: String,

  // Team information
  teamId: {
    type: Number,
    required: true,
    index: true
  },

  teamTricode: String,
  teamName: String,

  // Opponent
  opponentId: {
    type: Number,
    required: true
  },

  opponentTricode: String,
  opponentName: String,

  // Game context
  gameDate: {
    type: Date,
    required: true,
    index: true
  },

  season: {
    type: String,
    required: true,
    index: true
    // Format: "2023-24"
  },

  isHome: {
    type: Boolean,
    required: true
  },

  isStarter: {
    type: Boolean,
    default: false
  },

  position: String,

  jerseyNum: String,

  // Game situation
  isBackToBack: {
    type: Boolean,
    default: false
  },

  daysRest: {
    type: Number,
    default: 0
  },

  // MINUTES - Our target variable!
  minutes: {
    type: Number,
    required: true,
    index: true
  },

  minutesRaw: String, // Original format: PT36M34.00S

  // Playing status
  played: {
    type: Boolean,
    required: true,
    default: false
  },

  status: String, // ACTIVE, INACTIVE

  // Injury/DNP information
  didNotPlay: {
    type: Boolean,
    default: false
  },

  notPlayingReason: String,
  // Examples: "INACTIVE_INJURY", "INACTIVE_COACHES_DECISION",
  // "DND_INJURY", "INACTIVE_GLEAGUE_TWOWAY"

  notPlayingDescription: String,
  // Example: "Right Ankle; Sprain"

  // Box score statistics
  points: Number,
  assists: Number,
  rebounds: Number,
  reboundsOffensive: Number,
  reboundsDefensive: Number,
  steals: Number,
  blocks: Number,
  turnovers: Number,

  fieldGoalsMade: Number,
  fieldGoalsAttempted: Number,
  fieldGoalsPercentage: Number,

  threePointersMade: Number,
  threePointersAttempted: Number,
  threePointersPercentage: Number,

  freeThrowsMade: Number,
  freeThrowsAttempted: Number,
  freeThrowsPercentage: Number,

  plusMinus: Number,

  foulsPersonal: Number,
  foulsDrawn: Number,

  // Advanced stats
  pointsInThePaint: Number,
  pointsFastBreak: Number,
  pointsSecondChance: Number,

  // Teammate context (for injury redistribution analysis)
  teammatesOut: [{
    playerId: Number,
    playerName: String,
    position: String,
    averageMinutes: Number
  }],

  teammateMinutesOut: {
    type: Number,
    default: 0
  },

  // Team stats for this game
  teamScore: Number,
  opponentScore: Number,
  teamWon: Boolean,

  // Game flow (for analyzing blowouts)
  gameScript: String,
  // "close" = within 10 pts final
  // "blowout_win" = team won by 20+
  // "blowout_loss" = team lost by 20+

  // Data source
  dataSource: {
    type: String,
    default: 'nba_boxscore_api'
  },

  // Processing metadata
  processed: {
    type: Boolean,
    default: false
  },

  rollingAveragesCalculated: {
    type: Boolean,
    default: false
  }

}, {
  timestamps: true
});

// Compound indexes for common queries
nbaPlayerGameLogSchema.index({ playerId: 1, gameDate: -1 });
nbaPlayerGameLogSchema.index({ playerId: 1, season: 1 });
nbaPlayerGameLogSchema.index({ teamId: 1, gameDate: -1 });
nbaPlayerGameLogSchema.index({ season: 1, gameDate: -1 });
nbaPlayerGameLogSchema.index({ gameDate: -1, played: 1 });

// Instance methods
nbaPlayerGameLogSchema.methods.calculateGameScript = function() {
  if (!this.teamScore || !this.opponentScore) {
    return 'unknown';
  }

  const diff = Math.abs(this.teamScore - this.opponentScore);

  if (diff >= 20) {
    return this.teamWon ? 'blowout_win' : 'blowout_loss';
  } else if (diff >= 10) {
    return this.teamWon ? 'comfortable_win' : 'comfortable_loss';
  } else {
    return 'close';
  }
};

// Static methods
nbaPlayerGameLogSchema.statics.findByPlayer = function(playerId, season = null, limit = null) {
  const query = { playerId, played: true };

  if (season) {
    query.season = season;
  }

  let result = this.find(query).sort({ gameDate: -1 });

  if (limit) {
    result = result.limit(limit);
  }

  return result;
};

nbaPlayerGameLogSchema.statics.getLastNGames = function(playerId, n = 10) {
  return this.find({
    playerId,
    played: true
  })
  .sort({ gameDate: -1 })
  .limit(n);
};

nbaPlayerGameLogSchema.statics.getSeasonAverage = async function(playerId, season, stat = 'minutes') {
  const games = await this.find({
    playerId,
    season,
    played: true
  });

  if (games.length === 0) return 0;

  const sum = games.reduce((acc, game) => acc + (game[stat] || 0), 0);
  return sum / games.length;
};

nbaPlayerGameLogSchema.statics.getPlayerGamesByDateRange = function(playerId, startDate, endDate) {
  return this.find({
    playerId,
    gameDate: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    },
    played: true
  }).sort({ gameDate: 1 });
};

module.exports = mongoose.model('NBAPlayerGameLog', nbaPlayerGameLogSchema);
