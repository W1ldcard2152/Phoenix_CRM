// Client-side mirror of server discount distribution math.
// Keep in sync with src/server/utils/calculationHelpers.js

const lineKey = (lineType, lineId) => `${lineType}:${lineId}`;

/**
 * Build a flat list of selectable lines with subtotals.
 * Matches the same shape used by the WorkOrder & Quote (parts/labor/servicePackages).
 * Uncommitted service packages are excluded (they wouldn't be in the invoice anyway).
 */
export const buildLineList = (parts = [], labor = [], servicePackages = []) => {
  const lines = [];
  parts.forEach(p => {
    if (!p || !p._id) return;
    const lineSub = (parseFloat(p.price) || 0) * (parseFloat(p.quantity) || 0)
      + ((p.coreChargeInvoiceable && p.coreCharge) ? parseFloat(p.coreCharge) : 0);
    lines.push({
      key: lineKey('part', p._id),
      lineType: 'part',
      lineId: p._id,
      label: p.name || p.description || 'Part',
      subtotal: lineSub
    });
  });
  labor.forEach(l => {
    if (!l || !l._id) return;
    const qty = parseFloat(l.quantity) || parseFloat(l.hours) || 0;
    lines.push({
      key: lineKey('labor', l._id),
      lineType: 'labor',
      lineId: l._id,
      label: l.description || 'Labor',
      subtotal: qty * (parseFloat(l.rate) || 0)
    });
  });
  servicePackages.forEach(s => {
    if (!s || !s._id) return;
    if (s.committed === false) return;
    lines.push({
      key: lineKey('service', s._id),
      lineType: 'service',
      lineId: s._id,
      label: s.name || 'Service',
      subtotal: parseFloat(s.price) || 0
    });
  });
  return lines;
};

/**
 * Distribute a discount across selected lines and return total dollar amount + per-line shares.
 */
export const distributeDiscount = (lines, discount) => {
  const lineDiscounts = {};
  lines.forEach(l => { lineDiscounts[l.key] = 0; });

  if (!discount || !Array.isArray(discount.appliedTo) || discount.appliedTo.length === 0) {
    return { totalDiscountAmount: 0, lineDiscounts };
  }

  const selectedKeys = new Set(discount.appliedTo.map(a => lineKey(a.lineType, a.lineId)));
  const selected = lines.filter(l => selectedKeys.has(l.key));
  const selectedSubtotal = selected.reduce((sum, l) => sum + l.subtotal, 0);

  if (selectedSubtotal <= 0) {
    return { totalDiscountAmount: 0, lineDiscounts };
  }

  let totalDiscountAmount = 0;
  if (discount.type === 'percent') {
    const pct = (parseFloat(discount.value) || 0) / 100;
    selected.forEach(l => {
      const share = l.subtotal * pct;
      lineDiscounts[l.key] = share;
      totalDiscountAmount += share;
    });
  } else {
    totalDiscountAmount = Math.min(parseFloat(discount.value) || 0, selectedSubtotal);
    selected.forEach(l => {
      lineDiscounts[l.key] = (l.subtotal / selectedSubtotal) * totalDiscountAmount;
    });
  }

  return { totalDiscountAmount, lineDiscounts };
};

/**
 * Convenience: compute discount amount only, given the source arrays.
 */
export const calculateDiscountAmount = (parts, labor, servicePackages, discount) => {
  if (!discount) return 0;
  const lines = buildLineList(parts, labor, servicePackages);
  return distributeDiscount(lines, discount).totalDiscountAmount;
};

/**
 * Returns a human-readable summary like "10% off (3 lines)" or "$25 off (1 line)".
 */
export const describeDiscount = (discount) => {
  if (!discount) return '';
  const lineCount = (discount.appliedTo || []).length;
  const lineLabel = lineCount === 1 ? '1 line' : `${lineCount} lines`;
  const valueLabel = discount.type === 'percent'
    ? `${discount.value}% off`
    : `$${(parseFloat(discount.value) || 0).toFixed(2)} off`;
  return `${valueLabel} (${lineLabel})`;
};

/**
 * Prune appliedTo refs that no longer exist in the current parts/labor/services arrays.
 * Returns a new discount object (or null if all refs orphaned).
 */
export const pruneOrphanedDiscountRefs = (discount, parts, labor, servicePackages) => {
  if (!discount || !discount.appliedTo) return discount;
  const validKeys = new Set(buildLineList(parts, labor, servicePackages).map(l => l.key));
  const cleaned = discount.appliedTo.filter(a => validKeys.has(lineKey(a.lineType, a.lineId)));
  return { ...discount, appliedTo: cleaned };
};
