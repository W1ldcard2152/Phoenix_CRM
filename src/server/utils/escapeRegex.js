/**
 * Escape special regex characters so user-supplied input can be used safely in
 * a regular expression / Mongo `$regex` query without ReDoS or NoSQL-injection
 * risk. Pair with a length cap on the raw input for defense in depth.
 *
 * @param {string} str - The string to escape
 * @returns {string} - The escaped string (non-strings coerced to '')
 */
const escapeRegex = (str) => {
  if (typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

module.exports = escapeRegex;
