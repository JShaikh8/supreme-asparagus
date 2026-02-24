// backend/models/MappingSuggestion.js
const mongoose = require('mongoose');

const mappingSuggestionSchema = new mongoose.Schema({
  // What was compared
  comparison: {
    teamId: String,
    sport: String,
    league: String,
    fieldType: String,
    scrapedValue: String,
    sourceValue: String,
    sourceType: { type: String, enum: ['api', 'oracle'] },
    playerName: String,
    playerId: String
  },
  
  // Suggested mapping
  suggestion: {
    mappingType: String,
    primaryValue: String,
    equivalents: [String],
    tolerance: Number,
    confidence: Number
  },
  
  // Tracking
  occurrences: { type: Number, default: 1 },
  lastSeen: { type: Date, default: Date.now },
  
  // User action
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'ignored'],
    default: 'pending'
  },
  
  reviewedBy: String,
  reviewedAt: Date,
  
  // If accepted, link to created mapping
  createdMappingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DataMapping'
  }
}, {
  timestamps: true
});

mappingSuggestionSchema.index({ 'comparison.teamId': 1, status: 1 });
mappingSuggestionSchema.index({ 'suggestion.confidence': -1, status: 1 });

module.exports = mongoose.model('MappingSuggestion', mappingSuggestionSchema);