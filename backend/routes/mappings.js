// backend/routes/mappings.js
const express = require('express');
const router = express.Router();
const DataMapping = require('../models/DataMapping');
const MappingSuggestion = require('../models/MappingSuggestion');
const logger = require('../utils/logger');

// Create a new mapping (including player name mappings)
router.post('/create', async (req, res) => {
  try {
    const {
      mappingType,
      fieldType,
      scope,
      rules,
      appliesTo,
      notes,
      priority = 0
    } = req.body;

    logger.debug('📝 Creating mapping with scope:', JSON.stringify(scope, null, 2));

    // Validate required fields
    if (!mappingType || !fieldType || !scope || !rules) {
      return res.status(400).json({
        error: 'Missing required fields'
      });
    }

    // Create the mapping
    const mapping = new DataMapping({
      mappingType,
      fieldType,
      scope,
      rules,
      appliesTo: appliesTo || {
        scraped: true,
        api: true,
        oracle: true
      },
      priority,
      notes,
      active: true,
      createdBy: req.user?.id || 'system',
      createdAt: new Date(),
      usageStats: {
        timesUsed: 0,
        lastUsed: null
      }
    });

    await mapping.save();

    res.json({
      success: true,
      mapping: mapping.toObject(),
      message: `${fieldType} mapping created successfully`
    });

  } catch (error) {
    logger.error('Error creating mapping:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

// Get all mappings with filtering - FIXED VERSION
router.get('/list', async (req, res) => {
  try {
    logger.debug('📊 /list endpoint called with query params:', req.query);
    
    const {
      fieldType,
      mappingType,
      league,
      sport,
      teamId,
      active
    } = req.query;

    // Build query - start with empty object
    const query = {};
    
    if (fieldType) query.fieldType = fieldType;
    if (mappingType) query.mappingType = mappingType;
    
    // FIXED: Only filter by active if explicitly provided
    if (active !== undefined && active !== null && active !== '') {
      query.active = active === 'true' || active === true;
    }
    
    // Add scope-based filtering
    if (league || sport || teamId) {
      query.$or = [{ 'scope.level': 'global' }];
      
      if (league) {
        query.$or.push({
          'scope.level': 'league',
          'scope.league': league
        });
      }
      
      if (sport) {
        query.$or.push({
          'scope.level': 'sport',
          'scope.sport': sport
        });
      }
      
      if (teamId) {
        query.$or.push({
          'scope.level': 'team',
          'scope.teamId': teamId
        });
      }
    }

    logger.debug('🔍 MongoDB query:', JSON.stringify(query, null, 2));
    
    const mappings = await DataMapping.find(query)
      .sort({ priority: -1, createdAt: -1 });

    logger.debug(`✅ Found ${mappings.length} mappings`);

    res.json({
      success: true,
      count: mappings.length,
      mappings
    });

  } catch (error) {
    logger.error('❌ Error fetching mappings:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

// Get mappings for a specific player
router.get('/player/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;
    
    const mappings = await DataMapping.find({
      $or: [
        { 'scope.level': 'player', 'scope.playerId': playerId },
        { 'scope.level': 'global' }
      ],
      active: true
    });

    res.json({
      success: true,
      count: mappings.length,
      mappings
    });

  } catch (error) {
    logger.error('Error fetching player mappings:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

// Update a mapping
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const mapping = await DataMapping.findByIdAndUpdate(
      id,
      {
        ...updates,
        'usageStats.lastModified': new Date()
      },
      { new: true }
    );

    if (!mapping) {
      return res.status(404).json({
        error: 'Mapping not found'
      });
    }

    res.json({
      success: true,
      mapping
    });

  } catch (error) {
    logger.error('Error updating mapping:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

// Delete a mapping
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const mapping = await DataMapping.findByIdAndDelete(id);

    if (!mapping) {
      return res.status(404).json({
        error: 'Mapping not found'
      });
    }

    res.json({
      success: true,
      message: 'Mapping deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting mapping:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

// Get mapping suggestions
router.get('/suggestions', async (req, res) => {
  try {
    const { teamId, status = 'pending' } = req.query;

    const query = { status };
    if (teamId) query['comparison.teamId'] = teamId;

    const suggestions = await MappingSuggestion.find(query)
      .sort({ 'suggestion.confidence': -1, occurrences: -1 })
      .limit(50);

    res.json({
      success: true,
      count: suggestions.length,
      suggestions
    });

  } catch (error) {
    logger.error('Error fetching suggestions:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

// Accept a suggestion and create a mapping
router.post('/suggestions/:id/accept', async (req, res) => {
  try {
    const { id } = req.params;
    const { scope } = req.body;

    const suggestion = await MappingSuggestion.findById(id);
    if (!suggestion) {
      return res.status(404).json({
        error: 'Suggestion not found'
      });
    }

    // Create mapping from suggestion
    const mapping = new DataMapping({
      mappingType: suggestion.suggestion.mappingType,
      fieldType: suggestion.comparison.fieldType,
      scope: scope || {
        level: 'team',
        teamId: suggestion.comparison.teamId,
        league: suggestion.comparison.league,
        sport: suggestion.comparison.sport
      },
      rules: {
        primaryValue: suggestion.suggestion.primaryValue,
        equivalents: suggestion.suggestion.equivalents,
        caseSensitive: false
      },
      priority: 0,
      active: true,
      notes: `Auto-created from suggestion: ${suggestion.comparison.scrapedValue} = ${suggestion.comparison.sourceValue}`,
      createdBy: req.user?.id || 'system',
      discoveryMetadata: {
        isAutoDiscovered: true,
        confidence: suggestion.suggestion.confidence,
        firstSeen: suggestion.createdAt,
        lastSeen: suggestion.lastSeen,
        occurrences: suggestion.occurrences
      }
    });

    await mapping.save();

    // Update suggestion status
    suggestion.status = 'accepted';
    suggestion.reviewedBy = req.user?.id || 'system';
    suggestion.reviewedAt = new Date();
    suggestion.createdMappingId = mapping._id;
    await suggestion.save();

    res.json({
      success: true,
      mapping,
      message: 'Suggestion accepted and mapping created'
    });

  } catch (error) {
    logger.error('Error accepting suggestion:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

// Get unmapped TV broadcasters for easy mapping
// Returns Oracle broadcasters that don't have mappings, and all available fetched broadcasters
router.post('/unmapped-tv', async (req, res) => {
  try {
    const { oracleBroadcasters = [], fetchedBroadcasters = [], scope = {} } = req.body;

    logger.debug('📺 Getting unmapped TV broadcasters');
    logger.debug('Oracle:', oracleBroadcasters);
    logger.debug('Fetched:', fetchedBroadcasters);

    // Get all existing TV mappings for this scope
    const mappingQuery = {
      fieldType: 'tv',
      active: true,
      $or: [{ 'scope.level': 'global' }]
    };

    if (scope.league) {
      mappingQuery.$or.push({
        'scope.level': 'league',
        'scope.league': scope.league
      });
    }

    if (scope.sport) {
      mappingQuery.$or.push({
        'scope.level': 'sport',
        'scope.sport': scope.sport
      });
    }

    if (scope.teamId) {
      mappingQuery.$or.push({
        'scope.level': 'team',
        'scope.teamId': scope.teamId
      });
    }

    const existingMappings = await DataMapping.find(mappingQuery);
    logger.debug(`Found ${existingMappings.length} existing TV mappings`);

    // Build a set of all mapped values (both primary and equivalents)
    const mappedValues = new Set();
    const mappingPairs = []; // Track what maps to what

    for (const mapping of existingMappings) {
      if (mapping.mappingType === 'equivalence') {
        const primary = mapping.rules.primaryValue?.toLowerCase();
        const equivalents = (mapping.rules.equivalents || []).map(e => e.toLowerCase());

        if (primary) mappedValues.add(primary);
        equivalents.forEach(e => mappedValues.add(e));

        // Track mapping pairs
        mappingPairs.push({
          primary: mapping.rules.primaryValue,
          equivalents: mapping.rules.equivalents,
          mappingId: mapping._id
        });
      }
    }

    // Find unmapped Oracle broadcasters
    const unmappedOracle = oracleBroadcasters.filter(b => {
      const bLower = b.toLowerCase();
      // Check if this broadcaster is mapped OR if it matches a fetched broadcaster directly
      const isMapped = mappedValues.has(bLower);
      const hasDirectMatch = fetchedBroadcasters.some(f => f.toLowerCase() === bLower);
      return !isMapped && !hasDirectMatch;
    });

    // Find unmapped fetched broadcasters
    const unmappedFetched = fetchedBroadcasters.filter(b => {
      const bLower = b.toLowerCase();
      // Check if this broadcaster is mapped OR if it matches an Oracle broadcaster directly
      const isMapped = mappedValues.has(bLower);
      const hasDirectMatch = oracleBroadcasters.some(o => o.toLowerCase() === bLower);
      return !isMapped && !hasDirectMatch;
    });

    // Also return all available options for the dropdown
    const allFetchedOptions = [...new Set(fetchedBroadcasters)].sort();
    const allOracleOptions = [...new Set(oracleBroadcasters)].sort();

    res.json({
      success: true,
      unmappedOracle,
      unmappedFetched,
      allFetchedOptions,
      allOracleOptions,
      existingMappings: mappingPairs,
      summary: {
        totalOracle: oracleBroadcasters.length,
        totalFetched: fetchedBroadcasters.length,
        unmappedOracleCount: unmappedOracle.length,
        unmappedFetchedCount: unmappedFetched.length,
        existingMappingsCount: existingMappings.length
      }
    });

  } catch (error) {
    logger.error('Error getting unmapped TV broadcasters:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

// Bulk create TV mappings
router.post('/bulk-tv-mappings', async (req, res) => {
  try {
    const { mappings, scope } = req.body;

    if (!mappings || !Array.isArray(mappings) || mappings.length === 0) {
      return res.status(400).json({
        error: 'No mappings provided'
      });
    }

    logger.debug(`📺 Creating ${mappings.length} TV mappings`);

    const created = [];
    const errors = [];

    for (const m of mappings) {
      try {
        // Skip if mapping to N/A (user chose not to map)
        if (m.mappedTo === 'N/A' || !m.mappedTo) {
          continue;
        }

        const isIgnore = m.mappedTo === 'IGNORE' || m.type === 'ignore';

        const mapping = new DataMapping({
          mappingType: isIgnore ? 'ignore' : 'equivalence',
          fieldType: 'tv',
          scope: scope || { level: 'global' },
          rules: isIgnore
            ? { primaryValue: m.oracle, caseSensitive: false, ignoreReason: `Ignored TV broadcaster: ${m.oracle}` }
            : { primaryValue: m.oracle, equivalents: [m.mappedTo], caseSensitive: false },
          appliesTo: {
            scraped: true,
            api: true,
            oracle: true
          },
          priority: 0,
          active: true,
          notes: isIgnore ? `TV broadcaster ignored: ${m.oracle}` : `TV broadcaster mapping: ${m.oracle} = ${m.mappedTo}`,
          createdBy: 'user',
          createdAt: new Date(),
          usageStats: {
            timesUsed: 0,
            lastUsed: null
          }
        });

        await mapping.save();
        created.push(mapping);
      } catch (err) {
        errors.push({ oracle: m.oracle, error: err.message });
      }
    }

    res.json({
      success: true,
      created: created.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Created ${created.length} TV mappings`
    });

  } catch (error) {
    logger.error('Error creating bulk TV mappings:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

// Test if two values are equivalent based on mappings
router.post('/test-equivalence', async (req, res) => {
  try {
    const {
      value1,
      value2,
      fieldType,
      scope = {}
    } = req.body;

    // Direct match
    if (value1 === value2) {
      return res.json({
        equivalent: true,
        reason: 'Direct match'
      });
    }

    // Find applicable mappings
    const mappings = await DataMapping.findApplicableMappings(fieldType, scope);

    for (const mapping of mappings) {
      if (mapping.mappingType === 'equivalence') {
        const values = [mapping.rules.primaryValue, ...mapping.rules.equivalents];
        const v1 = mapping.rules.caseSensitive ? value1 : value1.toLowerCase();
        const v2 = mapping.rules.caseSensitive ? value2 : value2.toLowerCase();
        const mappedValues = mapping.rules.caseSensitive ? 
          values : values.map(v => v.toLowerCase());

        if (mappedValues.includes(v1) && mappedValues.includes(v2)) {
          return res.json({
            equivalent: true,
            reason: 'Mapped equivalence',
            mapping: mapping.toObject()
          });
        }
      }
    }

    res.json({
      equivalent: false,
      reason: 'No mapping found'
    });

  } catch (error) {
    logger.error('Error testing equivalence:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

module.exports = router;