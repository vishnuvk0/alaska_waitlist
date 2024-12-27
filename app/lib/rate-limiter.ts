/**
 * Rate limiter to control scraping frequency
 * Uses a Map to track last scrape time for each flight
 */
class RateLimiter {
  private lastScrapeTime: Map<string, number> = new Map();
  private readonly intervalMs: number = 600000; // Default 10 minutes

  /**
   * Check if enough time has passed since last scrape
   * @param {string} flightKey - Unique identifier for the flight (e.g. "AS123|2024-01-01")
   * @returns {boolean}
   */
  canScrape(flightKey: string): boolean {
    const now = Date.now();
    const lastTime = this.lastScrapeTime.get(flightKey) || 0;
    return (now - lastTime) >= this.intervalMs;
  }

  /**
   * Get remaining time until next scrape is allowed
   * @param {string} flightKey - Unique identifier for the flight
   * @returns {number} Milliseconds until next scrape is allowed
   */
  getTimeUntilNextScrape(flightKey: string): number {
    const now = Date.now();
    const lastTime = this.lastScrapeTime.get(flightKey) || 0;
    const timePassed = now - lastTime;
    return Math.max(0, this.intervalMs - timePassed);
  }

  /**
   * Record a scrape attempt
   * @param {string} flightKey - Unique identifier for the flight
   */
  recordScrape(flightKey: string): void {
    this.lastScrapeTime.set(flightKey, Date.now());
  }

  /**
   * Clear rate limit for a specific flight
   * @param {string} flightKey - Unique identifier for the flight
   */
  clearLimit(flightKey: string): void {
    this.lastScrapeTime.delete(flightKey);
  }
}

// Export singleton instance
export const rateLimiter = new RateLimiter(); 