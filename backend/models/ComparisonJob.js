// backend/models/ComparisonJob.js
const mongoose = require('mongoose');

const comparisonJobSchema = new mongoose.Schema({
  jobId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },

  // Job configuration
  filters: {
    league: String,
    conference: String,
    division: String,
    teams: [String],
    modules: [String],
    source: {
      type: String,
      enum: ['oracle', 'api', 'baseline'],
      default: 'oracle'
    },
    season: Number,
    targetDate: String, // Date filter for stats comparisons (YYYY-MM-DD format)
    startDate: String, // Date filter for schedule comparisons (YYYY-MM-DD format)
    endDate: String // End date for date range filtering (YYYY-MM-DD format)
  },

  // Progress tracking
  progress: {
    total: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    currentTeam: String,
    currentModule: String
  },

  // Results summary
  results: [{
    teamId: String,
    teamName: String,
    module: String,
    status: String,
    comparisonResultId: String,
    summary: {
      matchPercentage: Number,
      totalScraped: Number,
      totalSource: Number,
      perfectMatches: Number,
      matchesWithDiscrepancies: Number,
      missingInScraped: Number,
      missingInSource: Number,
      totalDifferences: Number // Total issues (discrepancies + missing players) for expandability
    },
    error: String,
    startedAt: Date,
    completedAt: Date
  }],

  // Overall summary
  overallSummary: {
    totalComparisons: { type: Number, default: 0 },
    averageMatchPercentage: { type: Number, default: 0 },
    totalDiscrepancies: { type: Number, default: 0 },
    totalMissingInScraped: { type: Number, default: 0 },
    totalMissingInSource: { type: Number, default: 0 }
  },

  // Timing
  estimatedSeconds: Number,
  startedAt: Date,
  completedAt: Date,

  // User info (optional for future)
  createdBy: String
}, {
  timestamps: true
});

module.exports = mongoose.model('ComparisonJob', comparisonJobSchema);
