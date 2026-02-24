// backend/utils/nba/seasonHelper.js
/**
 * Helper functions for NBA season formatting and date ranges
 */

/**
 * Convert year to NBA season format
 * @param {number} year - Calendar year (e.g., 2023)
 * @returns {string} - Season format (e.g., "2023-24")
 */
function yearToSeason(year) {
  const nextYear = (year + 1).toString().slice(-2);
  return `${year}-${nextYear}`;
}

/**
 * Convert NBA season format to start/end years
 * @param {string} season - Season format (e.g., "2023-24")
 * @returns {{startYear: number, endYear: number}}
 */
function seasonToYears(season) {
  const [startYear, endYearShort] = season.split('-');
  const startYearNum = parseInt(startYear, 10);
  const endYearNum = parseInt(`20${endYearShort}`, 10);

  return {
    startYear: startYearNum,
    endYear: endYearNum
  };
}

/**
 * Get date range for NBA season
 * NBA season typically runs October - June
 *
 * @param {string} season - Season format (e.g., "2023-24")
 * @returns {{startDate: Date, endDate: Date}}
 */
function getSeasonDateRange(season) {
  const { startYear, endYear } = seasonToYears(season);

  const startDate = new Date(`${startYear}-10-01T00:00:00Z`);
  const endDate = new Date(`${endYear}-06-30T23:59:59Z`);

  return { startDate, endDate };
}

/**
 * Determine which season a given date belongs to
 * @param {Date|string} date - Date to check
 * @returns {string} - Season format (e.g., "2023-24")
 */
function dateToSeason(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-12

  // If date is July-December, it's the start of the season year
  // If date is January-June, it's the end of the season year
  if (month >= 7) {
    return yearToSeason(year);
  } else {
    return yearToSeason(year - 1);
  }
}

/**
 * Get current NBA season
 * @returns {string} - Current season format (e.g., "2024-25")
 */
function getCurrentSeason() {
  return dateToSeason(new Date());
}

/**
 * Get all seasons in a range
 * @param {string} startSeason - Start season (e.g., "2020-21")
 * @param {string} endSeason - End season (e.g., "2023-24")
 * @returns {string[]} - Array of seasons
 */
function getSeasonRange(startSeason, endSeason) {
  const { startYear: start } = seasonToYears(startSeason);
  const { startYear: end } = seasonToYears(endSeason);

  const seasons = [];
  for (let year = start; year <= end; year++) {
    seasons.push(yearToSeason(year));
  }

  return seasons;
}

/**
 * Calculate days between two dates
 * @param {Date} date1
 * @param {Date} date2
 * @returns {number} - Days between dates
 */
function daysBetween(date1, date2) {
  const oneDay = 24 * 60 * 60 * 1000; // milliseconds in a day
  return Math.round(Math.abs((date1 - date2) / oneDay));
}

/**
 * Check if a game is a back-to-back
 * @param {Date} currentGameDate
 * @param {Date} previousGameDate
 * @returns {boolean}
 */
function isBackToBack(currentGameDate, previousGameDate) {
  if (!previousGameDate) return false;
  return daysBetween(currentGameDate, previousGameDate) === 1;
}

/**
 * Calculate days of rest
 * @param {Date} currentGameDate
 * @param {Date} previousGameDate
 * @returns {number} - Days of rest (0 = back-to-back, 1 = one day rest, etc.)
 */
function calculateDaysRest(currentGameDate, previousGameDate) {
  if (!previousGameDate) return 99; // First game of season
  return daysBetween(currentGameDate, previousGameDate) - 1;
}

module.exports = {
  yearToSeason,
  seasonToYears,
  getSeasonDateRange,
  dateToSeason,
  getCurrentSeason,
  getSeasonRange,
  daysBetween,
  isBackToBack,
  calculateDaysRest
};
