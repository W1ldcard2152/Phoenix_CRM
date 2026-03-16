// Calculation helper utilities to eliminate duplicate calculation patterns
// This eliminates 16+ duplicate cost calculation patterns across controllers

/**
 * Calculate total cost of parts
 * @param {Array} parts - Array of part objects with price and quantity
 * @returns {Number} Total parts cost
 */
const calculatePartsCost = (parts = []) => {
  return parts.reduce((total, part) => {
    const partTotal = part.price * part.quantity;
    const coreTotal = (part.coreChargeInvoiceable && part.coreCharge) ? part.coreCharge : 0;
    return total + partTotal + coreTotal;
  }, 0);
};

/**
 * Calculate total cost of labor
 * @param {Array} labor - Array of labor objects with quantity/hours and rate
 * @returns {Number} Total labor cost
 */
const calculateLaborCost = (labor = []) => {
  return labor.reduce((total, item) => {
    // Support both new quantity field and legacy hours field
    const qty = item.quantity || item.hours || 0;
    return total + (qty * item.rate);
  }, 0);
};

/**
 * Calculate total cost of service packages
 * @param {Array} servicePackages - Array of service package line objects with price
 * @returns {Number} Total service packages cost
 */
const calculateServicePackagesCost = (servicePackages = []) => {
  return servicePackages.reduce((total, pkg) => total + (pkg.price || 0), 0);
};

/**
 * Calculate total work order cost (parts + labor + service packages)
 * @param {Array} parts - Array of part objects
 * @param {Array} labor - Array of labor objects
 * @param {Array} servicePackages - Array of service package objects
 * @returns {Number} Total cost
 */
const calculateWorkOrderTotal = (parts = [], labor = [], servicePackages = []) => {
  return calculatePartsCost(parts) + calculateLaborCost(labor) + calculateServicePackagesCost(servicePackages);
};

/**
 * Calculate and return breakdown of work order costs
 * @param {Object} workOrder - Work order object with parts, labor, and servicePackages
 * @returns {Object} Object with partsCost, laborCost, servicePackagesCost, and total
 */
const getWorkOrderCostBreakdown = (workOrder) => {
  const partsCost = calculatePartsCost(workOrder.parts);
  const laborCost = calculateLaborCost(workOrder.labor);
  const servicePackagesCost = calculateServicePackagesCost(workOrder.servicePackages);
  const total = partsCost + laborCost + servicePackagesCost;

  return { partsCost, laborCost, servicePackagesCost, total };
};

module.exports = {
  calculatePartsCost,
  calculateLaborCost,
  calculateServicePackagesCost,
  calculateWorkOrderTotal,
  getWorkOrderCostBreakdown
};
