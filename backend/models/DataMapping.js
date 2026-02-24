// backend/models/DataMapping.js
const mongoose = require('mongoose');

const dataMappingSchema = new mongoose.Schema({
  // What type of mapping rule
  mappingType: {
    type: String,
    required: true,
    enum: ['equivalence', 'tolerance', 'transformation', 'ignore']
  },
  
  // What field this applies to
  fieldType: {
    type: String,
    required: true,
    enum: [
      // Player fields
      'name',           // Player names
      'position',       // Position names/abbreviations
      'weight',         // Weight values
      'height',         // Height values
      'year',           // Year in school
      'eligibility',    // Eligibility status
      'hometown',       // Hometown/location
      'jersey',         // Jersey numbers
      'highSchool',     // High school names
      'previousSchool', // Transfer from school
      'birthDate',      // Date of birth
      'age',            // Age
      // Schedule fields
      'opponent',       // Opponent team names
      'venue',          // Venue/stadium names
      'locationIndicator', // H/A/N location
      'tv',             // TV network/broadcast
      'isConferenceGame', // Conference game flag
      'time',           // Game time
      'location',       // Stadium location/city
      'custom'          // Custom field
    ]
  },
  
  // If fieldType is 'custom', specify the field name
  customField: String,
  
  // Scope of this mapping - where it applies
  scope: {
    level: {
      type: String,
      required: true,
      enum: ['global', 'league', 'sport', 'team', 'player']
    },
    league: {
      type: String
      // No enum restriction - can be NCAA, BIG12, SEC, ACC, etc.
    },
    sport: {
      type: String,
      enum: ['football', 'mensBasketball', 'womensBasketball', 'baseball', 'softball', 'nba']
    },
    teamId: String,      // For team-specific mappings
    playerId: String,    // For player-specific mappings
    playerName: String   // Store player name for reference
  },
  
  // Priority (higher number = higher priority, overrides lower priority mappings)
  priority: {
    type: Number,
    default: 0
  },
  
  // The actual mapping rules
  rules: {
    // For equivalence mappings (positions, names, etc)
    primaryValue: String,      // The canonical/correct value
    equivalents: [String],     // All values that map to primaryValue
    caseSensitive: { 
      type: Boolean, 
      default: false 
    },
    
    // For tolerance mappings (weights, heights, numeric values)
    tolerance: { 
      type: Number, 
      default: 0  // Default to 0 tolerance as requested
    },
    toleranceType: {
      type: String,
      enum: ['absolute', 'percentage'],
      default: 'absolute'
    },
    
    // For transformation mappings (height formats, date formats, etc)
    transformFunction: {
      type: String,
      enum: [
        'inchesToFeetInches',    // 74" -> 6'2"
        'feetInchesToInches',    // 6'2" -> 74"
        'cmToInches',            // 188cm -> 74"
        'lbsToKg',               // pounds to kilograms
        'kgToLbs',               // kilograms to pounds
        'dateFormat',            // various date format conversions
        'custom'                 // custom transformation
      ]
    },
    transformParams: mongoose.Schema.Types.Mixed,  // Parameters for transformation
    
    // For ignore mappings
    ignoreReason: String  // Why we're ignoring this field
  },
  
  // Which data sources this mapping applies to
  appliesTo: {
    scraped: { type: Boolean, default: true },
    api: { type: Boolean, default: true },
    oracle: { type: Boolean, default: true }
  },
  
  // Metadata
  active: { 
    type: Boolean, 
    default: true 
  },
  
  // Auto-discovery metadata
  discoveryMetadata: {
    isAutoDiscovered: { 
      type: Boolean, 
      default: false 
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1
    },
    occurrences: {
      type: Number,
      default: 1
    },
    firstSeen: Date,
    lastSeen: Date,
    confirmedBy: String,     // User who confirmed auto-discovery
    confirmedAt: Date,
    rejectedBy: String,      // User who rejected auto-discovery
    rejectedAt: Date,
    examples: [{             // Examples of where this mapping was found
      teamId: String,
      playerName: String,
      scrapedValue: String,
      sourceValue: String,
      date: Date
    }]
  },
  
  // Creation and management metadata
  createdBy: {
    type: String,
    default: 'system'
  },
  
  modifiedBy: String,
  
  notes: String,  // Any notes about why this mapping exists
  
  // Track usage
  usageStats: {
    timesUsed: {
      type: Number,
      default: 0
    },
    lastUsed: Date,
    successfulMatches: {
      type: Number,
      default: 0
    }
  },
  
  // Audit trail
  history: [{
    action: {
      type: String,
      enum: ['created', 'modified', 'activated', 'deactivated']
    },
    user: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    changes: mongoose.Schema.Types.Mixed
  }],
  
  // Expiration (for temporary mappings)
  expiresAt: Date,
  
  // Tags for organization
  tags: [String],
  
  // Source of the mapping
  source: {
    type: String,
    enum: ['manual', 'auto-discovered', 'imported', 'system-default'],
    default: 'manual'
  }
}, {
  timestamps: true
});

// Indexes for fast lookups
dataMappingSchema.index({ fieldType: 1, 'scope.level': 1, active: 1 });
dataMappingSchema.index({ 'scope.teamId': 1, fieldType: 1, active: 1 });
dataMappingSchema.index({ 'scope.league': 1, fieldType: 1, active: 1 });
dataMappingSchema.index({ 'scope.sport': 1, fieldType: 1, active: 1 });
dataMappingSchema.index({ 'discoveryMetadata.isAutoDiscovered': 1, 'discoveryMetadata.confidence': -1 });
dataMappingSchema.index({ priority: -1 });
dataMappingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Instance methods
dataMappingSchema.methods.isExpired = function() {
  return this.expiresAt && this.expiresAt < new Date();
};

