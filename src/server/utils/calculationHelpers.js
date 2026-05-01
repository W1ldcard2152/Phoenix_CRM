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
 * Build a flat list of selectable lines with subtotals, used for discount distribution
 */
const buildLineList = (parts = [], labor = [], servicePackages = []) => {
  const lines = [];
  parts.forEach(p => {
    if (!p || !p._id) return;
    const subtotal = (p.price || 0) * (p.quantity || 0)
      + ((p.coreChargeInvoiceable && p.coreCharge) ? p.coreCharge : 0);
    lines.push({ key: `part:${p._id.toString()}`, lineType: 'part', lineId: p._id.toString(), subtotal });
  });
  labor.forEach(l => {
    if (!l || !l._id) return;
    const qty = l.quantity || l.hours || 0;
    lines.push({ key: `labor:${l._id.toString()}`, lineType: 'labor', lineId: l._id.toString(), subtotal: qty * (l.rate || 0) });
  });
  servicePackages.forEach(s => {
    if (!s || !s._id) return;
    if (s.committed === false) return; // uncommitted drafts don't count
    lines.push({ key: `service:${s._id.toString()}`, lineType: 'service', lineId: s._id.toString(), subtotal: s.price || 0 });
  });
  return lines;
};

/**
 * Distribute a single discount across selected lines pro-rata by line subtotal.
 * For 'percent', each selected line gets (value%) of its own subtotal.
 * For 'fixed', the value is split across selected lines proportionally to their subtotals,
 * with the total clamped to the selected subtotal so nothing goes negative.
 *
 * @returns {Object} { totalDiscountAmount, lineDiscounts: { [key]: amount } }
 */
const distributeDiscount = (lines, discount) => {
  const lineDiscounts = {};
  lines.forEach(l => { lineDiscounts[l.key] = 0; });

  if (!discount || !discount.appliedTo || discount.appliedTo.length === 0) {
    return { totalDiscountAmount: 0, lineDiscounts };
  }

  const selectedKeys = new Set(
    discount.appliedTo.map(a => `${a.lineType}:${a.lineId.toString ? a.lineId.toString() : a.lineId}`)
  );
  const selected = lines.filter(l => selectedKeys.has(l.key));
  const selectedSubtotal = selected.reduce((sum, l) => sum + l.subtotal, 0);

  if (selectedSubtotal <= 0) {
    return { totalDiscountAmount: 0, lineDiscounts };
  }

  let totalDiscountAmount = 0;
  if (discount.type === 'percent') {
    const pct = (discount.value || 0) / 100;
    selected.forEach(l => {
      const share = l.subtotal * pct;
      lineDiscounts[l.key] = share;
      totalDiscountAmount += share;
    });
  } else {
    // fixed
    totalDiscountAmount = Math.min(discount.value || 0, selectedSubtotal);
    selected.forEach(l => {
      lineDiscounts[l.key] = (l.subtotal / selectedSubtotal) * totalDiscountAmount;
    });
  }

  return { totalDiscountAmount, lineDiscounts };
};

/**
 * Compute the total dollar amount of a discount for a work order.
 */
const calculateDiscountAmount = (parts = [], labor = [], servicePackages = [], discount = null) => {
  if (!discount) return 0;
  const lines = buildLineList(parts, labor, servicePackages);
  const { totalDiscountAmount } = distributeDiscount(lines, discount);
  return totalDiscountAmount;
};

/**
 * Calculate total work order cost (parts + labor + service packages - discount)
 * Discount is optional; clamped so total never goes below 0.
 */
const calculateWorkOrderTotal = (parts = [], labor = [], servicePackages = [], discount = null) => {
  const subtotal = calculatePartsCost(parts) + calculateLaborCost(labor) + calculateServicePackagesCost(servicePackages);
  const discountAmount = calculateDiscountAmount(parts, labor, servicePackages, discount);
  return Math.max(0, subtotal - discountAmount);
};

/**
 * Calculate and return breakdown of work order costs
 * @param {Object} workOrder - Work order object with parts, labor, and servicePackages
 * @returns {Object} Object with partsCost, laborCost, servicePackagesCost, discountAmount, and total
 */
const getWorkOrderCostBreakdown = (workOrder) => {
  const partsCost = calculatePartsCost(workOrder.parts);
  const laborCost = calculateLaborCost(workOrder.labor);
  const servicePackagesCost = calculateServicePackagesCost(workOrder.servicePackages);
  const subtotal = partsCost + laborCost + servicePackagesCost;
  const discountAmount = calculateDiscountAmount(workOrder.parts, workOrder.labor, workOrder.servicePackages, workOrder.discount);
  const total = Math.max(0, subtotal - discountAmount);

  return { partsCost, laborCost, servicePackagesCost, subtotal, discountAmount, total };
};

module.exports = {
  calculatePartsCost,
  calculateLaborCost,
  calculateServicePackagesCost,
  buildLineList,
  distributeDiscount,
  calculateDiscountAmount,
  calculateWorkOrderTotal,
  getWorkOrderCostBreakdown
};
