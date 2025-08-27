/**
 * Safe date parsing that avoids timezone conversion issues
 * Parses YYYY-MM-DD strings as local dates instead of UTC
 * @param {string|Date} dateInput - Date string in YYYY-MM-DD format or Date object
 * @returns {Date} Date object representing the local date
 */
const parseLocalDate = (dateInput) => {
  if (!dateInput) return null;
  
  // If it's already a Date object, return as is
  if (dateInput instanceof Date) return dateInput;
  
  // Check if it's a YYYY-MM-DD format string
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    const [year, month, day] = dateInput.trim().split('-').map(Number);
    return new Date(year, month - 1, day); // month is 0-indexed
  }
  
  // Fallback to standard Date parsing for other formats
  return new Date(dateInput);
};

module.exports = {
  parseLocalDate
};