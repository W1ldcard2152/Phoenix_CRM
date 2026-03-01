const moment = require('moment-timezone');
const { TIMEZONE } = require('../config/timezone');

/**
 * Safe date parsing that creates dates at midnight in the BUSINESS timezone.
 * This ensures that "2025-10-12" always represents Oct 12 in America/New_York,
 * regardless of what timezone the server process runs in.
 *
 * @param {string|Date} dateInput - Date string in YYYY-MM-DD format, ISO format, or Date object
 * @returns {Date} Date object representing midnight of that date in the business timezone
 */
const parseLocalDate = (dateInput) => {
  if (!dateInput) return null;

  // If it's already a Date object, return as is
  if (dateInput instanceof Date) return dateInput;

  // Convert to string and trim
  const dateStr = String(dateInput).trim();

  // Extract just the date portion from ISO strings (e.g., "2025-10-12T00:00:00.000Z" -> "2025-10-12")
  const dateOnly = dateStr.split('T')[0];

  // Parse YYYY-MM-DD as midnight in the business timezone
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return moment.tz(dateOnly, 'YYYY-MM-DD', TIMEZONE).toDate();
  }

  // Fallback to standard Date parsing for other formats
  return new Date(dateInput);
};

/**
 * Parse date or return default (today at midnight in business timezone)
 * @param {string|Date} dateInput - Date to parse
 * @param {Date} defaultDate - Default date if dateInput is null/undefined
 * @returns {Date} Parsed date or default
 */
const parseDateOrDefault = (dateInput, defaultDate = moment.tz(TIMEZONE).startOf('day').toDate()) => {
  return dateInput ? parseLocalDate(dateInput) : defaultDate;
};

/**
 * Build MongoDB date range query using business timezone boundaries.
 * startDate uses start-of-day, endDate uses end-of-day so the full day is included.
 * @param {string|Date} startDate - Start date
 * @param {string|Date} endDate - End date
 * @param {string} fieldName - Field name for query (default: 'date')
 * @returns {Object} MongoDB query object
 */
const buildDateRangeQuery = (startDate, endDate, fieldName = 'date') => {
  const query = {};
  if (startDate || endDate) {
    query[fieldName] = {};
    if (startDate) {
      const startStr = String(startDate).split('T')[0];
      query[fieldName].$gte = moment.tz(startStr, 'YYYY-MM-DD', TIMEZONE).startOf('day').toDate();
    }
    if (endDate) {
      const endStr = String(endDate).split('T')[0];
      query[fieldName].$lte = moment.tz(endStr, 'YYYY-MM-DD', TIMEZONE).endOf('day').toDate();
    }
  }
  return query;
};

/**
 * Get start and end of day boundaries for a date in the business timezone
 * @param {string|Date} date - Date to get boundaries for
 * @returns {Object} Object with startOfDay and endOfDay
 */
const getDayBoundaries = (date) => {
  const dateStr = date instanceof Date
    ? moment.utc(date).tz(TIMEZONE).format('YYYY-MM-DD')
    : String(date).split('T')[0];
  return {
    startOfDay: moment.tz(dateStr, 'YYYY-MM-DD', TIMEZONE).startOf('day').toDate(),
    endOfDay: moment.tz(dateStr, 'YYYY-MM-DD', TIMEZONE).endOf('day').toDate()
  };
};

/**
 * Get "today" at midnight in the business timezone.
 * Use this instead of new Date() when setting date-only fields.
 * @returns {Date} Today at midnight in the business timezone
 */
const todayInTz = () => {
  return moment.tz(TIMEZONE).startOf('day').toDate();
};

/**
 * Get "start of today" boundary in the business timezone for queries.
 * @returns {Date} Start of today in business timezone
 */
const startOfTodayInTz = () => {
  return moment.tz(TIMEZONE).startOf('day').toDate();
};

module.exports = {
  parseLocalDate,
  parseDateOrDefault,
  buildDateRangeQuery,
  getDayBoundaries,
  todayInTz,
  startOfTodayInTz
};