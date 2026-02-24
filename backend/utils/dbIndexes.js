// backend/utils/dbIndexes.js
//
// Database index management and optimization utilities
// Ensures optimal query performance across all collections

const mongoose = require('mongoose');
const logger = require('./logger');

/**
 * Index definitions for query optimization
 * These supplement the indexes defined in models
 */
const RECOMMENDED_INDEXES = {
  // ComparisonJob - add status-based queries
  comparisonjobs: [
    { keys: { status: 1, createdAt: -1 }, options: { name: 'status_created_idx' } }
  ],

  // FetchJob - add status-based queries
  fetchjobs: [
    { keys: { status: 1, createdAt: -1 }, options: { name: 'status_created_idx' } }
  ],

  // ScrapedData - compound for league filtering
  scrapeddata: [
    { keys: { league: 1, moduleId: 1, updatedAt: -1 }, options: { name: 'league_module_updated_idx' } }
  ],

  // NBAGame - additional compound for API queries
  nbagames: [
    { keys: { season: 1, gameDate: 1 }, options: { name: 'season_date_idx' } },
    { keys: { 'homeTeam.teamTricode': 1, gameDate: -1 }, options: { name: 'home_team_date_idx' } },
    { keys: { 'awayTeam.teamTricode': 1, gameDate: -1 }, options: { name: 'away_team_date_idx' } }
  ],

  // NBAPlayerGameLog - additional for player lookups
  nbaplayergamelogs: [
    { keys: { playerName: 1, gameDate: -1 }, options: { name: 'player_name_date_idx' } },
    { keys: { teamTricode: 1, gameDate: -1 }, options: { name: 'team_tricode_date_idx' } }
  ],

  // Teams - text search support
  teams: [
    { keys: { teamName: 'text', teamNickname: 'text', teamAbbrev: 'text' }, options: { name: 'team_text_search_idx' } }
  ]
};

/**
 * Check if an index exists on a collection
 */
async function indexExists(collection, indexName) {
  try {
    const indexes = await collection.indexes();
    return indexes.some(idx => idx.name === indexName);
  } catch (error) {
    return false;
  }
}

/**
 * Create recommended indexes if they don't exist
 */
async function ensureIndexes() {
  const db = mongoose.connection.db;
  if (!db) {
    logger.warn('Database not connected, skipping index check');
    return { success: false, error: 'Database not connected' };
  }

  const results = {
    created: [],
    existing: [],
    failed: []
  };

  for (const [collectionName, indexes] of Object.entries(RECOMMENDED_INDEXES)) {
    try {
      const collection = db.collection(collectionName);

      for (const indexDef of indexes) {
        const indexName = indexDef.options.name;

        if (await indexExists(collection, indexName)) {
          results.existing.push({ collection: collectionName, index: indexName });
          continue;
        }

        try {
          await collection.createIndex(indexDef.keys, indexDef.options);
          results.created.push({ collection: collectionName, index: indexName });
          logger.info(`Created index ${indexName} on ${collectionName}`);
        } catch (err) {
          results.failed.push({ collection: collectionName, index: indexName, error: err.message });
          logger.warn(`Failed to create index ${indexName} on ${collectionName}: ${err.message}`);
        }
      }
    } catch (error) {
      logger.warn(`Error processing collection ${collectionName}: ${error.message}`);
    }
  }

  return { success: true, results };
}

/**
 * Get index statistics for all collections
 */
async function getIndexStats() {
  const db = mongoose.connection.db;
  if (!db) {
    return { success: false, error: 'Database not connected' };
  }

  const stats = [];
  const collections = await db.listCollections().toArray();

  for (const col of collections) {
    try {
      const collection = db.collection(col.name);
      const indexes = await collection.indexes();
      const indexStats = await collection.aggregate([{ $indexStats: {} }]).toArray();

      stats.push({
        collection: col.name,
        indexCount: indexes.length,
        indexes: indexes.map(idx => ({
          name: idx.name,
          keys: idx.key,
          unique: idx.unique || false,
          sparse: idx.sparse || false
        })),
        usage: indexStats.map(s => ({
          name: s.name,
          accesses: s.accesses?.ops || 0,
          since: s.accesses?.since
        }))
      });
    } catch (error) {
      stats.push({
        collection: col.name,
        error: error.message
      });
    }
  }

  return { success: true, stats };
}

/**
 * Analyze slow queries (requires profiling to be enabled)
 * Note: This is informational - profiling must be enabled in MongoDB
 */
async function getSlowQueryInfo() {
  const db = mongoose.connection.db;
  if (!db) {
    return { success: false, error: 'Database not connected' };
  }

  try {
    // Check if system.profile exists
    const collections = await db.listCollections({ name: 'system.profile' }).toArray();

    if (collections.length === 0) {
      return {
        success: true,
        profilingEnabled: false,
        message: 'Query profiling not enabled. Enable with: db.setProfilingLevel(1, { slowms: 100 })'
      };
    }

    const slowQueries = await db.collection('system.profile')
      .find({ millis: { $gt: 100 } })
      .sort({ ts: -1 })
      .limit(20)
      .toArray();

    return {
      success: true,
      profilingEnabled: true,
      slowQueries: slowQueries.map(q => ({
        operation: q.op,
        namespace: q.ns,
        duration: q.millis,
        timestamp: q.ts,
        query: q.command || q.query
      }))
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get collection statistics
 */
async function getCollectionStats() {
  const db = mongoose.connection.db;
  if (!db) {
    return { success: false, error: 'Database not connected' };
  }

  const stats = [];
  const collections = await db.listCollections().toArray();

  for (const col of collections) {
    if (col.name.startsWith('system.')) continue;

    try {
      const collStats = await db.command({ collStats: col.name });
      stats.push({
        name: col.name,
        count: collStats.count,
        size: collStats.size,
        avgObjSize: collStats.avgObjSize,
        storageSize: collStats.storageSize,
        indexSize: collStats.totalIndexSize,
        indexCount: collStats.nindexes
      });
    } catch (error) {
      stats.push({
        name: col.name,
        error: error.message
      });
    }
  }

  // Sort by size descending
  stats.sort((a, b) => (b.size || 0) - (a.size || 0));

  return { success: true, stats };
}

module.exports = {
  ensureIndexes,
  getIndexStats,
  getSlowQueryInfo,
  getCollectionStats,
  RECOMMENDED_INDEXES
};
