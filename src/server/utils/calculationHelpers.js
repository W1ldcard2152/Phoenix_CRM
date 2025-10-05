// Calculation helper utilities to eliminate duplicate calculation patterns
// This eliminates 16+ duplicate cost calculation patterns across controllers

/**
 * Calculate total cost of parts
 * @param {Array} parts - Array of part objects with price and quantity
 * @returns {Number} Total parts cost
 */
const calculatePartsCost = (parts = []) => {
  return parts.reduce((total, part) => {
    return total + (part.price * part.quantity);
  }, 0);
};

/**
 * Calculate total cost of labor
 * @param {Array} labor - Array of labor objects with hours and rate
 * @returns {Number} Total labor cost
 */
const calculateLaborCost = (labor = []) => {
  return labor.reduce((total, item) => {
    return total + (item.hours * item.rate);
  }, 0);
};

/**
 * Calculate total work order cost (parts + labor)
 * @param {Array} parts - Array of part objects
 * @param {Array} labor - Array of labor objects
 * @returns {Number} Total cost
 */
const calculateWorkOrderTotal = (parts = [], labor = []) => {
  return calculatePartsCost(parts) + calculateLaborCost(labor);
};

/**
 * Calculate and return breakdown of work order costs
 * @param {Object} workOrder - Work order object with parts and labor
 * @returns {Object} Object with partsCost, laborCost, and total
 */
const getWorkOrderCostBreakdown = (workOrder) => {
  const partsCost = calculatePartsCost(workOrder.parts);
  const laborCost = calculateLaborCost(workOrder.labor);
  const total = partsCost + laborCost;

  return { partsCost, laborCost, total };
};

module.exports = {
  calculatePartsCost,
  calculateLaborCost,
  calculateWorkOrderTotal,
  getWorkOrderCostBreakdown
};
