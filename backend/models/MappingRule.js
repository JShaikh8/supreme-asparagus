// backend/models/MappingRule.js
const mongoose = require('mongoose');

const mappingRuleSchema = new mongoose.Schema({
  // Categorization
  category: {
    type: String,
    required: true,
    index: true
    // Examples: 'CFB_PLAYER', 'NBA_NETWORK', 'NFL_TIME'
  },
  
  // Which modules this applies to
  moduleIds: [{
    type: String,
    required: true
  }],
  
  // Type of mapping
  mappingType: {
    type: String,
    required: true,
    enum: ['name_variation', 'time_format', 'network_name', 'abbreviation', 'custom']
  },
  
  // The actual mapping rule
  rule: {
    field: {
      type: String,
      required: true
    },
    from: {
      type: String,
      required: true
    },
    to: {
      type: String,
      required: true
    },
    bidirectional: {
      type: Boolean,
      default: false
    },
    caseSensitive: {
      type: Boolean,
      default: false
    }
  },
  
  // Usage tracking
  metadata: {
    createdBy: String,
    createdAt: {
      type: Date,
      default: Date.now
    },
    lastUsed: Date,
    useCount: {
      type: Number,
      default: 0
    },
    notes: String,
    confidence: {
      type: String,
      enum: ['manual', 'auto_suggested', 'verified'],
      default: 'manual'
    }
  },
  
  // Status
  active: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
});

// Index for efficient lookups during comparison
mappingRuleSchema.index({ moduleIds: 1, active: 1 });
mappingRuleSchema.index({ 'rule.field': 1, active: 1 });

module.exports = mongoose.model('MappingRule', mappingRuleSchema);