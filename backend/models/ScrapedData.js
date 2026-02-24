// backend/models/ScrapedData.js
const mongoose = require('mongoose');

const scrapedDataSchema = new mongoose.Schema({
  // Match key for unique identification
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
  
  // Add these new fields for easier querying
  sport: {
    type: String,
    enum: ['football', 'mensBasketball', 'womensBasketball', 'basketball', 'baseball', 'hockey', 'soccer'],
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
  
  // Source information
  source: {
    url: String,
    name: String,
    fetchedAt: Date
  },
  
  // The actual data - schemaless for flexibility
  data: mongoose.Schema.Types.Mixed,
  
  // Data integrity
  dataHash: String,
  version: {
    type: Number,
    default: 1
  },
  
  // Validation results
  validation: {
    isValid: Boolean,
    errors: [String],
    warnings: [String]
  },
  
  // Expiration for cache management
  expiresAt: {
    type: Date,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
scrapedDataSchema.index({ moduleId: 1, teamId: 1, updatedAt: -1 });
scrapedDataSchema.index({ teamId: 1, dataType: 1, updatedAt: -1 });
scrapedDataSchema.index({ matchKey: 1, moduleId: 1 }, { unique: true });
scrapedDataSchema.index({ league: 1, sport: 1, dataType: 1 });

// Add a method to extract sport and league from moduleId
scrapedDataSchema.pre('save', function(next) {
  // Extract sport from moduleId (e.g., 'ncaa_football_roster' -> 'football')
  if (this.moduleId && !this.sport) {
    if (this.moduleId.includes('football')) this.sport = 'football';
    else if (this.moduleId.includes('mensBasketball')) this.sport = 'mensBasketball';
    else if (this.moduleId.includes('womensBasketball')) this.sport = 'womensBasketball';
    else if (this.moduleId.includes('mlb')) this.sport = 'baseball';
  }
  
  // Extract league from moduleId
  if (this.moduleId && !this.league) {
    if (this.moduleId.startsWith('ncaa_')) this.league = 'NCAA';
    else if (this.moduleId.startsWith('mlb_')) this.league = 'MLB';
    else if (this.moduleId.startsWith('nfl_')) this.league = 'NFL';
  }
  
  // Set dataType from moduleId
  if (this.moduleId && !this.dataType) {
    if (this.moduleId.includes('roster')) this.dataType = 'roster';
    else if (this.moduleId.includes('schedule')) this.dataType = 'schedule';
  }
  
  next();
});

module.exports = mongoose.model('ScrapedData', scrapedDataSchema);