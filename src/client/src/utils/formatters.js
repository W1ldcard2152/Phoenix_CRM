// src/utils/formatters.js
import moment from 'moment-timezone';

// Single source of truth for timezone on the client
export const TIMEZONE = process.env.REACT_APP_TIMEZONE || 'America/New_York';

/**
 * Format a number as currency
 * @param {number} amount - The amount to format
 * @param {string} currencyCode - Currency code (default: USD)
 * @param {string} locale - Locale (default: en-US)
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (amount, currencyCode = 'USD', locale = 'en-US') => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0);
  };

/**
 * Format a UTC date to a localized date string in the configured timezone.
 * @param {string|Date} date - UTC date from server
 * @param {string} formatString - moment.js format (default: 'MMM D, YYYY')
 * @returns {string} Formatted date string
 */
export const formatDate = (date, formatString = 'MMM D, YYYY') => {
  if (!date) return '';
  return moment.utc(date).tz(TIMEZONE).format(formatString);
};

/**
 * Format a UTC date to a localized time string in the configured timezone.
 * @param {string|Date} date - UTC date from server
 * @param {string} formatString - moment.js format (default: 'h:mm A')
 * @returns {string} Formatted time string
 */
export const formatTime = (date, formatString = 'h:mm A') => {
  if (!date) return '';
  return moment.utc(date).tz(TIMEZONE).format(formatString);
};

/**
 * Format a UTC date to a localized date+time string in the configured timezone.
 * @param {string|Date} date - UTC date from server
 * @param {string} formatString - moment.js format (default: 'MMM D, YYYY, h:mm A')
 * @returns {string} Formatted date-time string
 */
export const formatDateTime = (date, formatString = 'MMM D, YYYY, h:mm A') => {
  if (!date) return '';
  return moment.utc(date).tz(TIMEZONE).format(formatString);
};

// Backward-compatible alias
export const formatDateTimeToET = (utcDate, formatString = 'MMM D, YYYY, h:mm A') => {
  return formatDateTime(utcDate, formatString);
};

  /**
   * Format a phone number as (XXX) XXX-XXXX
   * @param {string} phone - Phone number to format
   * @returns {string} Formatted phone number
   */
  export const formatPhoneNumber = (phone) => {
    if (!phone) return '';

    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');

    // Format as (XXX) XXX-XXXX if 10 digits
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }

    // Return original if not 10 digits
    return phone;
  };

/**
 * Capitalize the first letter of each word in a string.
 * @param {string} str - The input string.
 * @returns {string} The string with the first letter of each word capitalized.
 */
export const capitalizeWords = (str) => {
  if (!str) return '';
  return str.replace(/\b\w/g, char => char.toUpperCase());
};

/**
 * Convert a Date object to a local date string for HTML date inputs (YYYY-MM-DD)
 * This avoids timezone conversion issues by working with local dates
 * @param {Date|string} date - The date to format
 * @returns {string} Date string in YYYY-MM-DD format
 */
export const formatDateForInput = (date) => {
  if (!date) return '';

  // Use parseLocalDate for string dates to avoid timezone issues
  const dateObj = typeof date === 'string' ? parseLocalDate(date) : date;

  // Use local date methods to avoid timezone conversion
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

/**
 * Get today's date as a local date string for HTML date inputs (YYYY-MM-DD)
 * @returns {string} Today's date in YYYY-MM-DD format
 */
export const getTodayForInput = () => {
  const today = new Date();
  return formatDateForInput(today);
};

/**
 * Parse a date from an HTML date input and create a Date object
 * This ensures the date is treated as a local date, not UTC
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {Date} Date object representing the local date
 */
export const parseDateFromInput = (dateString) => {
  if (!dateString) return null;

  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day); // month is 0-indexed
};

/**
 * Safe date parsing for server-side use that avoids timezone conversion issues
 * Parses YYYY-MM-DD strings as local dates instead of UTC
 * @param {string} dateString - Date string in YYYY-MM-DD format or ISO format
 * @returns {Date} Date object representing the local date
 */
export const parseLocalDate = (dateString) => {
  if (!dateString) return null;

  // If it's already a Date object, return as is
  if (dateString instanceof Date) return dateString;

  // Convert to string and trim
  const dateStr = String(dateString).trim();

  // Extract just the date portion from ISO strings (e.g., "2025-10-12T00:00:00.000Z" -> "2025-10-12")
  // This prevents timezone conversion issues with MongoDB dates
  const dateOnly = dateStr.split('T')[0];

  // Check if it's a YYYY-MM-DD format string
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    const [year, month, day] = dateOnly.split('-').map(Number);
    return new Date(year, month - 1, day); // month is 0-indexed
  }

  // Fallback to standard Date parsing for other formats
  return new Date(dateString);
};
