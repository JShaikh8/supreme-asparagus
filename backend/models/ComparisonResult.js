// backend/models/ComparisonResult.js
const mongoose = require('mongoose');

const comparisonResultSchema = new mongoose.Schema({
  // Run information
  moduleId: {
    type: String,
    required: true,
    index: true
  },
  
  runId: {
    type: String,
    required: true,
    index: true
  },
  
  // Filters applied during this run
  filters: {
    teams: [String],
    conference: String,
    dateRange: {
      start: Date,
      end: Date
    }
  },
  
  // Summary statistics
  summary: {
    totalRecords: Number,
    totalScraped: Number,
    totalSource: Number,
    matchPercentage: Number,
    perfectMatches: Number,
    matchesWithDiscrepancies: Number,
    matchedRecords: Number,
    differences: Number,
    missingInOracle: Number,
    missingInWeb: Number,
    missingInScraped: Number,
    missingInSource: Number,
    mappingsApplied: Number,
    duration: Number // milliseconds
  },
  
  // Detailed differences (paginated in practice)
  differences: [{
    matchKey: String,
    teamId: String,
    type: {
      type: String,
      enum: ['missing_in_oracle', 'missing_in_web', 'field_mismatch']
    },
    field: String,
    oracleValue: mongoose.Schema.Types.Mixed,
    webValue: mongoose.Schema.Types.Mixed,
    mappingApplied: {
      type: Boolean,
      default: false
    },
    mappingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MappingRule'
    },
    // Full game/player objects for schedule comparisons (needed for side-by-side display)
    scraped: mongoose.Schema.Types.Mixed,
    source: mongoose.Schema.Types.Mixed,
    mappedFields: mongoose.Schema.Types.Mixed,
    broadcaster: String,
    isIgnored: Boolean
  }],

  // Game-by-game details for stats modules (basketball, football)
  gameDetails: [{
    gameId: String,
    date: String,
    opponent: String,
    matchPercentage: Number,
    issues: Number,
    totalPlayers: Number,
    playerDiscrepancies: [{
      player: String,
      jersey: String,
      sidearmStats: mongoose.Schema.Types.Mixed,
      oracleStats: mongoose.Schema.Types.Mixed,
      statDiffs: [{
        category: String,
        stat: String,
        oracle: mongoose.Schema.Types.Mixed,
        sidearm: mongoose.Schema.Types.Mixed
      }]
    }],
    missingInOracle: [{
      player: String,
      jersey: String,
      stats: mongoose.Schema.Types.Mixed
    }],
    missingInSidearm: [{
      player: String,
      jersey: String,
      stats: mongoose.Schema.Types.Mixed
    }]
  }],
  
  // Run metadata
  status: {
    type: String,
    enum: ['running', 'completed', 'failed', 'cancelled'],
    default: 'running'
  },
  
  startedAt: {
    type: Date,
    default: Date.now
  },
  
  completedAt: Date,
  
  error: {
    message: String,
    stack: String
  }
}, {
  timestamps: true
});

// Indexes for querying
comparisonResultSchema.index({ moduleId: 1, createdAt: -1 });
comparisonResultSchema.index({ runId: 1 });

module.exports = mongoose.model('ComparisonResult', comparisonResultSchema);