dataMappingSchema.methods.incrementUsage = function() {
  this.usageStats.timesUsed++;
  this.usageStats.lastUsed = new Date();
  return this.save();
};

dataMappingSchema.methods.addHistoryEntry = function(action, user, changes = null) {
  this.history.push({
    action,
    user,
    timestamp: new Date(),
    changes
  });
  return this.save();
};

// Static methods
dataMappingSchema.statics.findApplicableMappings = function(fieldType, scope, includeInactive = false) {
  const query = {
    fieldType,
    $or: [
      { 'scope.level': 'global' }
    ]
  };
  
  if (!includeInactive) {
    query.active = true;
  }
  
  // Add scope-specific queries based on what's provided
  if (scope.league) {
    query.$or.push({ 
      'scope.level': 'league', 
      'scope.league': scope.league 
    });
  }
  
  if (scope.sport) {
    query.$or.push({ 
      'scope.level': 'sport', 
      'scope.sport': scope.sport 
    });
  }
  
  if (scope.teamId) {
    query.$or.push({ 
      'scope.level': 'team', 
      'scope.teamId': scope.teamId 
    });
  }
  
  if (scope.playerId) {
    query.$or.push({ 
      'scope.level': 'player', 
      'scope.playerId': scope.playerId 
    });
  }
  
  return this.find(query).sort({ priority: -1, 'scope.level': -1 });
};

/**
 * Check if a specific value should be ignored in comparisons
 */
dataMappingSchema.statics.checkIgnored = async function(value, fieldType, scope) {
  if (!value) return false;

  const mappings = await this.findApplicableMappings(fieldType, scope);

  for (const mapping of mappings) {
    if (mapping.mappingType === 'ignore') {
      const primary = mapping.rules.caseSensitive
        ? mapping.rules.primaryValue
        : (mapping.rules.primaryValue || '').toLowerCase();
      const val = mapping.rules.caseSensitive ? value : value.toLowerCase();

      if (primary === val) {
        await mapping.incrementUsage();
        return true;
      }
    }
  }

  return false;
};

dataMappingSchema.statics.checkEquivalence = async function(value1, value2, fieldType, scope) {
  if (!value1 || !value2) return false;
  if (value1 === value2) return true;
  
  const mappings = await this.findApplicableMappings(fieldType, scope);
  
  for (const mapping of mappings) {
    if (mapping.mappingType === 'equivalence') {
      const values = [mapping.rules.primaryValue, ...mapping.rules.equivalents];
      const v1 = mapping.rules.caseSensitive ? value1 : value1.toLowerCase();
      const v2 = mapping.rules.caseSensitive ? value2 : value2.toLowerCase();
      const mappedValues = mapping.rules.caseSensitive 
        ? values 
        : values.map(v => v.toLowerCase());
      
      if (mappedValues.includes(v1) && mappedValues.includes(v2)) {
        await mapping.incrementUsage();
        return true;
      }
    } else if (mapping.mappingType === 'tolerance') {
      const num1 = parseFloat(value1);
      const num2 = parseFloat(value2);
      
      if (!isNaN(num1) && !isNaN(num2)) {
        const diff = Math.abs(num1 - num2);
        
        if (mapping.rules.toleranceType === 'percentage') {
          const percentDiff = (diff / Math.max(num1, num2)) * 100;
          if (percentDiff <= mapping.rules.tolerance) {
            await mapping.incrementUsage();
            return true;
          }
        } else {
          if (diff <= mapping.rules.tolerance) {
            await mapping.incrementUsage();
            return true;
          }
        }
      }
    } else if (mapping.mappingType === 'ignore') {
      const primaryVal = mapping.rules.primaryValue;
      if (primaryVal) {
        const caseSensitive = mapping.rules.caseSensitive;
        const pv = caseSensitive ? primaryVal : primaryVal.toLowerCase();
        const v1 = caseSensitive ? value1 : value1.toLowerCase();
        const v2 = caseSensitive ? value2 : value2.toLowerCase();
        if (v1 === pv || v2 === pv) {
          await mapping.incrementUsage();
          return true;
        }
      }
    }
  }
  
  return false;
};

// Virtual for display name
dataMappingSchema.virtual('displayName').get(function() {
  if (this.mappingType === 'equivalence') {
    return `${this.rules.primaryValue} = ${this.rules.equivalents.join(', ')}`;
  } else if (this.mappingType === 'tolerance') {
    return `±${this.rules.tolerance} ${this.rules.toleranceType === 'percentage' ? '%' : ''}`;
  } else if (this.mappingType === 'transformation') {
    return `Transform: ${this.rules.transformFunction}`;
  } else {
    return 'Ignore field';
  }
});

// Pre-save middleware
dataMappingSchema.pre('save', function(next) {
  // Add creation history entry
  if (this.isNew) {
    this.history.push({
      action: 'created',
      user: this.createdBy,
      timestamp: new Date()
    });
  }
  
  // Update lastSeen for auto-discovered mappings
  if (this.discoveryMetadata.isAutoDiscovered) {
    this.discoveryMetadata.lastSeen = new Date();
  }
  
  next();
});

module.exports = mongoose.model('DataMapping', dataMappingSchema);