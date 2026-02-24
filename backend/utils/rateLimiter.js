// backend/utils/rateLimiter.js
// Utility for parallel processing with rate limiting

const { RATE_LIMITS } = require('../constants');

/**
 * Process items in parallel with concurrency control and rate limiting
 * @param {Array} items - Array of items to process
 * @param {Function} processor - Async function to process each item
 * @param {Object} options - Configuration options
 * @param {number} options.concurrency - Max concurrent operations (default: 3)
 * @param {number} options.delayMs - Delay between batches in ms (default: 2000)
 * @param {Function} options.onProgress - Progress callback (index, total, result)
 * @returns {Promise<Array>} Array of results
 */
async function parallelProcess(items, processor, options = {}) {
  const {
    concurrency = 3,
    delayMs = RATE_LIMITS.BULK_FETCH_DELAY_MS,
    onProgress = null
  } = options;

  const results = [];
  let index = 0;

  // Process items in batches
  while (index < items.length) {
    const batch = items.slice(index, index + concurrency);

    // Process batch in parallel
    const batchResults = await Promise.all(
      batch.map(async (item, batchIndex) => {
        const currentIndex = index + batchIndex;
        try {
          const result = await processor(item, currentIndex);
          if (onProgress) {
            onProgress(currentIndex, items.length, { success: true, result });
          }
          return { item, success: true, result };
        } catch (error) {
          if (onProgress) {
            onProgress(currentIndex, items.length, { success: false, error: error.message });
          }
          return { item, success: false, error: error.message };
        }
      })
    );

    results.push(...batchResults);
    index += concurrency;

    // Rate limiting - wait between batches (but not after the last batch)
    if (index < items.length && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

/**
 * Process items sequentially with rate limiting
 * @param {Array} items - Array of items to process
 * @param {Function} processor - Async function to process each item
 * @param {Object} options - Configuration options
 * @param {number} options.delayMs - Delay between items in ms (default: 2000)
 * @param {Function} options.onProgress - Progress callback (index, total, result)
 * @returns {Promise<Array>} Array of results
 */
async function sequentialProcess(items, processor, options = {}) {
  const {
    delayMs = RATE_LIMITS.BULK_FETCH_DELAY_MS,
    onProgress = null
  } = options;

  const results = [];

  for (let i = 0; i < items.length; i++) {
    try {
      const result = await processor(items[i], i);
      results.push({ item: items[i], success: true, result });
      if (onProgress) {
        onProgress(i, items.length, { success: true, result });
      }
    } catch (error) {
      results.push({ item: items[i], success: false, error: error.message });
      if (onProgress) {
        onProgress(i, items.length, { success: false, error: error.message });
      }
    }

    // Rate limiting - wait between items (but not after the last item)
    if (i < items.length - 1 && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

/**
 * Simple rate-limited queue for controlling request frequency
 */
class RateLimitedQueue {
  constructor(options = {}) {
    this.maxConcurrent = options.maxConcurrent || 3;
    this.minDelayMs = options.minDelayMs || 1000;
    this.running = 0;
    this.queue = [];
    this.lastRequestTime = 0;
  }

  async add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minDelayMs) {
      setTimeout(() => this.processQueue(), this.minDelayMs - timeSinceLastRequest);
      return;
    }

    const { task, resolve, reject } = this.queue.shift();
    this.running++;
    this.lastRequestTime = Date.now();

    try {
      const result = await task();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      this.processQueue();
    }
  }

  get pending() {
    return this.queue.length;
  }

  get active() {
    return this.running;
  }
}

module.exports = {
  parallelProcess,
  sequentialProcess,
  RateLimitedQueue
};
