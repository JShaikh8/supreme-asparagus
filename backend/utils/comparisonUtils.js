// backend/utils/comparisonUtils.js
const DataMapping = require('../models/DataMapping');
const logger = require('./logger');

async function performComparison(scrapedData, sourceData, sport, teamId, league, sourceType) {
  logger.debug(`Starting comparison for sport: ${sport}, team: ${teamId}, league: ${league}, source: ${sourceType}`);

  // Helper function to convert height formats to inches for comparison
  const normalizeHeight = (height) => {
    if (!height) return null;

    const heightStr = height.toString().trim();

    // Check if it's already in inches (just a number)
    if (/^\d+$/.test(heightStr)) {
      return parseInt(heightStr);
    }

    // Check for feet'inches" format (e.g., 6'2", 6-2, 6'2)
    const feetInchesMatch = heightStr.match(/(\d+)['\-](\d+)/);
    if (feetInchesMatch) {
      const feet = parseInt(feetInchesMatch[1]);
      const inches = parseInt(feetInchesMatch[2]);
      return feet * 12 + inches;
    }

    // Check for feet-inches with explicit labels
    const feetInchesMatch2 = heightStr.match(/(\d+)\s*(?:ft|feet)\s*(\d+)/i);
    if (feetInchesMatch2) {
      const feet = parseInt(feetInchesMatch2[1]);
      const inches = parseInt(feetInchesMatch2[2]);
      return feet * 12 + inches;
    }

    // Check for cm format
    const cmMatch = heightStr.match(/(\d+)\s*cm/i);
    if (cmMatch) {
      const cm = parseInt(cmMatch[1]);
      return Math.round(cm / 2.54);
    }

    return null;
  };

  // Helper function to check if heights are equivalent
  const heightsAreEquivalent = (height1, height2, tolerance = 0) => {
    const h1 = normalizeHeight(height1);
    const h2 = normalizeHeight(height2);

    if (h1 === null || h2 === null) return false;

    return Math.abs(h1 - h2) <= tolerance;
  };

  const scrapedPlayers = scrapedData.map(item => ({
    ...item.data,
    _id: item._id
  }));

  const comparison = {
    totalScraped: scrapedPlayers.length,
    totalSource: sourceData.length,
    matches: [],
    missingInScraped: [],
    missingInSource: [],
    discrepancies: [],
    mappedFields: {}  // Track which fields are resolved by mappings
  };

  // Get all applicable mappings for this comparison (including NAME mappings)
  const mappingQuery = {
    active: true,
    $or: [
      { 'scope.level': 'global' }
    ]
  };

  if (league) {
    mappingQuery.$or.push({
      'scope.level': 'league',
      'scope.league': league
    });
  }

  if (sport) {
    mappingQuery.$or.push({
      'scope.level': 'sport',
      'scope.sport': sport
    });
  }

  if (teamId) {
    mappingQuery.$or.push({
      'scope.level': 'team',
      'scope.teamId': teamId
    });
  }

  // Filter by source type
  if (sourceType === 'api') {
    mappingQuery['appliesTo.api'] = true;
  } else if (sourceType === 'oracle') {
    mappingQuery['appliesTo.oracle'] = true;
  }
  mappingQuery['appliesTo.scraped'] = true;

  const mappings = await DataMapping.find(mappingQuery);
  logger.debug(`Found ${mappings.length} applicable mappings`);

  // Separate name mappings from other field mappings
  const nameMappings = mappings.filter(m => m.fieldType === 'name');
  const fieldMappings = mappings.filter(m => m.fieldType !== 'name');
  logger.debug(`Found ${nameMappings.length} name mappings and ${fieldMappings.length} field mappings`);

  // Helper function to get mapped name
  const getMappedName = (name) => {
    if (!name) return name;

    // Normalize Unicode characters (NFC form) to handle special characters like Ö, é, etc.
    const nameTrimmed = name.trim().normalize('NFC');
    const nameLower = nameTrimmed.toLowerCase();

    for (const mapping of nameMappings) {
      if (mapping.mappingType === 'equivalence') {
        const values = [mapping.rules.primaryValue, ...mapping.rules.equivalents];
        const mappedValues = mapping.rules.caseSensitive
          ? values.map(v => v.normalize('NFC'))
          : values.map(v => v.normalize('NFC').toLowerCase().trim());

        // If this name is in the mapping values, return the primary value
        if (mappedValues.includes(mapping.rules.caseSensitive ? nameTrimmed : nameLower)) {
          logger.debug(`Name mapping found: "${name}" -> "${mapping.rules.primaryValue}"`);
          return mapping.rules.primaryValue;
        }
      }
    }
    return name; // Return original if no mapping found
  };

  // Helper function to check if values are equivalent based on mappings (for non-name fields)
  const checkMapping = async (value1, value2, fieldType) => {
    if (!value1 || !value2) return { isEquivalent: false, isMapped: false };

    const v1String = value1.toString().trim();
    const v2String = value2.toString().trim();

    // Direct match
    if (v1String === v2String) return { isEquivalent: true, isMapped: false };

    // Special handling for height - auto-convert different formats
    if (fieldType === 'height') {
      if (heightsAreEquivalent(v1String, v2String)) {
        return { isEquivalent: true, isMapped: true, isAutoConverted: true };
      }
    }

    // Check mappings for this field
    // For name field type, check nameMappings; for others, check fieldMappings
    const relevantMappings = fieldType === 'name'
      ? nameMappings.filter(m => m.fieldType === fieldType)
      : fieldMappings.filter(m => m.fieldType === fieldType);
    logger.debug(`Checking ${relevantMappings.length} mappings for field ${fieldType}: "${v1String}" vs "${v2String}"`);

    for (const mapping of relevantMappings) {
      if (mapping.mappingType === 'equivalence') {
        const values = [mapping.rules.primaryValue, ...mapping.rules.equivalents];

        const v1Lower = v1String.toLowerCase();
        const v2Lower = v2String.toLowerCase();
        const mappedValues = mapping.rules.caseSensitive
          ? values
          : values.map(v => v.toLowerCase());

        const v1InSet = mappedValues.includes(mapping.rules.caseSensitive ? v1String : v1Lower);
        const v2InSet = mappedValues.includes(mapping.rules.caseSensitive ? v2String : v2Lower);

        if (v1InSet && v2InSet) {
          logger.debug(`Matched via mapping: ${v1String} = ${v2String}`);
          // Increment usage stats
          await DataMapping.findByIdAndUpdate(
            mapping._id,
            {
              $inc: { 'usageStats.timesUsed': 1, 'usageStats.successfulMatches': 1 },
              $set: { 'usageStats.lastUsed': new Date() }
            }
          );
          return { isEquivalent: true, isMapped: true, mappingId: mapping._id };
        }
      } else if (mapping.mappingType === 'tolerance') {
        const num1 = parseFloat(v1String);
        const num2 = parseFloat(v2String);

        if (!isNaN(num1) && !isNaN(num2)) {
          const diff = Math.abs(num1 - num2);

          if (mapping.rules.toleranceType === 'percentage') {
            const percentDiff = (diff / Math.max(num1, num2)) * 100;
            if (percentDiff <= mapping.rules.tolerance) {
              logger.debug(`Matched via percentage tolerance: ${v1String} ≈ ${v2String} (${percentDiff.toFixed(1)}%)`);
              await DataMapping.findByIdAndUpdate(
                mapping._id,
                {
                  $inc: { 'usageStats.timesUsed': 1, 'usageStats.successfulMatches': 1 },
                  $set: { 'usageStats.lastUsed': new Date() }
                }
              );
              return { isEquivalent: true, isMapped: true, mappingId: mapping._id };
            }
          } else {
            if (diff <= mapping.rules.tolerance) {
              logger.debug(`Matched via absolute tolerance: ${v1String} ≈ ${v2String} (diff: ${diff})`);
              await DataMapping.findByIdAndUpdate(
                mapping._id,
                {
                  $inc: { 'usageStats.timesUsed': 1, 'usageStats.successfulMatches': 1 },
                  $set: { 'usageStats.lastUsed': new Date() }
                }
              );
              return { isEquivalent: true, isMapped: true, mappingId: mapping._id };
            }
          }
        }
      } else if (mapping.mappingType === 'ignore') {
        // Check if either value matches the ignore mapping's primary value
        const primaryValue = mapping.rules.primaryValue;
        const v1Lower = v1String.toLowerCase();
        const v2Lower = v2String.toLowerCase();
        const primaryLower = primaryValue ? primaryValue.toLowerCase() : '';

        if (v1Lower === primaryLower || v2Lower === primaryLower) {
          logger.debug(`Field ignored by mapping for value: "${primaryValue}"`);
          return { isEquivalent: true, isMapped: true, mappingId: mapping._id };
        }
      }
    }

    return { isEquivalent: false, isMapped: false };
  };

  // Normalize name for matching (remove extra spaces, lowercase, remove suffixes)
  const normalizeName = (name) => {
    if (!name) return '';
    return name.normalize('NFC') // Normalize Unicode first
      .replace(/[\u2018\u2019]/g, "'") // Replace curly single quotes with straight apostrophe
      .replace(/[\u201C\u201D]/g, '"') // Replace curly double quotes with straight quotes
      .toLowerCase()
      .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
      .replace(/jr\.?|sr\.?|ii|iii|iv/gi, '') // Remove suffixes
      .trim();
  };

  // Create maps for efficient lookup by normalized name WITH name mapping applied
  const scrapedByName = new Map();
  scrapedPlayers.forEach(player => {
    const originalName = player.displayName ||
      player.fullName ||
      `${player.firstName || ''} ${player.lastName || ''}`;

    // Apply name mapping BEFORE normalizing
    const mappedName = getMappedName(originalName);
    const normalizedName = normalizeName(mappedName);

    if (normalizedName) {
      scrapedByName.set(normalizedName, {
        ...player,
        originalName: originalName,
        mappedName: mappedName
      });
    }
  });

  const sourceByName = new Map();
  sourceData.forEach(player => {
    const originalName = player.displayName ||
      player.fullName ||
      player.player ||
      `${player.firstName || ''} ${player.lastName || ''}`;

    // Apply name mapping BEFORE normalizing
    const mappedName = getMappedName(originalName);
    const normalizedName = normalizeName(mappedName);

    if (normalizedName) {
      sourceByName.set(normalizedName, {
        ...player,
        originalName: originalName,
        mappedName: mappedName
      });
    }
  });

  // Track which names have been matched
  const matchedScrapedNames = new Set();

  // Find matches and discrepancies
  for (const [sourceName, sourcePlayer] of sourceByName.entries()) {
    const matchedPlayer = scrapedByName.get(sourceName);

    if (matchedPlayer) {
      matchedScrapedNames.add(sourceName);
      const discrepancies = [];
      const playerMappings = {};

      // Check if names were matched via mapping
      if (sourcePlayer.originalName !== matchedPlayer.originalName &&
          sourcePlayer.mappedName === matchedPlayer.mappedName) {
        playerMappings.name = true;
        logger.debug(`Names matched via mapping: "${sourcePlayer.originalName}" = "${matchedPlayer.originalName}"`);
      }

      // Check for discrepancies in jersey number
      if (sourcePlayer.jersey && matchedPlayer.jersey) {
        const jerseyCheck = await checkMapping(
          matchedPlayer.jersey,
          sourcePlayer.jersey,
          'jersey'
        );

        if (!jerseyCheck.isEquivalent) {
          discrepancies.push({
            field: 'jersey',
            source: sourcePlayer.jersey,
            scraped: matchedPlayer.jersey
          });
        } else if (jerseyCheck.isMapped) {
          playerMappings.jersey = true;
        }
      }

      // Check position discrepancy
      if (sourcePlayer.position && matchedPlayer.position) {
        const positionCheck = await checkMapping(
          matchedPlayer.position,
          sourcePlayer.position || sourcePlayer.positionAbbr,
          'position'
        );

        if (!positionCheck.isEquivalent) {
          discrepancies.push({
            field: 'position',
            source: sourcePlayer.position || sourcePlayer.positionAbbr,
            scraped: matchedPlayer.position
          });
        } else if (positionCheck.isMapped) {
          playerMappings.position = true;
        }
      }

      // Check weight discrepancy (skip for women's sports)
      const isWomensSport = sport === 'womensBasketball' || sport?.toLowerCase().includes('women');

      if (!isWomensSport && sourcePlayer.weight && matchedPlayer.weight) {
        const weightCheck = await checkMapping(
          matchedPlayer.weight,
          sourcePlayer.weight,
          'weight'
        );

        if (!weightCheck.isEquivalent) {
          discrepancies.push({
            field: 'weight',
            source: sourcePlayer.weight.toString(),
            scraped: matchedPlayer.weight.toString()
          });
        } else if (weightCheck.isMapped) {
          playerMappings.weight = true;
        }
      }

      // Check height discrepancy
      if (sourcePlayer.height && matchedPlayer.height) {
        const heightCheck = await checkMapping(
          matchedPlayer.height,
          sourcePlayer.height,
          'height'
        );

        if (!heightCheck.isEquivalent) {
          discrepancies.push({
            field: 'height',
            source: sourcePlayer.height,
            scraped: matchedPlayer.height
          });
        } else if (heightCheck.isMapped || heightCheck.isAutoConverted) {
          playerMappings.height = true;
        }
      }

      // Check year/eligibility discrepancy
      const sourceYear = (sourcePlayer.year || sourcePlayer.eligibility || '').toString();
      const scrapedYear = (matchedPlayer.year || matchedPlayer.eligibility || '').toString();

      if (sourceYear && scrapedYear) {
        const yearCheck = await checkMapping(scrapedYear, sourceYear, 'year');

        if (!yearCheck.isEquivalent) {
          // Also check eligibility field if year didn't match
          const eligibilityCheck = await checkMapping(scrapedYear, sourceYear, 'eligibility');

          if (!eligibilityCheck.isEquivalent) {
            discrepancies.push({
              field: 'year',
              source: sourceYear,
              scraped: scrapedYear
            });
          } else if (eligibilityCheck.isMapped) {
            playerMappings.year = true;
          }
        } else if (yearCheck.isMapped) {
          playerMappings.year = true;
        }
      }

      // Store mappings for this player
      if (Object.keys(playerMappings).length > 0) {
        comparison.mappedFields[sourceName] = playerMappings;
      }

      comparison.matches.push({
        player: sourcePlayer.originalName,
        scrapedName: matchedPlayer.originalName,
        sourceJersey: sourcePlayer.jersey,
        scrapedJersey: matchedPlayer.jersey,
        discrepancies,
        mappedFields: playerMappings
      });

      if (discrepancies.length > 0) {
        comparison.discrepancies.push({
          player: sourcePlayer.originalName || sourcePlayer.displayName || sourceName,
          sourceJersey: sourcePlayer.jersey,
          scrapedJersey: matchedPlayer.jersey,
          discrepancies
        });
      }
    } else {
      // Player exists in source but not in scraped
      // Check if this player should be ignored
      const playerName = sourcePlayer.originalName || sourcePlayer.displayName || sourcePlayer.fullName ||
                        sourcePlayer.player || `${sourcePlayer.firstName || ''} ${sourcePlayer.lastName || ''}`;

      logger.debug(`Checking if player should be ignored: "${playerName}"`);
      const ignoreCheck = await checkMapping(playerName, '__CHECK_IGNORE__', 'name');

      // Always add to missing list, but mark as ignored if applicable
      const playerEntry = {
        player: playerName,
        jersey: sourcePlayer.jersey,
        position: sourcePlayer.position || sourcePlayer.positionAbbr
      };

      if (ignoreCheck.isEquivalent && ignoreCheck.isMapped) {
        playerEntry.isIgnored = true;
        logger.debug(`Player "${playerName}" is ignored via mapping - marking as ignored in missing in scraped`);
      }

      comparison.missingInScraped.push(playerEntry);
    }
  }

  // Find players in scraped but not in source
  for (const [scrapedName, scrapedPlayer] of scrapedByName.entries()) {
    if (!matchedScrapedNames.has(scrapedName)) {
      // Check if this player should be ignored
      const playerName = scrapedPlayer.originalName || scrapedPlayer.displayName || scrapedPlayer.fullName ||
                        `${scrapedPlayer.firstName || ''} ${scrapedPlayer.lastName || ''}`;

      logger.debug(`Checking if player should be ignored: "${playerName}"`);
      const ignoreCheck = await checkMapping(playerName, '__CHECK_IGNORE__', 'name');

      // Always add to missing list, but mark as ignored if applicable
      const playerEntry = {
        player: playerName,
        displayName: playerName,
        jersey: scrapedPlayer.jersey,
        position: scrapedPlayer.position
      };

      if (ignoreCheck.isEquivalent && ignoreCheck.isMapped) {
        playerEntry.isIgnored = true;
        logger.debug(`Player "${playerName}" is ignored via mapping - marking as ignored in missing in source`);
      }

      comparison.missingInSource.push(playerEntry);
    }
  }

  // Calculate match percentage (excluding ignored players)
  const ignoredInSource = comparison.missingInSource.filter(p => p.isIgnored).length;
  const ignoredInScraped = comparison.missingInScraped.filter(p => p.isIgnored).length;
  const totalIgnored = ignoredInSource + ignoredInScraped;

  const totalUniquePlayers = new Set([
    ...Array.from(scrapedByName.keys()),
    ...Array.from(sourceByName.keys())
  ]).size;

  // Subtract ignored players from total when calculating match percentage
  const effectiveTotalPlayers = totalUniquePlayers - totalIgnored;
  comparison.matchPercentage = effectiveTotalPlayers > 0
    ? Math.round((comparison.matches.length / effectiveTotalPlayers) * 100)
    : 0;

  // Add summary statistics (excluding ignored players from counts)
  comparison.summary = {
    perfectMatches: comparison.matches.filter(m => m.discrepancies.length === 0).length,
    matchesWithDiscrepancies: comparison.discrepancies.length,
    uniqueToScraped: comparison.missingInSource.filter(p => !p.isIgnored).length,  // In Sidearm, not in Oracle (excluding ignored)
    uniqueToSource: comparison.missingInScraped.filter(p => !p.isIgnored).length,  // In Oracle, not in Sidearm (excluding ignored)
    missingInSource: comparison.missingInSource.length,  // Total including ignored (for frontend to show all)
    missingInScraped: comparison.missingInScraped.length, // Total including ignored (for frontend to show all)
    totalMappingsUsed: Object.keys(comparison.mappedFields).length,
    nameMappingsUsed: nameMappings.length,
    ignoredPlayers: totalIgnored  // Track how many are ignored
  };

  logger.debug(`Comparison complete: ${comparison.matchPercentage}% match rate`);
  logger.debug(`${comparison.summary.totalMappingsUsed} field mappings used, ${nameMappings.length} name mappings available`);
  if (totalIgnored > 0) {
    logger.debug(`${totalIgnored} players ignored and excluded from match rate calculation`);
  }

  return comparison;
}

// Stats comparison for game-by-game stats (not roster)
async function performStatsComparison(scrapedPlayers, sourcePlayers, sport, teamId, league, sourceType) {
  logger.debug(`Starting stats comparison for sport: ${sport}, team: ${teamId}, source: ${sourceType}`);

  const comparison = {
    totalScraped: scrapedPlayers.length,
    totalSource: sourcePlayers.length,
    matches: [],
    missingInScraped: [],
    missingInSource: [],
    discrepancies: [],
    mappedFields: {}
  };

  // Get name mappings (same as roster comparison)
  const mappingQuery = {
    active: true,
    fieldType: 'name',
    $or: [
      { 'scope.level': 'global' }
    ]
  };

  if (league) {
    mappingQuery.$or.push({
      'scope.level': 'league',
      'scope.league': league
    });
  }

  if (sport) {
    mappingQuery.$or.push({
      'scope.level': 'sport',
      'scope.sport': sport
    });
  }

  if (teamId) {
    mappingQuery.$or.push({
      'scope.level': 'team',
      'scope.teamId': teamId
    });
  }

  if (sourceType === 'api') {
    mappingQuery['appliesTo.api'] = true;
  } else if (sourceType === 'oracle') {
    mappingQuery['appliesTo.oracle'] = true;
  }
  mappingQuery['appliesTo.scraped'] = true;

  const nameMappings = await DataMapping.find(mappingQuery);
  logger.debug(`Found ${nameMappings.length} name mappings for stats comparison`);

  // Helper to get mapped name
  const getMappedName = (name) => {
    if (!name) return name;
    // Normalize Unicode characters (NFC form) to handle special characters like Ö, é, etc.
    const nameTrimmed = name.trim().normalize('NFC');
    const nameLower = nameTrimmed.toLowerCase();

    for (const mapping of nameMappings) {
      if (mapping.mappingType === 'equivalence') {
        const values = [mapping.rules.primaryValue, ...mapping.rules.equivalents];
        const mappedValues = mapping.rules.caseSensitive
          ? values.map(v => v.normalize('NFC'))
          : values.map(v => v.normalize('NFC').toLowerCase().trim());

        if (mappedValues.includes(mapping.rules.caseSensitive ? nameTrimmed : nameLower)) {
          return mapping.rules.primaryValue;
        }
      }
    }
    return name;
  };

  // Normalize name
  const normalizeName = (name) => {
    if (!name) return '';
    return name.normalize('NFC') // Normalize Unicode first
      .replace(/[\u2018\u2019]/g, "'") // Replace curly single quotes with straight apostrophe
      .replace(/[\u201C\u201D]/g, '"') // Replace curly double quotes with straight quotes
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/jr\.?|sr\.?|ii|iii|iv/gi, '')
      .trim();
  };

  // Check if player has any offensive stats (passing, rushing, receiving for football; points/FG for basketball)
  const hasOffensiveStats = (player) => {
    const checkCategory = (category) => {
      if (!category) return false;
      return Object.values(category).some(val => val && val !== 0);
    };

    // Basketball - check if player has meaningful stats (points, FG attempts, or minutes played)
    if (sport === 'mensBasketball' || sport === 'womensBasketball') {
      return player.points > 0 ||
             player.fieldGoals?.attempts > 0 ||
             player.assists > 0 ||
             player.rebounds?.total > 0 ||
             (player.minutesPlayed && player.minutesPlayed !== '0:00' && player.minutesPlayed !== 0);
    }

    // Football - original logic
    return checkCategory(player.passing) ||
           checkCategory(player.rushing) ||
           checkCategory(player.receiving);
  };

  // Create maps by name only (no jersey) for matching
  // NOTE: "Team" is a real player entry (used when stats person doesn't know who), not aggregate stats
  const scrapedByKey = new Map();
  scrapedPlayers.forEach(player => {
      const originalName = player.fullName || player.name || `${player.firstName || ''} ${player.lastName || ''}`;
      const mappedName = getMappedName(originalName);
      const normalizedName = normalizeName(mappedName);

      scrapedByKey.set(normalizedName, {
        ...player,
        originalName,
        mappedName
      });
    });

  const sourceByKey = new Map();
  sourcePlayers.forEach(player => {
      const originalName = player.fullName || player.displayName || `${player.firstName || ''} ${player.lastName || ''}`;
      const mappedName = getMappedName(originalName);
      const normalizedName = normalizeName(mappedName);

      sourceByKey.set(normalizedName, {
        ...player,
        originalName,
        mappedName
      });
    });

  const matchedScrapedKeys = new Set();

  // Stats to exclude from comparison (Oracle doesn't have these or they're just rounding differences)
  const excludedStats = {
    // Football
    rushing: ['yardsGained', 'yardsLost', 'average'], // Oracle only stores net yards, not gains/losses breakdown
    receiving: ['average'],
    passing: ['rating', 'sackedYards'], // Oracle doesn't store passer rating or sack yards separately
    punting: ['average', 'inside20', 'fairCatches', 'plus50', 'touchbacks', 'blocked'],
    defense: ['*'], // Defensive stats not displayed in comparison tables - exclude all
    // Basketball
    fieldGoals: ['percentage'], // Calculated field, may have rounding differences
    threePointers: ['percentage'], // Calculated field
    freeThrows: ['percentage'] // Calculated field
  };

  // Compare stats for matched players
  for (const [sourceKey, sourcePlayer] of sourceByKey.entries()) {
    const matchedPlayer = scrapedByKey.get(sourceKey);

    if (matchedPlayer) {
      matchedScrapedKeys.add(sourceKey);
      const statDiscrepancies = [];

      // Reusable compareStats function with exclusion logic
      // Checks keys from BOTH objects so discrepancies are caught regardless of which side has the stat
      const compareStats = (category, statsObj1, statsObj2) => {
        const diffs = [];
        const excluded = excludedStats[category] || [];
        // If wildcard '*' is in exclusions, skip entire category
        if (excluded.includes('*')) return diffs;
        const allKeys = new Set([...Object.keys(statsObj1 || {}), ...Object.keys(statsObj2 || {})]);
        for (const stat of allKeys) {
          // Skip excluded stats
          if (excluded.includes(stat)) continue;

          const val1 = (statsObj1 || {})[stat] || 0;
          const val2 = (statsObj2 || {})[stat] || 0;
          if (val1 !== val2) {
            diffs.push({
              category,
              stat,
              source: val2,
              scraped: val1
            });
          }
        }
        return diffs;
      };

      // Compare passing stats (use || so discrepancies are caught even if only one side has the category)
      if (sourcePlayer.passing || matchedPlayer.passing) {
        statDiscrepancies.push(...compareStats('passing', matchedPlayer.passing || {}, sourcePlayer.passing || {}));
      }

      // Compare rushing stats
      if (sourcePlayer.rushing || matchedPlayer.rushing) {
        statDiscrepancies.push(...compareStats('rushing', matchedPlayer.rushing || {}, sourcePlayer.rushing || {}));
      }

      // Compare receiving stats
      if (sourcePlayer.receiving || matchedPlayer.receiving) {
        statDiscrepancies.push(...compareStats('receiving', matchedPlayer.receiving || {}, sourcePlayer.receiving || {}));
      }

      // Compare defense stats
      if (sourcePlayer.defense || matchedPlayer.defense) {
        statDiscrepancies.push(...compareStats('defense', matchedPlayer.defense || {}, sourcePlayer.defense || {}));
      }

      // Compare kicking stats
      if (sourcePlayer.kicking || matchedPlayer.kicking) {
        statDiscrepancies.push(...compareStats('kicking', matchedPlayer.kicking || {}, sourcePlayer.kicking || {}));
      }

      // Compare punting stats
      if (sourcePlayer.punting || matchedPlayer.punting) {
        statDiscrepancies.push(...compareStats('punting', matchedPlayer.punting || {}, sourcePlayer.punting || {}));
      }

      // Compare returns stats
      if (sourcePlayer.returns || matchedPlayer.returns) {
        statDiscrepancies.push(...compareStats('returns', matchedPlayer.returns || {}, sourcePlayer.returns || {}));
      }

      // Basketball stats
      if (sport === 'mensBasketball' || sport === 'womensBasketball') {
        // Compare field goals
        if (sourcePlayer.fieldGoals || matchedPlayer.fieldGoals) {
          statDiscrepancies.push(...compareStats('fieldGoals', matchedPlayer.fieldGoals || {}, sourcePlayer.fieldGoals || {}));
        }

        // Compare three pointers
        if (sourcePlayer.threePointers || matchedPlayer.threePointers) {
          statDiscrepancies.push(...compareStats('threePointers', matchedPlayer.threePointers || {}, sourcePlayer.threePointers || {}));
        }

        // Compare free throws
        if (sourcePlayer.freeThrows || matchedPlayer.freeThrows) {
          statDiscrepancies.push(...compareStats('freeThrows', matchedPlayer.freeThrows || {}, sourcePlayer.freeThrows || {}));
        }

        // Compare rebounds
        if (sourcePlayer.rebounds || matchedPlayer.rebounds) {
          statDiscrepancies.push(...compareStats('rebounds', matchedPlayer.rebounds || {}, sourcePlayer.rebounds || {}));
        }

        // Compare simple stats (minutesPlayed, assists, turnovers, steals, blocks, fouls, points)
        const simpleStats = ['minutesPlayed', 'assists', 'turnovers', 'steals', 'blocks', 'fouls', 'points'];
        simpleStats.forEach(stat => {
          if (sourcePlayer[stat] !== undefined || matchedPlayer[stat] !== undefined) {
            const sourceVal = sourcePlayer[stat] || 0;
            const scrapedVal = matchedPlayer[stat] || 0;
            // Special handling for minutesPlayed - allow ±1 minute tolerance
            if (stat === 'minutesPlayed') {
              const diff = Math.abs(sourceVal - scrapedVal);
              if (diff > 1) { // Only flag if difference is more than 1 minute
                statDiscrepancies.push({
                  category: stat,
                  stat: stat,
                  source: sourceVal,
                  scraped: scrapedVal
                });
              }
            } else {
              // For other stats, exact match required
              if (sourceVal !== scrapedVal) {
                statDiscrepancies.push({
                  category: stat,
                  stat: stat,
                  source: sourceVal,
                  scraped: scrapedVal
                });
              }
            }
          }
        });
      }

      // Build stats objects based on sport
      const oracleStats = {};
      const sidearmStats = {};

      if (sport === 'mensBasketball' || sport === 'womensBasketball') {
        // Basketball stats
        Object.assign(oracleStats, {
          fieldGoals: sourcePlayer.fieldGoals || null,
          threePointers: sourcePlayer.threePointers || null,
          freeThrows: sourcePlayer.freeThrows || null,
          rebounds: sourcePlayer.rebounds || null,
          assists: sourcePlayer.assists || null,
          turnovers: sourcePlayer.turnovers || null,
          steals: sourcePlayer.steals || null,
          blocks: sourcePlayer.blocks || null,
          fouls: sourcePlayer.fouls || null,
          points: sourcePlayer.points || null,
          minutesPlayed: sourcePlayer.minutesPlayed || null
        });

        Object.assign(sidearmStats, {
          fieldGoals: matchedPlayer.fieldGoals || null,
          threePointers: matchedPlayer.threePointers || null,
          freeThrows: matchedPlayer.freeThrows || null,
          rebounds: matchedPlayer.rebounds || null,
          assists: matchedPlayer.assists || null,
          turnovers: matchedPlayer.turnovers || null,
          steals: matchedPlayer.steals || null,
          blocks: matchedPlayer.blocks || null,
          fouls: matchedPlayer.fouls || null,
          points: matchedPlayer.points || null,
          minutesPlayed: matchedPlayer.minutesPlayed || null
        });
      } else {
        // Football stats
        Object.assign(oracleStats, {
          passing: sourcePlayer.passing || null,
          rushing: sourcePlayer.rushing || null,
          receiving: sourcePlayer.receiving || null,
          punting: sourcePlayer.punting || null,
          returns: sourcePlayer.returns || null
        });

        Object.assign(sidearmStats, {
          passing: matchedPlayer.passing || null,
          rushing: matchedPlayer.rushing || null,
          receiving: matchedPlayer.receiving || null,
          punting: matchedPlayer.punting || null,
          returns: matchedPlayer.returns || null
        });
      }

      comparison.matches.push({
        player: sourcePlayer.originalName,
        scrapedName: matchedPlayer.originalName,
        jersey: sourcePlayer.jersey,
        statDiscrepancies,
        oracleStats,
        sidearmStats
      });

      if (statDiscrepancies.length > 0) {
        comparison.discrepancies.push({
          player: sourcePlayer.originalName,
          jersey: sourcePlayer.jersey,
          discrepancies: statDiscrepancies
        });
      }
    } else {
      // Player in Oracle but not in scraped - only include if they have offensive stats
      logger.debug(`Player in Oracle but not Sidearm: ${sourcePlayer.originalName}, hasOffensive: ${hasOffensiveStats(sourcePlayer)}`);
      if (hasOffensiveStats(sourcePlayer)) {
        const oracleStats = {};
        const sidearmStats = {};

        if (sport === 'mensBasketball' || sport === 'womensBasketball') {
          // Basketball stats
          Object.assign(oracleStats, {
            fieldGoals: sourcePlayer.fieldGoals || null,
            threePointers: sourcePlayer.threePointers || null,
            freeThrows: sourcePlayer.freeThrows || null,
            rebounds: sourcePlayer.rebounds || null,
            assists: sourcePlayer.assists || null,
            turnovers: sourcePlayer.turnovers || null,
            steals: sourcePlayer.steals || null,
            blocks: sourcePlayer.blocks || null,
            fouls: sourcePlayer.fouls || null,
            points: sourcePlayer.points || null,
            minutesPlayed: sourcePlayer.minutesPlayed || null
          });

          Object.assign(sidearmStats, {
            fieldGoals: null,
            threePointers: null,
            freeThrows: null,
            rebounds: null,
            assists: null,
            turnovers: null,
            steals: null,
            blocks: null,
            fouls: null,
            points: null,
            minutesPlayed: null
          });
        } else {
          // Football stats
          Object.assign(oracleStats, {
            passing: sourcePlayer.passing || null,
            rushing: sourcePlayer.rushing || null,
            receiving: sourcePlayer.receiving || null,
            punting: sourcePlayer.punting || null,
            returns: sourcePlayer.returns || null
          });

          Object.assign(sidearmStats, {
            passing: null,
            rushing: null,
            receiving: null,
            punting: null,
            returns: null
          });
        }

        comparison.missingInScraped.push({
          player: sourcePlayer.originalName,
          jersey: sourcePlayer.jersey,
          oracleStats,
          sidearmStats
        });
      } else {
        logger.debug(`  -> Filtered out (no offensive stats). Stats:`, {
          passing: sourcePlayer.passing,
          rushing: sourcePlayer.rushing,
          receiving: sourcePlayer.receiving,
          points: sourcePlayer.points,
          fieldGoals: sourcePlayer.fieldGoals
        });
      }
    }
  }

  // Find players in scraped but not in Oracle - only include if they have offensive stats
  for (const [scrapedKey, scrapedPlayer] of scrapedByKey.entries()) {
    if (!matchedScrapedKeys.has(scrapedKey)) {
      logger.debug(`Player in Sidearm but not Oracle: ${scrapedPlayer.originalName}, hasOffensive: ${hasOffensiveStats(scrapedPlayer)}`);

      if (hasOffensiveStats(scrapedPlayer)) {
        const oracleStats = {};
        const sidearmStats = {};

        if (sport === 'mensBasketball' || sport === 'womensBasketball') {
          // Basketball stats
          Object.assign(oracleStats, {
            fieldGoals: null,
            threePointers: null,
            freeThrows: null,
            rebounds: null,
            assists: null,
            turnovers: null,
            steals: null,
            blocks: null,
            fouls: null,
            points: null,
            minutesPlayed: null
          });

          Object.assign(sidearmStats, {
            fieldGoals: scrapedPlayer.fieldGoals || null,
            threePointers: scrapedPlayer.threePointers || null,
            freeThrows: scrapedPlayer.freeThrows || null,
            rebounds: scrapedPlayer.rebounds || null,
            assists: scrapedPlayer.assists || null,
            turnovers: scrapedPlayer.turnovers || null,
            steals: scrapedPlayer.steals || null,
            blocks: scrapedPlayer.blocks || null,
            fouls: scrapedPlayer.fouls || null,
            points: scrapedPlayer.points || null,
            minutesPlayed: scrapedPlayer.minutesPlayed || null
          });
        } else {
          // Football stats
          logger.debug(`  Full football stats:`, {
            passing: scrapedPlayer.passing,
            rushing: scrapedPlayer.rushing,
            receiving: scrapedPlayer.receiving,
            kicking: scrapedPlayer.kicking,
            punting: scrapedPlayer.punting,
            returns: scrapedPlayer.returns,
            defense: scrapedPlayer.defense
          });

          Object.assign(oracleStats, {
            passing: null,
            rushing: null,
            receiving: null,
            punting: null,
            returns: null
          });

          Object.assign(sidearmStats, {
            passing: scrapedPlayer.passing || null,
            rushing: scrapedPlayer.rushing || null,
            receiving: scrapedPlayer.receiving || null,
            punting: scrapedPlayer.punting || null,
            returns: scrapedPlayer.returns || null
          });
        }

        comparison.missingInSource.push({
          player: scrapedPlayer.originalName,
          jersey: scrapedPlayer.jersey,
          oracleStats,
          sidearmStats
        });
      } else {
        logger.debug(`  -> Filtered out (no offensive stats)`);
      }
    }
  }

  // Update totals to reflect only players that passed filtering
  // (matches + missing players that have offensive stats)
  comparison.totalScraped = comparison.matches.length + comparison.missingInSource.length;
  comparison.totalSource = comparison.matches.length + comparison.missingInScraped.length;

  // Calculate match percentage
  const totalUniquePlayers = comparison.totalScraped + comparison.missingInScraped.length;

  comparison.matchPercentage = totalUniquePlayers > 0
    ? Math.round((comparison.matches.length / totalUniquePlayers) * 100)
    : 0;

  comparison.summary = {
    perfectMatches: comparison.matches.filter(m => m.statDiscrepancies.length === 0).length,
    matchesWithDiscrepancies: comparison.discrepancies.length,
    uniqueToScraped: comparison.missingInSource.length,  // In Sidearm, not in Oracle
    uniqueToSource: comparison.missingInScraped.length,  // In Oracle, not in Sidearm
    missingInSource: comparison.missingInSource.length,  // In Sidearm, not in Oracle (for frontend export)
    missingInScraped: comparison.missingInScraped.length, // In Oracle, not in Sidearm (for frontend export)
    totalStatDiscrepancies: comparison.discrepancies.reduce((sum, d) => sum + d.discrepancies.length, 0) +
      comparison.missingInSource.length + // Players in Sidearm but not Oracle
      comparison.missingInScraped.length   // Players in Oracle but not Sidearm
  };

  logger.debug(`Stats comparison complete: ${comparison.matchPercentage}% match rate`);
  logger.debug(`${comparison.summary.totalStatDiscrepancies} total stat discrepancies found`);

  return comparison;
}

// Schedule comparison for comparing entire team schedules
async function performScheduleComparison(scrapedGames, sourceGames, sport, teamId, league, sourceType, ignoredGameDates = new Set()) {
  logger.debug(`Starting schedule comparison for sport: ${sport}, team: ${teamId}, source: ${sourceType}`);

  if (ignoredGameDates.size > 0) {
    logger.debug(`${ignoredGameDates.size} games marked as ignored - will exclude from match rate calculation`);
  }

  // Helper to normalize date format
  const normalizeDate = (date) => {
    if (!date) return '';
    // Handle both ISO (2025-09-27T00:00:00.000Z) and simple (2025-09-27) formats
    return date.split('T')[0];
  };

  // Helper to normalize team names for basic comparison (case/whitespace only)
  const normalizeTeamName = (name) => {
    if (!name) return '';
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  };

  const comparison = {
    totalScraped: scrapedGames.length,
    totalSource: sourceGames.length,
    matches: [],
    missingInScraped: [],  // In Oracle, not in Sidearm
    missingInSource: [],   // In Sidearm, not in Oracle
    discrepancies: []
  };

  // Extract game data from scraped documents
  const scrapedData = scrapedGames.map(item => ({
    ...(item.data || item),
    _id: item._id
  }));

  // Create maps by date - store arrays to handle doubleheaders/split squads
  // Prefer gameDate (CST-corrected) over date (UTC) for proper timezone handling
  const scrapedByDate = new Map();
  scrapedData.forEach(game => {
    const date = normalizeDate(game.gameDate || game.date);
    if (!scrapedByDate.has(date)) scrapedByDate.set(date, []);
    scrapedByDate.get(date).push(game);
  });

  const sourceByDate = new Map();
  sourceGames.forEach(game => {
    const date = normalizeDate(game.gameDate || game.date);
    if (!sourceByDate.has(date)) sourceByDate.set(date, []);
    sourceByDate.get(date).push(game);
  });

  const scrapedGameCount = [...scrapedByDate.values()].reduce((sum, arr) => sum + arr.length, 0);
  const sourceGameCount = [...sourceByDate.values()].reduce((sum, arr) => sum + arr.length, 0);
  logger.debug(`Scraped games: ${scrapedGameCount} across ${scrapedByDate.size} dates, Source games: ${sourceGameCount} across ${sourceByDate.size} dates`);

  // Track matched games by unique identifier (date_index)
  const matchedScrapedIds = new Set();
  const matchedSourceIds = new Set();

  // Match games by date, then by opponent within the same date
  for (const [date, scrapedGamesOnDate] of scrapedByDate.entries()) {
    const sourceGamesOnDate = sourceByDate.get(date);
    if (!sourceGamesOnDate) continue;

    if (scrapedGamesOnDate.length > 1 || sourceGamesOnDate.length > 1) {
      logger.debug(`Multi-game date ${date}: ${scrapedGamesOnDate.length} scraped, ${sourceGamesOnDate.length} source`);
      scrapedGamesOnDate.forEach((g, i) => logger.debug(`  Scraped[${i}]: vs ${g.opponentName || g.opponent}, gameNum=${g.gameNumber}, splitSquad=${g.splitSquad || false}`));
      sourceGamesOnDate.forEach((g, i) => logger.debug(`  Source[${i}]: vs ${g.opponentName || g.opponent}, gameNum=${g.gameNumber}`));
    }

    // For each scraped game, find the best matching source game by opponent
    const usedSourceIndices = new Set();

    for (let si = 0; si < scrapedGamesOnDate.length; si++) {
      const scrapedGame = scrapedGamesOnDate[si];
      const scrapedOpponent = normalizeTeamName(scrapedGame.opponentName || scrapedGame.opponent);

      let bestMatch = null;
      let bestMatchIdx = -1;

      for (let oi = 0; oi < sourceGamesOnDate.length; oi++) {
        if (usedSourceIndices.has(oi)) continue;
        const sourceGame = sourceGamesOnDate[oi];
        const sourceOpponent = normalizeTeamName(sourceGame.opponentName || sourceGame.opponent);

        // Match by opponent name (or gameNumber for same-opponent doubleheaders)
        if (scrapedOpponent === sourceOpponent) {
          // If multiple games vs same opponent (doubleheader), match by gameNumber
          if (bestMatch !== null) {
            if (scrapedGame.gameNumber && sourceGame.gameNumber &&
                scrapedGame.gameNumber === sourceGame.gameNumber) {
              bestMatch = sourceGame;
              bestMatchIdx = oi;
            }
          } else {
            bestMatch = sourceGame;
            bestMatchIdx = oi;
          }
        }
      }

      // Fallback: try matching by opponentNickname (handles "Minnesota Twins" vs "Twins")
      if (!bestMatch) {
        const scrapedNickname = normalizeTeamName(scrapedGame.opponentNickname);
        for (let oi = 0; oi < sourceGamesOnDate.length; oi++) {
          if (usedSourceIndices.has(oi)) continue;
          const sourceGame = sourceGamesOnDate[oi];
          const sourceNickname = normalizeTeamName(sourceGame.opponentNickname);
          const sourceOpponent = normalizeTeamName(sourceGame.opponentName || sourceGame.opponent);

          // Check if nickname matches opponent name or nickname on the other side
          if ((scrapedNickname && sourceNickname && scrapedNickname === sourceNickname) ||
              (scrapedNickname && scrapedNickname === sourceOpponent) ||
              (scrapedOpponent && sourceNickname && scrapedOpponent === sourceNickname)) {
            bestMatch = sourceGame;
            bestMatchIdx = oi;
            break;
          }
        }
      }

      // Fallback: try matching by opponentId (handles name format differences)
      if (!bestMatch) {
        const scrapedOppId = scrapedGame.opponentId ? String(scrapedGame.opponentId) : null;
        if (scrapedOppId) {
          for (let oi = 0; oi < sourceGamesOnDate.length; oi++) {
            if (usedSourceIndices.has(oi)) continue;
            const sourceOppId = sourceGamesOnDate[oi].opponentId ? String(sourceGamesOnDate[oi].opponentId) : null;
            if (sourceOppId && scrapedOppId === sourceOppId) {
              bestMatch = sourceGamesOnDate[oi];
              bestMatchIdx = oi;
              break;
            }
          }
        }
      }

      // If no opponent match found and only one game each on this date, match by date
      if (!bestMatch && scrapedGamesOnDate.length === 1 && sourceGamesOnDate.length === 1 && usedSourceIndices.size === 0) {
        bestMatch = sourceGamesOnDate[0];
        bestMatchIdx = 0;
      }

      if (bestMatch) {
        usedSourceIndices.add(bestMatchIdx);
        matchedScrapedIds.add(`${date}_${si}`);
        matchedSourceIds.add(`${date}_${bestMatchIdx}`);
        const sourceGame = bestMatch;

    if (sourceGame) {
      // Compare game details
      const gameDiscrepancies = [];
      const mappedFields = {}; // Track which fields were resolved by mappings

      // Build scope for mapping checks
      const mappingScope = {
        league,
        teamId,
        sport
      };

      // Compare opponent names - use opponentName (short name) for comparison, not full opponent field
      // Oracle has opponentName (e.g., "Alabama") separate from full name (e.g., "Alabama Crimson Tide")
      // Scraped data typically has only opponent field which is the short name
      // For NBA: scraped has opponent (city like "Sacramento") and opponentNickname (like "Kings")
      //          Oracle has opponentName (city) and opponentNickname (nickname)
      const scrapedOpponentName = normalizeTeamName(scrapedGame.opponentName || scrapedGame.opponent);
      const sourceOpponentName = normalizeTeamName(sourceGame.opponentName || sourceGame.opponent);

      // For NBA, also compare nicknames (e.g., "Kings" vs "Kings")
      const scrapedNickname = normalizeTeamName(scrapedGame.opponentNickname);
      const sourceNickname = normalizeTeamName(sourceGame.opponentNickname);

      // Check if opponents match - consider match if:
      // 1. Team names match (Sacramento vs Sacramento)
      // 2. Nicknames match (Kings vs Kings)
      // 3. Cross-match: scraped name matches source nickname or vice versa
      const opponentNamesMatch = scrapedOpponentName && sourceOpponentName && scrapedOpponentName === sourceOpponentName;
      const opponentNicknamesMatch = scrapedNickname && sourceNickname && scrapedNickname === sourceNickname;
      const crossMatch = (scrapedOpponentName && sourceNickname && scrapedOpponentName === sourceNickname) ||
                         (scrapedNickname && sourceOpponentName && scrapedNickname === sourceOpponentName);

      const opponentsConsideredMatch = opponentNamesMatch || opponentNicknamesMatch || crossMatch;

      if (scrapedOpponentName && sourceOpponentName && !opponentsConsideredMatch) {
        // Check if there's a mapping that makes these equivalent
        const opponentMappingExists = await DataMapping.checkEquivalence(
          scrapedGame.opponentName || scrapedGame.opponent,
          sourceGame.opponentName || sourceGame.opponent,
          'opponent',
          mappingScope
        );

        if (opponentMappingExists) {
          // Track that this field was resolved by a mapping
          mappedFields.opponent = true;
        } else {
          gameDiscrepancies.push({
            field: 'opponent',
            scraped: scrapedGame.opponentName || scrapedGame.opponent,
            source: sourceGame.opponentName || sourceGame.opponent,
            normalized: { scraped: scrapedOpponentName, source: sourceOpponentName }
          });
        }
      }

      // Compare location indicator (H/A/N)
      if (scrapedGame.locationIndicator !== sourceGame.locationIndicator) {
        const locationMappingExists = await DataMapping.checkEquivalence(
          scrapedGame.locationIndicator,
          sourceGame.locationIndicator,
          'locationIndicator',
          mappingScope
        );

        if (locationMappingExists) {
          mappedFields.locationIndicator = true;
        } else {
          gameDiscrepancies.push({
            field: 'locationIndicator',
            scraped: scrapedGame.locationIndicator,
            source: sourceGame.locationIndicator
          });
        }
      }

      // Compare H/A designation for neutral site games
      if (scrapedGame.locationIndicator === 'N' && sourceGame.locationIndicator === 'N') {
        // For neutral site games, check if both agree on home/away designation
        const scrapedHomeAway = scrapedGame.neutralHometeam ? 'H' : 'A';
        const sourceHomeAway = sourceGame.isHome ? 'H' : 'A';

        if (scrapedHomeAway !== sourceHomeAway) {
          gameDiscrepancies.push({
            field: 'neutralHomeAway',
            scraped: scrapedHomeAway,
            source: sourceHomeAway
          });
        }
      }

      // Compare venue - check mappings first
      // Flag discrepancies when values don't match, including when one is blank and the other isn't
      const scrapedVenue = (scrapedGame.venue || '').toLowerCase().trim();
      const sourceVenue = (sourceGame.venue || '').toLowerCase().trim();
      if (scrapedVenue !== sourceVenue && (scrapedVenue || sourceVenue)) {
        const venueMappingExists = await DataMapping.checkEquivalence(
          scrapedGame.venue || '',
          sourceGame.venue || '',
          'venue',
          mappingScope
        );

        if (venueMappingExists) {
          mappedFields.venue = true;
        } else {
          gameDiscrepancies.push({
            field: 'venue',
            scraped: scrapedGame.venue || '',
            source: sourceGame.venue || ''
          });
        }
      }

      // Compare TV networks - use individual broadcaster comparison if tvArray is available
      // This enables per-broadcaster mapping instead of whole-string comparison
      const scrapedTvArray = scrapedGame.tvArray || (scrapedGame.tv ? scrapedGame.tv.split(',').map(s => s.trim()).filter(Boolean).sort() : []);
      const sourceTvArray = sourceGame.tvArray || (sourceGame.tv ? sourceGame.tv.split(',').map(s => s.trim()).filter(Boolean).sort() : []);

      // Find broadcasters that need comparison
      const allBroadcasters = new Set([...scrapedTvArray.map(b => b.toLowerCase()), ...sourceTvArray.map(b => b.toLowerCase())]);
      const tvDiscrepancies = [];
      const tvMappedItems = [];

      for (const broadcasterLower of allBroadcasters) {
        // Find the original case version from each source
        const scrapedMatch = scrapedTvArray.find(b => b.toLowerCase() === broadcasterLower);
        const sourceMatch = sourceTvArray.find(b => b.toLowerCase() === broadcasterLower);

        if (scrapedMatch && sourceMatch) {
          // Broadcaster exists in both (case-insensitive match) - no discrepancy
          continue;
        }

        // Broadcaster only in one source - check if there's a mapping
        const broadcaster = scrapedMatch || sourceMatch;
        let mappingFound = false;

        // First check if this specific broadcaster is marked as ignored
        const isIgnored = await DataMapping.checkIgnored(broadcaster, 'tv', mappingScope);
        if (isIgnored) {
          mappingFound = true;
          tvMappedItems.push({
            scraped: scrapedMatch || '',
            source: sourceMatch || '',
            ignored: true
          });
        }

        // Check if this broadcaster maps to any broadcaster in the other source
        if (!mappingFound && scrapedMatch && !sourceMatch) {
          // Broadcaster in scraped but not source - check if it maps to anything in source
          for (const sourceB of sourceTvArray) {
            const tvMappingExists = await DataMapping.checkEquivalence(
              broadcaster,
              sourceB,
              'tv',
              mappingScope
            );
            if (tvMappingExists) {
              mappingFound = true;
              tvMappedItems.push({ scraped: broadcaster, source: sourceB });
              break;
            }
          }
        } else if (!mappingFound && sourceMatch && !scrapedMatch) {
          // Broadcaster in source but not scraped - check if it maps to anything in scraped
          for (const scrapedB of scrapedTvArray) {
            const tvMappingExists = await DataMapping.checkEquivalence(
              scrapedB,
              broadcaster,
              'tv',
              mappingScope
            );
            if (tvMappingExists) {
              mappingFound = true;
              tvMappedItems.push({ scraped: scrapedB, source: broadcaster });
              break;
            }
          }
        }

        if (!mappingFound) {
          // No mapping found - this is a discrepancy
          tvDiscrepancies.push({
            field: 'tv',
            scraped: scrapedMatch || '',
            source: sourceMatch || '',
            broadcaster: broadcaster // Include which broadcaster has the issue
          });
        }
      }

      // Add TV discrepancies to game discrepancies
      if (tvDiscrepancies.length > 0) {
        gameDiscrepancies.push(...tvDiscrepancies);
      }

      // Track mapped TV items
      if (tvMappedItems.length > 0) {
        mappedFields.tv = true;
        mappedFields.tvMappedItems = tvMappedItems;
      }

      // Conference game flag comparison is disabled - not being tracked
      // if (scrapedGame.isConferenceGame !== sourceGame.isConferenceGame) {
      //   const confMappingExists = await DataMapping.checkEquivalence(
      //     String(scrapedGame.isConferenceGame),
      //     String(sourceGame.isConferenceGame),
      //     'isConferenceGame',
      //     mappingScope
      //   );
      //
      //   if (confMappingExists) {
      //     mappedFields.isConferenceGame = true;
      //   } else {
      //     gameDiscrepancies.push({
      //       field: 'isConferenceGame',
      //       scraped: scrapedGame.isConferenceGame,
      //       source: sourceGame.isConferenceGame
      //     });
      //   }
      // }

      // Compare game time
      // Prefer time24 (24-hour format) when available for consistent matching
      // Flag discrepancies when values don't match, including when one is blank and the other isn't
      const scrapedTime = (scrapedGame.time24 || scrapedGame.time || '').toLowerCase().trim();
      const sourceTime = (sourceGame.time24 || sourceGame.time || '').toLowerCase().trim();
      if (scrapedTime !== sourceTime && (scrapedTime || sourceTime)) {
        const timeMappingExists = await DataMapping.checkEquivalence(
          scrapedGame.time || '',
          sourceGame.time || '',
          'time',
          mappingScope
        );

        if (timeMappingExists) {
          mappedFields.time = true;
        } else {
          gameDiscrepancies.push({
            field: 'time',
            scraped: scrapedGame.time24 || scrapedGame.time || '',
            source: sourceGame.time24 || sourceGame.time || ''
          });
        }
      }

      // Location comparison is disabled - venue comparison is sufficient
      // const scrapedLocation = (scrapedGame.location || '').toLowerCase().trim();
      // const sourceLocation = (sourceGame.location || '').toLowerCase().trim();
      // if (scrapedLocation !== sourceLocation && (scrapedLocation || sourceLocation)) {
      //   const locationMappingExists = await DataMapping.checkEquivalence(
      //     scrapedGame.location || '',
      //     sourceGame.location || '',
      //     'location',
      //     mappingScope
      //   );
      //
      //   if (locationMappingExists) {
      //     mappedFields.location = true;
      //   } else {
      //     gameDiscrepancies.push({
      //       field: 'location',
      //       scraped: scrapedGame.location || '',
      //       source: sourceGame.location || ''
      //     });
      //   }
      // }

      // Add to matches or discrepancies
      if (gameDiscrepancies.length === 0) {
        comparison.matches.push({
          date,
          scraped: scrapedGame,
          source: sourceGame,
          mappedFields // Include mapped fields even for perfect matches
        });
      } else {
        comparison.discrepancies.push({
          date,
          scraped: scrapedGame,
          source: sourceGame,
          discrepancies: gameDiscrepancies,
          mappedFields // Include which fields were resolved by mappings
        });
      }
    } // end if (sourceGame)
      } // end if (bestMatch)
    } // end for scrapedGamesOnDate

    // Unmatched source games on this date
    for (let oi = 0; oi < sourceGamesOnDate.length; oi++) {
      if (!usedSourceIndices.has(oi)) {
        comparison.missingInScraped.push({
          date,
          game: sourceGamesOnDate[oi]
        });
      }
    }
  } // end for scrapedByDate

  // Find unmatched scraped games
  for (const [date, scrapedGamesOnDate] of scrapedByDate.entries()) {
    for (let si = 0; si < scrapedGamesOnDate.length; si++) {
      if (!matchedScrapedIds.has(`${date}_${si}`)) {
        comparison.missingInSource.push({
          date,
          game: scrapedGamesOnDate[si]
        });
      }
    }
  }

  // Find source dates with no scraped games at all
  for (const [date, sourceGamesOnDate] of sourceByDate.entries()) {
    if (!scrapedByDate.has(date)) {
      sourceGamesOnDate.forEach(game => {
        comparison.missingInScraped.push({ date, game });
      });
    }
  }

  // Calculate match percentage - exclude ignored games from match rate calculation
  // Count how many games in missingInSource are ignored
  const ignoredGamesCount = comparison.missingInSource.filter(item => {
    const gameDate = normalizeDate(item.date);
    return ignoredGameDates.has(gameDate);
  }).length;

  // Match rate should reflect games found in both sources (even if they have discrepancies)
  // Subtract ignored games from scraped total since they shouldn't affect match rate
  const adjustedScrapedTotal = comparison.totalScraped - ignoredGamesCount;
  const totalGames = Math.max(adjustedScrapedTotal, comparison.totalSource);
  const matchedGames = comparison.matches.length + comparison.discrepancies.length;
  comparison.matchPercentage = totalGames > 0 ? parseFloat(((matchedGames / totalGames) * 100).toFixed(1)) : 0;

  // Summary stats
  comparison.summary = {
    perfectMatches: comparison.matches.length,
    gamesWithDiscrepancies: comparison.discrepancies.length,
    matchesWithDiscrepancies: comparison.discrepancies.length,  // Alias for bulk comparison service
    uniqueToScraped: comparison.missingInSource.length - ignoredGamesCount,  // In Sidearm, not in Oracle (excluding ignored)
    uniqueToSource: comparison.missingInScraped.length,  // In Oracle, not in Sidearm
    totalDiscrepancies: comparison.discrepancies.reduce((sum, g) => sum + g.discrepancies.length, 0),
    ignoredGames: ignoredGamesCount  // Track how many games are ignored
  };

  logger.debug(`Schedule comparison complete: ${comparison.matchPercentage}% match rate`);
  logger.debug(`${comparison.summary.totalDiscrepancies} total field discrepancies found`);
  if (ignoredGamesCount > 0) {
    logger.debug(`${ignoredGamesCount} games ignored and excluded from match rate calculation`);
  }

  return comparison;
}

/**
 * NBA Boxscore comparison - compares player stats from scraped PDFs vs Oracle
 */
async function performNBABoxscoreComparison(scrapedPlayers, oraclePlayers, teamId, source) {
  logger.debug(`Starting NBA boxscore comparison: ${scrapedPlayers.length} scraped vs ${oraclePlayers.length} oracle players`);

  const comparison = {
    totalScraped: scrapedPlayers.length,
    totalSource: oraclePlayers.length,
    matches: [],
    missingInScraped: [],
    missingInSource: [],
    discrepancies: [],
    mappedFields: {}
  };

  // Get name mappings for NBA players
  const mappingQuery = {
    active: true,
    fieldType: 'name',
    $or: [
      { 'scope.level': 'global' },
      { 'scope.level': 'league', 'scope.league': 'NBA' },
      { 'scope.level': 'sport', 'scope.sport': 'nba' }
    ]
  };

  if (teamId) {
    mappingQuery.$or.push({
      'scope.level': 'team',
      'scope.teamId': teamId
    });
  }

  if (source === 'oracle') {
    mappingQuery['appliesTo.oracle'] = true;
  }
  mappingQuery['appliesTo.scraped'] = true;

  const nameMappings = await DataMapping.find(mappingQuery);
  logger.debug(`Found ${nameMappings.length} name mappings for NBA boxscore comparison`);

  // Helper to get mapped name
  const getMappedName = (name) => {
    if (!name) return name;
    const nameTrimmed = name.trim().normalize('NFC');
    const nameLower = nameTrimmed.toLowerCase();

    for (const mapping of nameMappings) {
      if (mapping.mappingType === 'equivalence') {
        const values = [mapping.rules.primaryValue, ...mapping.rules.equivalents];
        const mappedValues = mapping.rules.caseSensitive
          ? values.map(v => v.normalize('NFC'))
          : values.map(v => v.normalize('NFC').toLowerCase().trim());

        if (mappedValues.includes(mapping.rules.caseSensitive ? nameTrimmed : nameLower)) {
          return mapping.rules.primaryValue;
        }
      }
    }
    return name;
  };

  // Normalize player name for matching
  const normalizeName = (name) => {
    if (!name) return '';
    return name.normalize('NFC')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/jr\.?|sr\.?|ii|iii|iv/gi, '')
      .trim();
  };

  // Create maps by normalized name (after applying mappings)
  const scrapedByName = new Map();
  scrapedPlayers.forEach(player => {
    const name = player.playerName || player.name;
    const mappedName = getMappedName(name);
    const normalizedName = normalizeName(mappedName);
    if (normalizedName) {
      scrapedByName.set(normalizedName, { ...player, originalName: name, mappedName });
    }
  });

  const oracleByName = new Map();
  oraclePlayers.forEach(player => {
    const name = player.playerName || player.name;
    const mappedName = getMappedName(name);
    const normalizedName = normalizeName(mappedName);
    if (normalizedName) {
      oracleByName.set(normalizedName, { ...player, originalName: name, mappedName });
    }
  });

  const matchedScrapedNames = new Set();

  // Compare stats for matched players
  for (const [oracleName, oraclePlayer] of oracleByName.entries()) {
    const scrapedPlayer = scrapedByName.get(oracleName);

    if (scrapedPlayer) {
      matchedScrapedNames.add(oracleName);
      const statDiscrepancies = [];

      // Fields to compare (excluding derived/calculated fields)
      const fieldsToCompare = [
        'points',
        'fieldGoalsMade',
        'fieldGoalsAttempted',
        'threePointersMade',
        'threePointersAttempted',
        'freeThrowsMade',
        'freeThrowsAttempted',
        'offensiveRebounds',
        'defensiveRebounds',
        'rebounds',
        'assists',
        'steals',
        'blocks',
        'turnovers',
        'personalFouls',
        'plusMinusPoints'
      ];

      for (const field of fieldsToCompare) {
        const scrapedVal = scrapedPlayer[field] ?? 0;
        const oracleVal = oraclePlayer[field] ?? 0;

        if (scrapedVal !== oracleVal) {
          statDiscrepancies.push({
            field,
            scraped: scrapedVal,
            source: oracleVal
          });
        }
      }

      // Compare minutes (special handling for format differences)
      // Scraped: "32:45" (string), Oracle: "32:45" or could be numeric
      const scrapedMinutes = scrapedPlayer.minutes || '0:00';
      const oracleMinutes = oraclePlayer.minutes || '0:00';
      if (scrapedMinutes !== oracleMinutes) {
        statDiscrepancies.push({
          field: 'minutes',
          scraped: scrapedMinutes,
          source: oracleMinutes
        });
      }

      comparison.matches.push({
        player: oraclePlayer.originalName,
        scrapedName: scrapedPlayer.originalName,
        mappedName: oraclePlayer.mappedName !== oraclePlayer.originalName ? oraclePlayer.mappedName : undefined,
        team: oraclePlayer.team,
        statDiscrepancies,
        oracleStats: oraclePlayer,
        scrapedStats: scrapedPlayer
      });

      if (statDiscrepancies.length > 0) {
        comparison.discrepancies.push({
          player: oraclePlayer.originalName,
          team: oraclePlayer.team,
          discrepancies: statDiscrepancies
        });
      }
    } else {
      // Player in Oracle but not in scraped
      comparison.missingInScraped.push({
        player: oraclePlayer.originalName,
        team: oraclePlayer.team,
        oracleStats: oraclePlayer
      });
    }
  }

  // Find players in scraped but not in Oracle
  for (const [scrapedName, scrapedPlayer] of scrapedByName.entries()) {
    if (!matchedScrapedNames.has(scrapedName)) {
      comparison.missingInSource.push({
        player: scrapedPlayer.originalName,
        team: scrapedPlayer.team,
        scrapedStats: scrapedPlayer
      });
    }
  }

  // Calculate match percentage
  const totalUniquePlayers = new Set([
    ...Array.from(scrapedByName.keys()),
    ...Array.from(oracleByName.keys())
  ]).size;

  comparison.matchPercentage = totalUniquePlayers > 0
    ? Math.round((comparison.matches.length / totalUniquePlayers) * 100)
    : 0;

  comparison.summary = {
    perfectMatches: comparison.matches.filter(m => m.statDiscrepancies.length === 0).length,
    matchesWithDiscrepancies: comparison.discrepancies.length,
    uniqueToScraped: comparison.missingInSource.length,
    uniqueToSource: comparison.missingInScraped.length,
    totalStatDiscrepancies: comparison.discrepancies.reduce((sum, d) => sum + d.discrepancies.length, 0)
  };

  logger.debug(`NBA boxscore comparison complete: ${comparison.matchPercentage}% match rate`);

  return comparison;
}

module.exports = { performComparison, performStatsComparison, performScheduleComparison, performNBABoxscoreComparison };
