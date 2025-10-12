/**
 * Safe date parsing that avoids timezone conversion issues
 * Parses YYYY-MM-DD strings as local dates instead of UTC
 * @param {string|Date} dateInput - Date string in YYYY-MM-DD format, ISO format, or Date object
 * @returns {Date} Date object representing the local date
 */
const parseLocalDate = (dateInput) => {
  if (!dateInput) return null;

  // If it's already a Date object, return as is
  if (dateInput instanceof Date) return dateInput;

  // Convert to string and trim
  const dateStr = String(dateInput).trim();

  // Extract just the date portion from ISO strings (e.g., "2025-10-12T00:00:00.000Z" -> "2025-10-12")
  // This prevents timezone conversion issues with MongoDB dates
  const dateOnly = dateStr.split('T')[0];

  // Check if it's a YYYY-MM-DD format string
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    const [year, month, day] = dateOnly.split('-').map(Number);
    return new Date(year, month - 1, day); // month is 0-indexed
  }

  // Fallback to standard Date parsing for other formats
  return new Date(dateInput);
};

/**
 * Parse date or return default
 * @param {string|Date} dateInput - Date to parse
 * @param {Date} defaultDate - Default date if dateInput is null/undefined
 * @returns {Date} Parsed date or default
 */
const parseDateOrDefault = (dateInput, defaultDate = new Date()) => {
  return dateInput ? parseLocalDate(dateInput) : defaultDate;
};

/**
 * Build MongoDB date range query
 * @param {string|Date} startDate - Start date
 * @param {string|Date} endDate - End date
 * @param {string} fieldName - Field name for query (default: 'date')
 * @returns {Object} MongoDB query object
 */
const buildDateRangeQuery = (startDate, endDate, fieldName = 'date') => {
  const query = {};
  if (startDate || endDate) {
    query[fieldName] = {};
    if (startDate) query[fieldName].$gte = parseLocalDate(startDate);
    if (endDate) query[fieldName].$lte = parseLocalDate(endDate);
  }
  return query;
};

/**
 * Get start and end of day boundaries for a date
 * @param {string|Date} date - Date to get boundaries for
 * @returns {Object} Object with startOfDay and endOfDay
 */
const getDayBoundaries = (date) => {
  const parsedDate = parseLocalDate(date);
  return {
    startOfDay: new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate()),
    endOfDay: new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate() + 1)
  };
};

module.exports = {
  parseLocalDate,
  parseDateOrDefault,
  buildDateRangeQuery,
  getDayBoundaries
};