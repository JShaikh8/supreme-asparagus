// backend/utils/nba/parseMinutes.js
const logger = require('../logger');
/**
 * Parse NBA API's ISO 8601 duration format to decimal minutes
 *
 * Examples:
 *   PT36M34.00S  � 36.57 (36 minutes, 34 seconds)
 *   PT33M26.99S  � 33.45
 *   PT00M00.00S  � 0 (DNP)
 *   PT12M05.50S  � 12.09
 *
 * @param {string} minutesString - ISO 8601 duration string
 * @returns {number} - Minutes as decimal (e.g., 36.57)
 */
function parseMinutes(minutesString) {
  // Handle null/undefined/empty
  if (!minutesString || minutesString === "PT00M00.00S" || minutesString === "PT0M0.00S") {
    return 0;
  }

  // Match format: PT{minutes}M{seconds}S
  const match = minutesString.match(/PT(\d+)M([\d.]+)S/);

  if (!match) {
    logger.warn(`Failed to parse minutes: ${minutesString}`);
    return 0;
  }

  const minutes = parseInt(match[1], 10);
  const seconds = parseFloat(match[2]);

  // Convert to decimal minutes (round to 2 decimal places)
  return parseFloat((minutes + (seconds / 60)).toFixed(2));
}

/**
 * Convert decimal minutes back to ISO 8601 duration format
 * (Useful for testing or reverse conversion)
 *
 * @param {number} decimalMinutes - Minutes as decimal (e.g., 36.57)
 * @returns {string} - ISO 8601 duration string
 */
function toISODuration(decimalMinutes) {
  if (!decimalMinutes || decimalMinutes === 0) {
    return "PT00M00.00S";
  }

  const minutes = Math.floor(decimalMinutes);
  const seconds = ((decimalMinutes - minutes) * 60).toFixed(2);

  return `PT${minutes}M${seconds}S`;
}

/**
 * Format minutes for display (e.g., 36.57 � "36:34")
 *
 * @param {number} decimalMinutes - Minutes as decimal
 * @returns {string} - Formatted string (MM:SS)
 */
function formatMinutes(decimalMinutes) {
  if (!decimalMinutes || decimalMinutes === 0) {
    return "0:00";
  }

  const minutes = Math.floor(decimalMinutes);
  const seconds = Math.round((decimalMinutes - minutes) * 60);

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

module.exports = {
  parseMinutes,
  toISODuration,
  formatMinutes
};
