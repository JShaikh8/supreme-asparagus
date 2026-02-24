// frontend/src/components/comparison/comparisonUtils.js
//
// Shared utility functions for comparison components

/**
 * Check if a module is a stats-type module
 * @param {string} moduleId - The module identifier
 * @returns {boolean}
 */
export const isStatsTypeModule = (moduleId) => {
  if (!moduleId) return false;
  return moduleId.includes('_stats') || moduleId.includes('boxscore');
};

/**
 * Check if a module is a schedule comparison module
 * @param {string} moduleId - The module identifier
 * @returns {boolean}
 */
export const isScheduleModule = (moduleId) => {
  if (!moduleId) return false;
  return moduleId.includes('_schedule') || moduleId.includes('schedule');
};

/**
 * Check if a module is a roster comparison module
 * @param {string} moduleId - The module identifier
 * @returns {boolean}
 */
export const isRosterModule = (moduleId) => {
  if (!moduleId) return false;
  return moduleId.includes('_roster') || moduleId.includes('roster');
};

/**
 * Get display name for a team
 * @param {Object} team - Team object
 * @returns {string}
 */
export const getTeamDisplayName = (team) => {
  if (!team) return '';
  return `${team.teamName}${team.teamNickname ? ` ${team.teamNickname}` : ''}`;
};

/**
 * Get status color based on match percentage
 * @param {number} percentage - Match percentage (0-100)
 * @returns {string} - 'success', 'warning', or 'error'
 */
export const getStatusColor = (percentage) => {
  if (percentage >= 90) return 'success';
  if (percentage >= 70) return 'warning';
  return 'error';
};

/**
 * Normalize a name for matching purposes
 * @param {string} name - The name to normalize
 * @returns {string}
 */
export const normalizeName = (name) => {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/jr\.?|sr\.?|ii|iii|iv/gi, '')
    .trim();
};

/**
 * Format a stat value for display
 * @param {*} value - The value to format
 * @returns {string}
 */
export const formatStatValue = (value) => {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object') {
    // Handle nested stats like fieldGoals: { made: 5, attempts: 10 }
    if (value.made !== undefined && value.attempts !== undefined) {
      return `${value.made}/${value.attempts}`;
    }
    return JSON.stringify(value);
  }
  return String(value);
};

/**
 * Get value from nested object path
 * @param {Object} obj - The object to traverse
 * @param {string} path - Dot-separated path (e.g., 'fieldGoals.made')
 * @returns {*}
 */
export const getNestedValue = (obj, path) => {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let value = obj;
  for (const part of parts) {
    if (value && typeof value === 'object') {
      value = value[part];
    } else {
      return undefined;
    }
  }
  return value;
};

/**
 * Get entity type based on module
 * @param {boolean} isSchedule - Is schedule comparison
 * @param {boolean} isStats - Is stats comparison
 * @returns {string}
 */
export const getEntityType = (isSchedule, isStats) => {
  if (isSchedule) return 'game';
  return 'player';
};

/**
 * Get entity type plural form
 * @param {boolean} isSchedule - Is schedule comparison
 * @param {boolean} isStats - Is stats comparison
 * @returns {string}
 */
export const getEntityTypePlural = (isSchedule, isStats) => {
  if (isSchedule) return 'games';
  return 'players';
};

/**
 * Get source display name
 * @param {string} source - Source identifier
 * @returns {string}
 */
export const getSourceDisplayName = (source) => {
  switch (source) {
    case 'api':
      return 'Stats API';
    case 'oracle':
      return 'Oracle Database';
    case 'baseline':
      return 'Baseline';
    default:
      return source;
  }
};

/**
 * Available comparison modules
 */
export const COMPARISON_MODULES = [
  { value: 'ncaa_football_roster', label: 'Football Roster', league: 'NCAA' },
  { value: 'ncaa_football_schedule', label: 'Football Schedule', league: 'NCAA' },
  { value: 'ncaa_football_stats', label: 'Football Stats (Game-by-Game)', league: 'NCAA' },
  { value: 'ncaa_mensBasketball_roster', label: "Men's Basketball Roster", league: 'NCAA' },
  { value: 'ncaa_mensBasketball_schedule', label: "Men's Basketball Schedule", league: 'NCAA' },
  { value: 'ncaa_mensBasketball_stats', label: "Men's Basketball Stats (Game-by-Game)", league: 'NCAA' },
  { value: 'ncaa_womensBasketball_roster', label: "Women's Basketball Roster", league: 'NCAA' },
  { value: 'ncaa_womensBasketball_schedule', label: "Women's Basketball Schedule", league: 'NCAA' },
  { value: 'ncaa_womensBasketball_stats', label: "Women's Basketball Stats (Game-by-Game)", league: 'NCAA' },
  { value: 'mlb_roster', label: 'MLB Roster', league: 'MLB' },
  { value: 'nba_schedule', label: 'NBA Schedule', league: 'NBA' }
];

/**
 * Get modules filtered by league
 * @param {string} league - League identifier
 * @returns {Array}
 */
export const getModulesForLeague = (league) => {
  if (!league) return [];
  return COMPARISON_MODULES.filter(mod => mod.league === league);
};

/**
 * Get unique conferences for a league from teams
 * @param {Array} teams - Array of team objects
 * @param {string} league - League to filter by
 * @returns {Array}
 */
export const getConferencesForLeague = (teams, league) => {
  if (!league || !teams) return [];
  const conferencesSet = new Set(
    teams
      .filter(t => t.league === league && t.conference)
      .map(t => t.conference)
  );
  return [...conferencesSet].sort();
};

/**
 * Field labels for discrepancy display
 */
export const FIELD_LABELS = {
  // Player fields
  jersey: 'Jersey Number',
  position: 'Position',
  height: 'Height',
  weight: 'Weight',
  year: 'Year/Class',
  hometown: 'Hometown',
  highSchool: 'High School',
  experience: 'Experience',

  // Schedule fields
  date: 'Date',
  time: 'Time',
  opponent: 'Opponent',
  location: 'Location',
  venue: 'Venue',
  tv: 'TV Network',
  result: 'Result',
  score: 'Score'
};

/**
 * Get field label for display
 * @param {string} field - Field name
 * @returns {string}
 */
export const getFieldLabel = (field) => {
  return FIELD_LABELS[field] || field.charAt(0).toUpperCase() + field.slice(1);
};
