// backend/constants/index.js
// Centralized constants to replace magic strings throughout the codebase

// Valid leagues for team configuration
const LEAGUES = {
  NCAA: 'NCAA',
  NFL: 'NFL',
  NBA: 'NBA',
  NHL: 'NHL',
  MLB: 'MLB',
  MILB: 'MILB'
};

const VALID_LEAGUES = Object.values(LEAGUES);

// Valid sports types
const SPORTS = {
  FOOTBALL: 'football',
  MENS_BASKETBALL: 'mensBasketball',
  WOMENS_BASKETBALL: 'womensBasketball',
  BASKETBALL: 'basketball',
  BASEBALL: 'baseball',
  HOCKEY: 'hockey',
  SOCCER: 'soccer'
};

const VALID_SPORTS = Object.values(SPORTS);

// Data types for scraped data
const DATA_TYPES = {
  ROSTER: 'roster',
  SCHEDULE: 'schedule',
  STATS: 'stats'
};

const VALID_DATA_TYPES = Object.values(DATA_TYPES);

// Comparison sources
const COMPARISON_SOURCES = {
  ORACLE: 'oracle',
  API: 'api',
  BASELINE: 'baseline'
};

const VALID_COMPARISON_SOURCES = Object.values(COMPARISON_SOURCES);

// Module IDs
const MODULE_IDS = {
  // NCAA Football
  NCAA_FOOTBALL_ROSTER: 'ncaa_football_roster',
  NCAA_FOOTBALL_SCHEDULE: 'ncaa_football_schedule',
  NCAA_FOOTBALL_STATS: 'ncaa_football_stats',
  // NCAA Men's Basketball
  NCAA_MENS_BASKETBALL_ROSTER: 'ncaa_mensBasketball_roster',
  NCAA_MENS_BASKETBALL_SCHEDULE: 'ncaa_mensBasketball_schedule',
  NCAA_MENS_BASKETBALL_STATS: 'ncaa_mensBasketball_stats',
  // NCAA Women's Basketball
  NCAA_WOMENS_BASKETBALL_ROSTER: 'ncaa_womensBasketball_roster',
  NCAA_WOMENS_BASKETBALL_SCHEDULE: 'ncaa_womensBasketball_schedule',
  NCAA_WOMENS_BASKETBALL_STATS: 'ncaa_womensBasketball_stats',
  // MLB
  MLB_ROSTER: 'mlb_roster',
  // NBA
  NBA_SCHEDULE: 'nba_schedule',
  NBA_BOXSCORE: 'nba_boxscore'
};

const VALID_MODULE_IDS = Object.values(MODULE_IDS);

// Danger zone confirmation strings
const DANGER_ZONE = {
  RESET_CONFIRM: 'RESET_ALL_DATA',
  DELETE_CONFIRM: 'DELETE_ALL_DATA'
};

// Cache settings (in milliseconds)
const CACHE_DURATIONS = {
  DEFAULT_HOURS: 24,
  NBA_SCHEDULE_MINUTES: 5,
  SYSTEM_STATUS_CHECK_MS: 30000
};

// Rate limiting
const RATE_LIMITS = {
  BULK_FETCH_DELAY_MS: 2000,
  DEFAULT_REQUEST_TIMEOUT_MS: 30000,
  MAX_RETRY_ATTEMPTS: 3
};

// HTTP Status Codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500
};

// Error messages
const ERROR_MESSAGES = {
  TEAM_NOT_FOUND: 'Team not found',
  MODULE_NOT_FOUND: 'Module not found',
  VALIDATION_FAILED: 'Validation failed',
  INVALID_PASSWORD: 'Incorrect password',
  PASSWORD_REQUIRED: 'Password required for danger zone operations',
  PASSWORD_NOT_CONFIGURED: 'Danger zone password not configured on server',
  INTERNAL_FEATURES_DISABLED: 'Internal features are not enabled',
  UNAUTHORIZED: 'Unauthorized access'
};

// Success messages
const SUCCESS_MESSAGES = {
  TEAM_CREATED: 'Team created successfully',
  TEAM_UPDATED: 'Team updated successfully',
  TEAM_DELETED: 'Team deleted successfully',
  DATA_EXPORTED: 'Export completed successfully',
  DATA_IMPORTED: 'Import completed successfully',
  CACHE_CLEARED: 'Cache cleared successfully',
  DATABASE_RESET: 'Database reset completed'
};

// Field names for team model
const TEAM_FIELDS = {
  ALLOWED: [
    'statsId',
    'mlbId',
    'nbaTeamId',
    'teamId',
    'espnId',
    'teamName',
    'teamNickname',
    'teamAbbrev',
    'league',
    'conference',
    'division',
    'scrapeType',
    'subScrapeType',
    'baseUrl',
    'href',
    'logoUrl',
    'timezone',
    'ncaaSportsConfig',
    'active'
  ],
  REQUIRED: ['teamId', 'teamName', 'league', 'baseUrl']
};

module.exports = {
  LEAGUES,
  VALID_LEAGUES,
  SPORTS,
  VALID_SPORTS,
  DATA_TYPES,
  VALID_DATA_TYPES,
  COMPARISON_SOURCES,
  VALID_COMPARISON_SOURCES,
  MODULE_IDS,
  VALID_MODULE_IDS,
  DANGER_ZONE,
  CACHE_DURATIONS,
  RATE_LIMITS,
  HTTP_STATUS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  TEAM_FIELDS
};
