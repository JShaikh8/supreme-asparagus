// backend/utils/httpUtils.js
// Shared HTTP utilities for NCAA sports data fetching

const logger = require('./logger');
/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {string} context - Description of what's being retried (for logging)
 * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
 * @param {number} baseDelay - Base delay in milliseconds (default: 2000)
 * @returns {Promise<any>} Result of the function
 */
async function retryWithBackoff(fn, context = 'Request', maxRetries = 3, baseDelay = 2000) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if error is retryable (network errors, timeouts)
      const isRetryable =
        error.code === 'ECONNRESET' ||
        error.code === 'ECONNABORTED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.message?.includes('timeout');

      if (attempt < maxRetries && isRetryable) {
        const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff: 2s, 4s, 8s
        logger.debug(`  🔄 Retry ${context} - attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay (${error.code || error.message})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else if (attempt >= maxRetries) {
        logger.error(`  ❌ ${context} failed after ${maxRetries} retries`);
        throw lastError;
      } else {
        // Non-retryable error, fail immediately
        throw error;
      }
    }
  }

  throw lastError;
}

/**
 * User-Agent strings for rotation to avoid bot detection
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
];

/**
 * User-Agent rotator class
 */
class UserAgentRotator {
  constructor(userAgents = USER_AGENTS) {
    this.userAgents = userAgents;
    this.currentIndex = 0;
  }

  /**
   * Get the next user agent in rotation
   * @returns {string} User-Agent string
   */
  getNext() {
    const userAgent = this.userAgents[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.userAgents.length;
    return userAgent;
  }

  /**
   * Get a random user agent
   * @returns {string} User-Agent string
   */
  getRandom() {
    const randomIndex = Math.floor(Math.random() * this.userAgents.length);
    return this.userAgents[randomIndex];
  }
}

/**
 * Clean player name by removing HTML tags and converting format
 * @param {string} name - Raw player name
 * @returns {string} Cleaned player name
 */
function cleanPlayerName(name) {
  if (!name) return '';

  // Remove HTML tags like <a href='...'>Name</a>
  let cleanName = name.replace(/<[^>]*>/g, '').trim();

  // Convert "LastName,FirstName" to "FirstName LastName"
  if (cleanName.includes(',')) {
    const parts = cleanName.split(',').map(p => p.trim());
    if (parts.length === 2) {
      cleanName = `${parts[1]} ${parts[0]}`; // "Jones,Alijah" -> "Alijah Jones"
    }
  }

  return cleanName;
}

/**
 * Common axios config for NCAA stats fetching
 * @param {string} userAgent - User-Agent string
 * @param {number} timeout - Timeout in milliseconds (default: 30000)
 * @returns {object} Axios config object
 */
function getAxiosConfig(userAgent, timeout = 30000) {
  return {
    timeout,
    family: 4, // Force IPv4 to avoid IPv6 connectivity issues
    headers: {
      'User-Agent': userAgent,
      'Accept': 'application/json'
    }
  };
}

module.exports = {
  retryWithBackoff,
  UserAgentRotator,
  USER_AGENTS,
  cleanPlayerName,
  getAxiosConfig
};
