const NodeCache = require('node-cache');

/**
 * Cache Service for reducing database load
 *
 * Uses in-memory caching with automatic expiration
 * Cache keys are namespaced by data type (e.g., 'appointments:2025-10-27_2025-11-02')
 */

// Initialize cache with 10 minute TTL (600 seconds)
const cache = new NodeCache({
  stdTTL: 600, // 10 minutes default
  checkperiod: 120, // Check for expired keys every 2 minutes
  useClones: false // Return references for better performance (data is read-only in our case)
});

/**
 * Generate a cache key for appointment date range queries
 * @param {String} startDate - Start date in YYYY-MM-DD format
 * @param {String} endDate - End date in YYYY-MM-DD format
 * @returns {String} Cache key
 */
const getAppointmentDateRangeKey = (startDate, endDate) => {
  return `appointments:${startDate}_${endDate}`;
};

/**
 * Get cached appointments by date range
 * @param {String} startDate - Start date in YYYY-MM-DD format
 * @param {String} endDate - End date in YYYY-MM-DD format
 * @returns {Array|null} Cached appointments or null if not cached
 */
const getAppointmentsByDateRange = (startDate, endDate) => {
  const key = getAppointmentDateRangeKey(startDate, endDate);
  const cached = cache.get(key);

  if (cached) {
    console.log(`[Cache HIT] Appointments: ${startDate} to ${endDate}`);
  } else {
    console.log(`[Cache MISS] Appointments: ${startDate} to ${endDate}`);
  }

  return cached;
};

/**
 * Cache appointments by date range
 * @param {String} startDate - Start date in YYYY-MM-DD format
 * @param {String} endDate - End date in YYYY-MM-DD format
 * @param {Array} appointments - Appointments to cache
 */
const setAppointmentsByDateRange = (startDate, endDate, appointments) => {
  const key = getAppointmentDateRangeKey(startDate, endDate);
  cache.set(key, appointments);
  console.log(`[Cache SET] Appointments: ${startDate} to ${endDate} (${appointments.length} items)`);
};

/**
 * Invalidate all appointment caches
 * Called when an appointment is created, updated, or deleted
 */
const invalidateAllAppointments = () => {
  const keys = cache.keys();
  const appointmentKeys = keys.filter(key => key.startsWith('appointments:'));

  if (appointmentKeys.length > 0) {
    cache.del(appointmentKeys);
    console.log(`[Cache INVALIDATE] Cleared ${appointmentKeys.length} appointment cache entries`);
  }
};

/**
 * Get cache statistics
 * Useful for monitoring cache performance
 */
const getStats = () => {
  return cache.getStats();
};

/**
 * Clear all cache entries
 * Use sparingly - mainly for testing or manual cache reset
 */
const flushAll = () => {
  cache.flushAll();
  console.log('[Cache FLUSH] All cache entries cleared');
};

module.exports = {
  getAppointmentsByDateRange,
  setAppointmentsByDateRange,
  invalidateAllAppointments,
  getStats,
  flushAll
};
