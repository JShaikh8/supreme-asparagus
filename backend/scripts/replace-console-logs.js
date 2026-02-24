#!/usr/bin/env node
/**
 * Script to replace console.log/error/warn with logger calls
 * Run: node scripts/replace-console-logs.js
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Files to process (excluding scripts/, node_modules, and logger.js itself)
const filesToProcess = [
  'models/NBAPlayByPlayAction.js',
  'modules/BaseModule.js',
  'modules/cfb-tv/index.js',
  'modules/espn-tv/index.js',
  'modules/mlb-roster/index.js',
  'modules/nba-boxscore/index.js',
  'modules/nba-boxscore-fetch/index.js',
  'modules/nba-schedule/index.js',
  'modules/ncaa-basketball-roster/index.js',
  'modules/ncaa-basketball-schedule/index.js',
  'modules/ncaa-basketball-stats/index.js',
  'modules/ncaa-football-roster/index.js',
  'modules/ncaa-football-schedule/index.js',
  'modules/ncaa-football-stats/index.js',
  'modules/ncaa-mens-basketball-schedule/index.js',
  'modules/ncaa-womens-basketball-schedule/index.js',
  'routes/bulkComparison.js',
  'routes/comparison.js',
  'routes/data.js',
  'routes/dataManagement.js',
  'routes/fetch.js',
  'routes/mappings.js',
  'routes/nba.js',
  'routes/publicApi.js',
  'routes/search.js',
  'routes/settings.js',
  'routes/system.js',
  'routes/teams.js',
  'services/autoPopulateService.js',
  'services/bulkComparisonService.js',
  'services/bulkFetchService.js',
  'services/exportService.js',
  'services/fetchService.js',
  'services/nba/MinutesProjectionEngine.js',
  'services/nbaMonitoringService.js',
  'services/nbaPlayByPlayService.js',
  'services/oracleService.js',
  'services/sidearmDetector.js',
  'services/sidearmFetcher.js',
  'services/sidearmRosterFetcher.js',
  'services/statsApiService.js',
  'utils/comparisonUtils.js',
  'utils/httpUtils.js',
  'utils/nba/parseMinutes.js',
  'utils/nba/rateLimiter.js'
];

const backendDir = path.join(__dirname, '..');

function processFile(relativePath) {
  const filePath = path.join(backendDir, relativePath);

  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${relativePath}`);
    return { file: relativePath, changes: 0, error: 'not found' };
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  let changes = 0;

  // Check if logger is already imported
  const hasLoggerImport = /require\(['"]\.\.?\/.*logger['"]\)/.test(content) ||
                          /require\(['"]\.\.\/utils\/logger['"]\)/.test(content);

  // Calculate relative path to logger
  const depth = relativePath.split('/').length - 1;
  const loggerPath = '../'.repeat(depth) + 'utils/logger';

  // Add logger import if not present
  if (!hasLoggerImport) {
    // Find the last require statement
    const requireMatches = content.match(/const .+ = require\([^)]+\);?\n/g);
    if (requireMatches && requireMatches.length > 0) {
      const lastRequire = requireMatches[requireMatches.length - 1];
      const insertPos = content.lastIndexOf(lastRequire) + lastRequire.length;
      content = content.slice(0, insertPos) +
                `const logger = require('${loggerPath}');\n` +
                content.slice(insertPos);
      changes++;
    }
  }

  // Replace console.log with logger.debug or logger.info
  content = content.replace(/console\.log\(/g, () => {
    changes++;
    return 'logger.debug(';
  });

  // Replace console.error with logger.error
  content = content.replace(/console\.error\(/g, () => {
    changes++;
    return 'logger.error(';
  });

  // Replace console.warn with logger.warn
  content = content.replace(/console\.warn\(/g, () => {
    changes++;
    return 'logger.warn(';
  });

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${relativePath}: ${changes} changes`);
  }

  return { file: relativePath, changes };
}

console.log('Replacing console.log/error/warn with logger calls...\n');

let totalChanges = 0;
const results = [];

for (const file of filesToProcess) {
  const result = processFile(file);
  results.push(result);
  totalChanges += result.changes;
}

console.log(`\nDone! Total changes: ${totalChanges}`);
console.log(`Files processed: ${results.length}`);
