// src/utils/formatters.js
import moment from 'moment-timezone';

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
   * Format a date to a locale string
   * @param {string|Date} date - The date to format
   * @param {Object} options - Intl.DateTimeFormat options
   * @param {string} locale - Locale (default: en-US)
   * @returns {string} Formatted date string
   */
  export const formatDate = (date, options = {}, locale = 'en-US') => {
    if (!date) return '';
    
    const defaultOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat(locale, { ...defaultOptions, ...options }).format(dateObj);
  };

/**
 * Format a UTC date string or Date object to a specified format in America/New_York timezone.
 * @param {string|Date} utcDate - The UTC date to format.
 * @param {string} formatString - The moment.js format string.
 * @returns {string} Formatted date-time string in ET.
 */
export const formatDateTimeToET = (utcDate, formatString = 'MMM D, YYYY, h:mm A') => {
  if (!utcDate) return '';
  return moment.utc(utcDate).tz('America/New_York').format(formatString);
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
