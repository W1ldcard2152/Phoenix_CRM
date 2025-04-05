/**
 * Wrapper function to catch async errors in controller functions
 * Eliminates the need for try/catch blocks in each controller
 * @param {Function} fn - The async function to wrap
 * @returns {Function} Express middleware function that catches errors
 */
module.exports = fn => {
    return (req, res, next) => {
      fn(req, res, next).catch(next);
    };
  };