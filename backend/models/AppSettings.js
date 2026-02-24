// backend/models/AppSettings.js
const mongoose = require('mongoose');

const appSettingsSchema = new mongoose.Schema({
  // Singleton document identifier
  _id: {
    type: String,
    default: 'app_settings'
  },

  // Request settings
  requestTimeout: {
    type: Number,
    default: 30,
    min: 5,
    max: 300
  },
  maxRetryAttempts: {
    type: Number,
    default: 3,
    min: 0,
    max: 10
  },

  // Auto-refresh settings (in minutes, 0 = never)
  autoRefreshInterval: {
    type: Number,
    default: 60,
    enum: [0, 30, 60, 180, 360]
  },

  // Data retention settings (in days)
  dataRetentionPeriod: {
    type: Number,
    default: 30,
    enum: [7, 30, 90, 365]
  },

  // Bulk fetch settings
  bulkFetchConcurrency: {
    type: Number,
    default: 3,
    min: 1,
    max: 5
  },
  bulkFetchDelay: {
    type: Number,
    default: 2000,
    min: 1000,
    max: 10000
  },

  // Last updated
  updatedAt: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: String,
    default: 'system'
  }
}, {
  timestamps: false // We handle updatedAt manually
});

// Ensure only one settings document exists
appSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findById('app_settings');
  if (!settings) {
    settings = await this.create({ _id: 'app_settings' });
  }
  return settings;
};

appSettingsSchema.statics.updateSettings = async function(updates) {
  const settings = await this.findByIdAndUpdate(
    'app_settings',
    { ...updates, updatedAt: new Date() },
    { new: true, upsert: true, runValidators: true }
  );
  return settings;
};

module.exports = mongoose.model('AppSettings', appSettingsSchema);
