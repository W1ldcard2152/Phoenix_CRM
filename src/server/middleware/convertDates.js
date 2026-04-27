const moment = require('moment-timezone');
const { TIMEZONE } = require('../config/timezone');

/**
 * Matches naive datetime strings like "2026-03-14T10:30" or "2026-03-14T10:30:00".
 * Does NOT match strings with timezone info (Z suffix or +/-offset).
 */
const NAIVE_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/**
 * Named date-only fields that need day-boundary conversion.
 * Start fields get startOf('day'), end fields get endOf('day').
 */
const DATE_START_FIELDS = new Set(['effectiveFrom', 'oneTimeDate', 'dueDate']);
const DATE_END_FIELDS = new Set(['effectiveUntil']);
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Express middleware that converts local-timezone date strings in req.body to UTC
 * before they reach controllers. This centralizes the conversion so individual
 * controllers don't need to handle it manually.
 *
 * Two conversion types:
 *   1. Naive datetime strings (e.g. "2026-03-14T10:30:00") on ANY field
 *      → interpreted as business timezone, converted to UTC Date object
 *   2. Date-only strings (e.g. "2026-03-14") on named fields only
 *      → converted to start-of-day or end-of-day boundary in UTC
 *
 * Skips values that are already Date objects, or strings with timezone
 * indicators (Z suffix, UTC offset), preventing double-conversion.
 */
const convertDates = (req, res, next) => {
  if (!req.body || typeof req.body !== 'object') return next();

  for (const key of Object.keys(req.body)) {
    const value = req.body[key];
    if (typeof value !== 'string') continue;

    // Convert naive datetime strings to UTC
    if (NAIVE_DATETIME.test(value)) {
      req.body[key] = moment.tz(value, TIMEZONE).utc().toDate();
      continue;
    }

    // Convert named date-only fields to day boundaries
    if (DATE_ONLY.test(value)) {
      if (DATE_START_FIELDS.has(key)) {
        req.body[key] = moment.tz(value, 'YYYY-MM-DD', TIMEZONE).startOf('day').utc().toDate();
      } else if (DATE_END_FIELDS.has(key)) {
        req.body[key] = moment.tz(value, 'YYYY-MM-DD', TIMEZONE).endOf('day').utc().toDate();
      }
    }
  }

  next();
};

module.exports = convertDates;
