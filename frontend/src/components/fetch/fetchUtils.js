// frontend/src/components/fetch/fetchUtils.js
//
// Shared utility functions for fetch/data collection components

/**
 * Available fetch modules organized by type
 */
export const FETCH_MODULES = {
  roster: [
    { value: 'ncaa-football-roster', label: 'Football Roster', sport: 'football', league: 'NCAA' },
    { value: 'ncaa-basketball-roster', label: 'Basketball Roster', sport: 'basketball', league: 'NCAA' },
    { value: 'mlb-roster', label: 'MLB Roster', sport: 'baseball', league: 'MLB' }
  ],
  schedule: [
    { value: 'ncaa-football-schedule', label: 'Football Schedule', sport: 'football', league: 'NCAA' },
    { value: 'ncaa-basketball-schedule', label: 'Basketball Schedule', sport: 'basketball', league: 'NCAA' },
    { value: 'ncaa-mens-basketball-schedule', label: "Men's Basketball Schedule", sport: 'mensBasketball', league: 'NCAA' },
    { value: 'ncaa-womens-basketball-schedule', label: "Women's Basketball Schedule", sport: 'womensBasketball', league: 'NCAA' },
    { value: 'nba-schedule', label: 'NBA Schedule', sport: 'basketball', league: 'NBA' }
  ],
  stats: [
    { value: 'ncaa-football-stats', label: 'Football Stats', sport: 'football', league: 'NCAA' },
    { value: 'ncaa-basketball-stats', label: 'Basketball Stats', sport: 'basketball', league: 'NCAA' },
    { value: 'nba-boxscore', label: 'NBA Boxscore', sport: 'basketball', league: 'NBA' }
  ],
  tv: [
    { value: 'espn-tv', label: 'ESPN TV Schedule', sport: 'multi', league: 'multi' },
    { value: 'cfb-tv', label: 'CFB TV Schedule', sport: 'football', league: 'NCAA' }
  ]
};

/**
 * Get all modules as flat array
 */
export const getAllModules = () => {
  return Object.values(FETCH_MODULES).flat();
};

/**
 * Get modules for a specific league
 * @param {string} league - League identifier (NCAA, NBA, MLB)
 */
export const getModulesForLeague = (league) => {
  const all = getAllModules();
  return all.filter(m => m.league === league || m.league === 'multi');
};

/**
 * Get module type from module ID
 * @param {string} moduleId - Module identifier
 * @returns {string} - 'roster', 'schedule', 'stats', or 'tv'
 */
export const getModuleType = (moduleId) => {
  if (!moduleId) return 'unknown';
  if (moduleId.includes('roster')) return 'roster';
  if (moduleId.includes('schedule')) return 'schedule';
  if (moduleId.includes('stats') || moduleId.includes('boxscore')) return 'stats';
  if (moduleId.includes('tv')) return 'tv';
  return 'unknown';
};

/**
 * Format player height for display
 * @param {string|number} height - Height value
 * @returns {string}
 */
export const formatHeight = (height) => {
  if (!height) return '-';
  // If already formatted (e.g., "6-2"), return as is
  if (typeof height === 'string' && height.includes('-')) {
    return height;
  }
  // If in inches, convert to feet-inches
  const inches = parseInt(height);
  if (!isNaN(inches)) {
    const feet = Math.floor(inches / 12);
    const remainingInches = inches % 12;
    return `${feet}-${remainingInches}`;
  }
  return height;
};

/**
 * Format player weight for display
 * @param {string|number} weight - Weight value
 * @returns {string}
 */
export const formatWeight = (weight) => {
  if (!weight) return '-';
  return `${weight} lbs`;
};

/**
 * Format date for schedule display
 * @param {string} dateStr - Date string
 * @returns {string}
 */
export const formatScheduleDate = (dateStr) => {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return dateStr;
  }
};

/**
 * Format time for schedule display
 * @param {string} timeStr - Time string
 * @returns {string}
 */
export const formatScheduleTime = (timeStr) => {
  if (!timeStr) return 'TBD';
  return timeStr;
};

/**
 * Get sport display name
 * @param {string} sport - Sport identifier
 * @returns {string}
 */
export const getSportDisplayName = (sport) => {
  const names = {
    football: 'Football',
    basketball: 'Basketball',
    mensBasketball: "Men's Basketball",
    womensBasketball: "Women's Basketball",
    baseball: 'Baseball'
  };
  return names[sport] || sport;
};

/**
 * Football stat categories
 */
export const FOOTBALL_STAT_CATEGORIES = [
  { id: 'passing', label: 'Passing' },
  { id: 'rushing', label: 'Rushing' },
  { id: 'receiving', label: 'Receiving' },
  { id: 'kicking', label: 'Kicking' },
  { id: 'punting', label: 'Punting' },
  { id: 'returns', label: 'Returns' },
  { id: 'defense', label: 'Defense' },
  { id: 'misc', label: 'Misc' }
];

/**
 * Basketball stat columns
 */
export const BASKETBALL_STAT_COLUMNS = [
  { key: 'name', label: 'Player' },
  { key: 'minutes', label: 'MIN' },
  { key: 'points', label: 'PTS' },
  { key: 'rebounds', label: 'REB' },
  { key: 'assists', label: 'AST' },
  { key: 'steals', label: 'STL' },
  { key: 'blocks', label: 'BLK' },
  { key: 'turnovers', label: 'TO' },
  { key: 'fouls', label: 'PF' },
  { key: 'fgm', label: 'FGM' },
  { key: 'fga', label: 'FGA' },
  { key: 'fg3m', label: '3PM' },
  { key: 'fg3a', label: '3PA' },
  { key: 'ftm', label: 'FTM' },
  { key: 'fta', label: 'FTA' }
];

/**
 * NBA stat columns (extended)
 */
export const NBA_STAT_COLUMNS = [
  ...BASKETBALL_STAT_COLUMNS,
  { key: 'plusMinus', label: '+/-' },
  { key: 'offReb', label: 'OREB' },
  { key: 'defReb', label: 'DREB' }
];

/**
 * Determine if a module produces tabular data
 * @param {string} moduleId - Module identifier
 * @returns {boolean}
 */
export const isTabularModule = (moduleId) => {
  return moduleId.includes('roster') || moduleId.includes('schedule');
};

/**
 * Determine if a module produces stats data
 * @param {string} moduleId - Module identifier
 * @returns {boolean}
 */
export const isStatsModule = (moduleId) => {
  return moduleId.includes('stats') || moduleId.includes('boxscore');
};

/**
 * Get validation status color
 * @param {Object} validation - Validation object with errors
 * @returns {string} - 'success', 'warning', or 'error'
 */
export const getValidationStatus = (validation) => {
  if (!validation) return 'success';
  const errorCount = Object.values(validation).filter(v => v).length;
  if (errorCount === 0) return 'success';
  if (errorCount <= 2) return 'warning';
  return 'error';
};
