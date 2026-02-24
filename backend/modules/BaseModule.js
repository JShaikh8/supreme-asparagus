// backend/modules/BaseModule.js
const ScrapedData = require('../models/ScrapedData');
const ScrapedDataHistory = require('../models/ScrapedDataHistory');
const MappingRule = require('../models/MappingRule');
const ComparisonResult = require('../models/ComparisonResult');
const crypto = require('crypto');
const logger = require('../utils/logger');

class BaseModule {
  constructor(config) {
    this.config = {
      id: config.id,
      name: config.name,
      league: config.league,
      sport: config.sport,
      dataType: config.dataType,
      validation: config.validation || {},
      cacheHours: config.cacheHours || 24,
      ...config
    };
  }
  
  // Abstract methods - must be implemented by each module
  generateMatchKey(record) {
    throw new Error('generateMatchKey must be implemented by ' + this.config.name);
  }
  
  transformData(rawData) {
    throw new Error('transformData must be implemented by ' + this.config.name);
  }
  
  // Validation methods
  validateRecord(record) {
    const errors = [];
    const warnings = [];
    
    // Check for required fields based on config
    if (this.config.validation?.requiredFields) {
      for (const field of this.config.validation.requiredFields) {
        if (!record[field]) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }
    
    return { 
      isValid: errors.length === 0, 
      errors, 
      warnings 
    };
  }
  
  // Save already-transformed data
  async saveTransformedData(teamId, transformedData, source, options = {}) {
    try {
      const { createBaseline = false } = options; // Extract createBaseline flag, default to false

      const matchKey = this.generateMatchKey(transformedData);

      const dataHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(transformedData))
        .digest('hex');

      const validation = this.validateRecord(transformedData);

      // BASELINE LOGIC: Check if existing data exists and createBaseline is enabled
      const existingData = await ScrapedData.findOne({
        matchKey,
        moduleId: this.config.id
      });

      if (existingData && createBaseline) {
        // Save existing data to history before overwriting
        try {
          // Delete any old baseline for this matchKey
          await ScrapedDataHistory.deleteMany({
            matchKey,
            moduleId: this.config.id
          });

          // Copy existing data to history
          await ScrapedDataHistory.create({
            matchKey: existingData.matchKey,
            moduleId: existingData.moduleId,
            teamId: existingData.teamId,
            sport: existingData.sport,
            league: existingData.league,
            dataType: existingData.dataType,
            source: existingData.source,
            data: existingData.data,
            dataHash: existingData.dataHash,
            version: existingData.version,
            validation: existingData.validation,
            savedAt: new Date(),
            originalCreatedAt: existingData.createdAt,
            originalUpdatedAt: existingData.updatedAt
          });

          logger.debug(`📦 Baseline saved for ${matchKey}`);
        } catch (baselineError) {
          // Don't fail the main save if baseline fails
          logger.warn(`⚠️  Failed to save baseline for ${matchKey}:`, baselineError.message);
        }
      }

      // Delete existing record
      await ScrapedData.deleteOne({
        matchKey,
        moduleId: this.config.id
      });

      // Create new record
      const scrapedData = await ScrapedData.create({
        matchKey,
        moduleId: this.config.id,
        teamId,
        sport: this.config.sport,
        league: this.config.league,
        dataType: this.config.dataType,
        source: {
          url: source.url,
          name: source.name,
          fetchedAt: new Date()
        },
        data: transformedData,
        dataHash,
        validation,
        expiresAt: new Date(Date.now() + this.config.cacheHours * 60 * 60 * 1000),
        version: 1
      });

      return scrapedData;

    } catch (error) {
      logger.error('Error saving transformed data:', error);
      throw error;
    }
  }
  
  // Legacy method - transforms then saves
  async saveScrapedData(teamId, rawData, source) {
    const transformedData = this.transformData(rawData);
    return this.saveTransformedData(teamId, transformedData, source);
  }
  
