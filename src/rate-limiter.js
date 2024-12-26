/**
 * Rate limiter to control scraping frequency
 * Uses a Map to track last scrape time for each flight
 */
class RateLimiter {
  constructor(intervalMs = 600000) { // Default 10 minutes
    this.lastScrapeTime = new Map();
    this.intervalMs = intervalMs;
  }

  /**
   * Check if enough time has passed since last scrape
   * @param {string} flightKey - Unique identifier for the flight (e.g. "AS123|2024-01-01")
   * @returns {boolean}
   */
  canScrape(flightKey) {
    const now = Date.now();
    const lastTime = this.lastScrapeTime.get(flightKey) || 0;
    return (now - lastTime) >= this.intervalMs;
  }

  /**
   * Get remaining time until next scrape is allowed
   * @param {string} flightKey - Unique identifier for the flight
   * @returns {number} Milliseconds until next scrape is allowed
   */
  getTimeUntilNextScrape(flightKey) {
    const now = Date.now();
    const lastTime = this.lastScrapeTime.get(flightKey) || 0;
    const timePassed = now - lastTime;
    return Math.max(0, this.intervalMs - timePassed);
  }

  /**
   * Record a scrape attempt
   * @param {string} flightKey - Unique identifier for the flight
   */
  recordScrape(flightKey) {
    this.lastScrapeTime.set(flightKey, Date.now());
  }

  /**
   * Clear rate limit for a specific flight
   * @param {string} flightKey - Unique identifier for the flight
   */
  clearLimit(flightKey) {
    this.lastScrapeTime.delete(flightKey);
  }
}

// Export singleton instance
export const rateLimiter = new RateLimiter(); 