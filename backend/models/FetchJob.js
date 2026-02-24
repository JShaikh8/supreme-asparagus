// backend/models/FetchJob.js
const mongoose = require('mongoose');

const fetchJobSchema = new mongoose.Schema({
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
    targetDate: String, // Date filter for stats modules (YYYY-MM-DD format)
    startDate: String, // Start date for date range filtering (YYYY-MM-DD format)
    endDate: String, // End date for date range filtering (YYYY-MM-DD format)
    createBaseline: Boolean, // Whether to create baseline before fetching
    forceRefresh: Boolean // Whether to force refresh even if data exists
  },
  
  // Progress tracking
  progress: {
    total: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    currentTeam: String,
    currentModule: String
  },
  
  // Results
  results: [{
    teamId: String,
    teamName: String,
    module: String,
    status: String,
    count: Number,
    error: String,
    startedAt: Date,
    completedAt: Date
  }],
  
  // Timing
  estimatedSeconds: Number,
  startedAt: Date,
  completedAt: Date,
  
  // User info (optional for future)
  createdBy: String
}, {
  timestamps: true
});

module.exports = mongoose.model('FetchJob', fetchJobSchema);