  // Get scraped data for this module
  async getScrapedData(filter = {}) {
    return await ScrapedData.find({
      moduleId: this.config.id,
      ...filter
    }).sort({ updatedAt: -1 });
  }

  // Get cached (non-expired) data for a specific team
  async getCachedData(teamId, additionalFilters = {}) {
    const now = new Date();
    const cachedData = await ScrapedData.find({
      moduleId: this.config.id,
      teamId,
      expiresAt: { $gt: now }, // Only get non-expired data
      ...additionalFilters
    }).sort({ updatedAt: -1 });

    if (cachedData.length > 0) {
      const expiresIn = Math.round((cachedData[0].expiresAt - now) / 1000 / 60); // minutes
      logger.debug(`💾 Cache HIT: Found ${cachedData.length} cached records for ${teamId} (expires in ${expiresIn} minutes)`);
    } else {
      logger.debug(`💾 Cache MISS: No cached data for ${teamId}`);
    }

    return cachedData;
  }

  // Get expired data that needs refreshing
  async getExpiredData() {
    return await ScrapedData.find({
      moduleId: this.config.id,
      expiresAt: { $lt: new Date() }
    });
  }
  
  // Get mapping rules for this module
  async getMappingRules() {
    return await MappingRule.find({
      moduleIds: this.config.id,
      active: true
    });
  }
  
  // Apply mapping rules to a value
  applyMapping(value, field, mappings) {
    if (!value || !mappings || mappings.length === 0) {
      return { original: value, mapped: value, applied: false };
    }
    
    const relevantMappings = mappings.filter(m =>
      m.rule.field === field && m.active
    );
    
    for (const mapping of relevantMappings) {
      const fromValue = mapping.rule.caseSensitive ?
        mapping.rule.from :
        mapping.rule.from.toLowerCase();
      
      const compareValue = mapping.rule.caseSensitive ?
        value :
        value?.toString().toLowerCase();
      
      if (fromValue === compareValue) {
        return {
          original: value,
          mapped: mapping.rule.to,
          mappingId: mapping._id,
          applied: true
        };
      }
      
      // Check bidirectional
      if (mapping.rule.bidirectional) {
        const toValue = mapping.rule.caseSensitive ?
          mapping.rule.to :
          mapping.rule.to.toLowerCase();
        
        if (toValue === compareValue) {
          return {
            original: value,
            mapped: mapping.rule.from,
            mappingId: mapping._id,
            applied: true
          };
        }
      }
    }
    
    return { original: value, mapped: value, applied: false };
  }
  
  // Apply all mappings to a record
  async applyMappingsToRecord(record) {
    const mappings = await this.getMappingRules();
    const mappedRecord = { ...record };
    const appliedMappings = [];
    
    for (const field in record) {
      const result = this.applyMapping(record[field], field, mappings);
      if (result.applied) {
        mappedRecord[field] = result.mapped;
        appliedMappings.push({
          field,
          original: result.original,
          mapped: result.mapped,
          mappingId: result.mappingId
        });
      }
    }
    
    return { mappedRecord, appliedMappings };
  }
  
  // Delete old data
  async cleanupOldData(daysToKeep = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const result = await ScrapedData.deleteMany({
      moduleId: this.config.id,
      updatedAt: { $lt: cutoffDate }
    });
    
    return result.deletedCount;
  }
  
  // Get statistics for this module
  async getStatistics() {
    const total = await ScrapedData.countDocuments({ moduleId: this.config.id });
    const valid = await ScrapedData.countDocuments({ 
      moduleId: this.config.id, 
      'validation.isValid': true 
    });
    const expired = await ScrapedData.countDocuments({
      moduleId: this.config.id,
      expiresAt: { $lt: new Date() }
    });
    
    return {
      total,
      valid,
      invalid: total - valid,
      expired,
      validationRate: total > 0 ? (valid / total * 100).toFixed(2) + '%' : '0%'
    };
  }
}

module.exports = BaseModule;