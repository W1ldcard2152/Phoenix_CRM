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

/**
 * Generic cache getter
 * @param {String} key - Cache key
 * @returns {Any|null} Cached value or null
 */
const get = (key) => {
  const cached = cache.get(key);
  if (cached) {
    console.log(`[Cache HIT] ${key}`);
  } else {
    console.log(`[Cache MISS] ${key}`);
  }
  return cached;
};

/**
 * Generic cache setter
 * @param {String} key - Cache key
 * @param {Any} value - Value to cache
 * @param {Number} ttl - Optional TTL in seconds (overrides default)
 */
const set = (key, value, ttl) => {
  cache.set(key, value, ttl);
  console.log(`[Cache SET] ${key}`);
};

/**
 * Invalidate cache entries by pattern
 * @param {String} pattern - Pattern to match (e.g., 'workorders:', 'customers:')
 */
const invalidateByPattern = (pattern) => {
  const keys = cache.keys();
  const matchingKeys = keys.filter(key => key.startsWith(pattern));

  if (matchingKeys.length > 0) {
    cache.del(matchingKeys);
    console.log(`[Cache INVALIDATE] Cleared ${matchingKeys.length} cache entries matching '${pattern}'`);
  }
};

/**
 * Work Order caching helpers
 */
const getWorkOrdersByStatus = (status) => {
  return get(`workorders:status:${status}`);
};

const setWorkOrdersByStatus = (status, workOrders) => {
  set(`workorders:status:${status}`, workOrders, 300); // 5 minute TTL for work orders
};

const getWorkOrderById = (id) => {
  return get(`workorder:${id}`);
};

const setWorkOrderById = (id, workOrder) => {
  set(`workorder:${id}`, workOrder, 300); // 5 minute TTL
};

const invalidateAllWorkOrders = () => {
  invalidateByPattern('workorder');
};

/**
 * Service Writer's Corner caching
 */
const getServiceWritersCorner = () => {
  return get('servicewriters:corner');
};

const setServiceWritersCorner = (data) => {
  set('servicewriters:corner', data, 180); // 3 minute TTL for high-priority data
};

const invalidateServiceWritersCorner = () => {
  cache.del('servicewriters:corner');
  console.log('[Cache INVALIDATE] Service Writers Corner cache cleared');
};

/**
 * Customer caching helpers
 */
const getCustomerById = (id) => {
  return get(`customer:${id}`);
};

const setCustomerById = (id, customer) => {
  set(`customer:${id}`, customer, 600); // 10 minute TTL
};

const invalidateAllCustomers = () => {
  invalidateByPattern('customer');
};

/**
 * Vehicle caching helpers
 */
const getVehicleById = (id) => {
  return get(`vehicle:${id}`);
};

const setVehicleById = (id, vehicle) => {
  set(`vehicle:${id}`, vehicle, 600); // 10 minute TTL
};

const invalidateAllVehicles = () => {
  invalidateByPattern('vehicle');
};

module.exports = {
  // Appointment caching
  getAppointmentsByDateRange,
  setAppointmentsByDateRange,
  invalidateAllAppointments,

  // Work Order caching
  getWorkOrdersByStatus,
  setWorkOrdersByStatus,
  getWorkOrderById,
  setWorkOrderById,
  invalidateAllWorkOrders,

  // Service Writer's Corner caching
  getServiceWritersCorner,
  setServiceWritersCorner,
  invalidateServiceWritersCorner,

  // Customer caching
  getCustomerById,
  setCustomerById,
  invalidateAllCustomers,

  // Vehicle caching
  getVehicleById,
  setVehicleById,
  invalidateAllVehicles,

  // Generic caching
  get,
  set,
  invalidateByPattern,

  // Utility
  getStats,
  flushAll
};
