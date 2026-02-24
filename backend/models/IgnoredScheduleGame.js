// backend/models/IgnoredScheduleGame.js
const mongoose = require('mongoose');

const ignoredScheduleGameSchema = new mongoose.Schema({
  teamId: {
    type: String,
    required: true,
    index: true
  },
  moduleId: {
    type: String,
    required: true,
    index: true
  },
  gameDate: {
    type: String,  // Store as YYYY-MM-DD format
    required: true
  },
  // Optional metadata for context
  opponent: {
    type: String
  },
  reason: {
    type: String,
    default: 'Future tournament game'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index for efficient lookups
ignoredScheduleGameSchema.index({ teamId: 1, moduleId: 1 });

// Unique constraint to prevent duplicates
ignoredScheduleGameSchema.index({ teamId: 1, moduleId: 1, gameDate: 1 }, { unique: true });

module.exports = mongoose.model('IgnoredScheduleGame', ignoredScheduleGameSchema);
