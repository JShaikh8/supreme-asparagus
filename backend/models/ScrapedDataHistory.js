// backend/models/ScrapedDataHistory.js
const mongoose = require('mongoose');

const scrapedDataHistorySchema = new mongoose.Schema({
  // Match key for unique identification (matches ScrapedData)
  matchKey: {
    type: String,
    required: true,
    index: true
  },

  // Module that fetched this data
  moduleId: {
    type: String,
    required: true,
    index: true
  },

  // Team association
  teamId: {
    type: String,
    required: true,
    index: true
  },

  // Sport, league, dataType fields for easier querying
  sport: {
    type: String,
    enum: ['football', 'mensBasketball', 'womensBasketball', 'baseball', 'hockey', 'soccer', 'basketball'],
    index: true
  },

  league: {
    type: String,
    enum: ['NCAA', 'NFL', 'MLB', 'NBA', 'NHL', 'MILB'],
    index: true
  },

  dataType: {
    type: String,
    enum: ['roster', 'schedule', 'stats'],
    default: 'roster',
    index: true
  },

  // Source information (copied from original ScrapedData)
  source: {
    url: String,
    name: String,
    fetchedAt: Date
  },

  // The actual data - exact copy of ScrapedData.data
  data: mongoose.Schema.Types.Mixed,

  // Data integrity
  dataHash: String,
  version: {
    type: Number,
    default: 1
  },

  // Validation results (copied from original)
  validation: {
    isValid: Boolean,
    errors: [String],
    warnings: [String]
  },

  // Baseline-specific fields
  savedAt: {
    type: Date,
    required: true,
    index: true,
    default: Date.now
  },

  originalCreatedAt: {
    type: Date,
    required: true
  },

  originalUpdatedAt: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
scrapedDataHistorySchema.index({ moduleId: 1, teamId: 1, savedAt: -1 });
scrapedDataHistorySchema.index({ teamId: 1, dataType: 1, savedAt: -1 });
scrapedDataHistorySchema.index({ matchKey: 1, moduleId: 1, savedAt: -1 });
scrapedDataHistorySchema.index({ league: 1, sport: 1, dataType: 1 });

// Auto-extract sport and league from moduleId (same as ScrapedData)
scrapedDataHistorySchema.pre('save', function(next) {
  // Extract sport from moduleId
  if (this.moduleId && !this.sport) {
    if (this.moduleId.includes('football')) this.sport = 'football';
    else if (this.moduleId.includes('mensBasketball')) this.sport = 'mensBasketball';
    else if (this.moduleId.includes('womensBasketball')) this.sport = 'womensBasketball';
    else if (this.moduleId.includes('mlb')) this.sport = 'baseball';
    else if (this.moduleId.startsWith('nba_')) this.sport = 'basketball';
  }

  // Extract league from moduleId
  if (this.moduleId && !this.league) {
    if (this.moduleId.startsWith('ncaa_')) this.league = 'NCAA';
    else if (this.moduleId.startsWith('mlb_')) this.league = 'MLB';
    else if (this.moduleId.startsWith('nfl_')) this.league = 'NFL';
    else if (this.moduleId.startsWith('nba_')) this.league = 'NBA';
  }

  // Set dataType from moduleId
  if (this.moduleId && !this.dataType) {
    if (this.moduleId.includes('roster')) this.dataType = 'roster';
    else if (this.moduleId.includes('schedule')) this.dataType = 'schedule';
    else if (this.moduleId.includes('stats')) this.dataType = 'stats';
  }

  next();
});

module.exports = mongoose.model('ScrapedDataHistory', scrapedDataHistorySchema);
