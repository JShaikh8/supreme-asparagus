// backend/services/mappingService.js
const DataMapping = require('../models/DataMapping');
const MappingSuggestion = require('../models/MappingSuggestion');

class MappingService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  // Get all applicable mappings for a comparison
  async getApplicableMappings(fieldType, scope) {
    const cacheKey = `${fieldType}:${JSON.stringify(scope)}`;
    
    // Check cache
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.mappings;
      }
    }
    
    // Build query based on scope hierarchy
    const queries = [
      { fieldType, 'scope.level': 'global', active: true }
    ];
    
    if (scope.league) {
      queries.push({
        fieldType,
        'scope.level': 'league',
        'scope.league': scope.league,
        active: true
      });
    }
    
    if (scope.sport) {
      queries.push({
        fieldType,
        'scope.level': 'sport',
        'scope.sport': scope.sport,
        active: true
      });
    }
    
    if (scope.teamId) {
      queries.push({
        fieldType,
        'scope.level': 'team',
        'scope.teamId': scope.teamId,
        active: true
      });
    }
    
    if (scope.playerId) {
      queries.push({
        fieldType,
        'scope.level': 'player',
        'scope.playerId': scope.playerId,
        active: true
      });
    }
    
    // Get all matching mappings
    const mappings = await DataMapping.find({
      $or: queries
    }).sort({ priority: -1, 'scope.level': -1 });
    
    // Cache results
    this.cache.set(cacheKey, {
      mappings,
      timestamp: Date.now()
    });
    
    return mappings;
  }

  // Check if two values are equivalent based on mappings
  async areEquivalent(value1, value2, fieldType, scope) {
    if (!value1 || !value2) return false;
    
    // Direct match
    if (value1 === value2) return true;
    
    const mappings = await this.getApplicableMappings(fieldType, scope);
    
    for (const mapping of mappings) {
      if (mapping.mappingType === 'equivalence') {
        const v1Lower = mapping.rules.caseSensitive ? value1 : value1.toLowerCase();
        const v2Lower = mapping.rules.caseSensitive ? value2 : value2.toLowerCase();
        
        // Check if both values map to the same primary value
        const values = [mapping.rules.primaryValue, ...mapping.rules.equivalents];
        const mappedValues = mapping.rules.caseSensitive ? values : values.map(v => v.toLowerCase());
        
        if (mappedValues.includes(v1Lower) && mappedValues.includes(v2Lower)) {
          return true;
        }
      } else if (mapping.mappingType === 'tolerance') {
        const num1 = parseFloat(value1);
        const num2 = parseFloat(value2);
        
        if (!isNaN(num1) && !isNaN(num2)) {
          const diff = Math.abs(num1 - num2);
          
          if (mapping.rules.toleranceType === 'percentage') {
            const percentDiff = (diff / Math.max(num1, num2)) * 100;
            if (percentDiff <= mapping.rules.tolerance) return true;
          } else {
            if (diff <= mapping.rules.tolerance) return true;
          }
        }
      } else if (mapping.mappingType === 'ignore') {
        // This mapping says to ignore this field entirely
        return true;
      }
    }
    
    return false;
  }

  // Record a potential mapping for auto-discovery
  async recordPotentialMapping(comparison) {
    // Don't suggest if values are already equal
    if (comparison.scrapedValue === comparison.sourceValue) return;
    
    // Look for existing suggestion
    const existing = await MappingSuggestion.findOne({
      'comparison.teamId': comparison.teamId,
      'comparison.fieldType': comparison.fieldType,
      'comparison.scrapedValue': comparison.scrapedValue,
      'comparison.sourceValue': comparison.sourceValue
    });
    
    if (existing) {
      existing.occurrences++;
      existing.lastSeen = new Date();
      existing.suggestion.confidence = Math.min(0.95, existing.occurrences * 0.1);
      await existing.save();
    } else {
      // Create new suggestion
      const suggestion = {
        mappingType: 'equivalence',
        primaryValue: comparison.sourceValue,
        equivalents: [comparison.scrapedValue],
        confidence: 0.1
      };
      
      // For numeric fields, suggest tolerance
      if (['weight', 'height'].includes(comparison.fieldType)) {
        const num1 = parseFloat(comparison.scrapedValue);
        const num2 = parseFloat(comparison.sourceValue);
        
        if (!isNaN(num1) && !isNaN(num2)) {
          suggestion.mappingType = 'tolerance';
          suggestion.tolerance = Math.abs(num1 - num2);
        }
      }
      
      await MappingSuggestion.create({
        comparison,
        suggestion
      });
    }
  }

  // Get pending suggestions for review
  async getPendingSuggestions(teamId = null) {
    const query = { status: 'pending' };
    if (teamId) query['comparison.teamId'] = teamId;
    
    return await MappingSuggestion.find(query)
      .sort({ 'suggestion.confidence': -1, occurrences: -1 })
      .limit(50);
  }

  // Accept a suggestion and create mapping
  async acceptSuggestion(suggestionId, scope, userId) {
    const suggestion = await MappingSuggestion.findById(suggestionId);
    if (!suggestion) throw new Error('Suggestion not found');
    
    // Create the mapping
    const mapping = await DataMapping.create({
      mappingType: suggestion.suggestion.mappingType,
      fieldType: suggestion.comparison.fieldType,
      scope,
      rules: {
        primaryValue: suggestion.suggestion.primaryValue,
        equivalents: suggestion.suggestion.equivalents,
        tolerance: suggestion.suggestion.tolerance
      },
      discoveryMetadata: {
        isAutoDiscovered: true,
        confidence: suggestion.suggestion.confidence,
        occurrences: suggestion.occurrences,
        firstSeen: suggestion.createdAt,
        lastSeen: suggestion.lastSeen,
        confirmedBy: userId
      },
      createdBy: userId
    });
    
    // Update suggestion
    suggestion.status = 'accepted';
    suggestion.reviewedBy = userId;
    suggestion.reviewedAt = new Date();
    suggestion.createdMappingId = mapping._id;
    await suggestion.save();
    
    // Clear cache
    this.cache.clear();
    
    return mapping;
  }
}

module.exports = new MappingService();