// Job grouping helpers
//
// Customer-facing documents (quotes, work orders, invoices) are presented "by job"
// rather than by charge type. A job is one of:
//   - a Service Requested entry (services[]) with its assigned packages, parts + labor
//   - a committed service package with no job (added before packages became jobs)
//   - the "General Services" bucket for lines with no/unresolved service assignment
//
// These helpers turn the raw data into an ordered list of job groups for rendering.

export const GENERAL_JOB_NAME = 'General Services';

const idStr = (v) => (v === null || v === undefined ? null : v.toString());

export const partLineTotal = (p) => {
  const unit = (p.price != null ? p.price : p.unitPrice) || 0;
  const qty = p.quantity != null ? p.quantity : 1;
  const core = (p.coreChargeInvoiceable && p.coreCharge) ? p.coreCharge : 0;
  return unit * qty + core;
};

export const laborLineTotal = (l) => {
  const qty = (l.quantity != null ? l.quantity : l.hours) || 0;
  const rate = (l.rate != null ? l.rate : l.unitPrice) || 0;
  return qty * rate;
};

const sumLines = (parts, labor, packages = []) =>
  parts.reduce((s, p) => s + partLineTotal(p), 0) +
  labor.reduce((s, l) => s + laborLineTotal(l), 0) +
  packages.reduce((s, pkg) => s + (pkg.price || 0), 0);

/**
 * Group live work-order/quote data by job.
 * @param {{services?: Array, parts?: Array, labor?: Array, servicePackages?: Array}} data
 * @returns {Array<{key, name, type, parts, labor, servicePackages, total}>}
 */
export const groupLinesByJob = ({ services = [], parts = [], labor = [], servicePackages = [] } = {}) => {
  const groups = [];

  const validServices = services.filter((s) => s && s._id);
  const serviceIds = new Set(validServices.map((s) => idStr(s._id)));
  // Unassigned = no serviceId or a serviceId that no longer resolves.
  const isUnassigned = (line) => !line.serviceId || !serviceIds.has(idStr(line.serviceId));
  const firstServiceId = validServices.length > 0 ? idStr(validServices[0]._id) : null;
  const committedPackages = servicePackages.filter((pkg) => pkg && pkg.committed !== false);

  // 1. Service-based jobs, in services[] order. Skip services with no assigned lines.
  //    The FIRST service also absorbs all unassigned parts/labor ("unassigned → Job 1").
  validServices.forEach((svc, idx) => {
    const sid = idStr(svc._id);
    const belongs = (line) => idStr(line.serviceId) === sid || (idx === 0 && isUnassigned(line));
    const gPackages = committedPackages.filter((pkg) => idStr(pkg.serviceId) === sid);
    const gParts = parts.filter(belongs);
    const gLabor = labor.filter(belongs);
    if (gPackages.length === 0 && gParts.length === 0 && gLabor.length === 0) return;
    groups.push({
      key: sid,
      name: svc.description,
      type: 'service',
      parts: gParts,
      labor: gLabor,
      servicePackages: gPackages,
      total: sumLines(gParts, gLabor, gPackages),
    });
  });

  // 2. Packages with no job (added before packages became jobs) — each its own job.
  committedPackages
    .filter(isUnassigned)
    .forEach((pkg) => {
      groups.push({
        key: idStr(pkg._id) || `pkg-${groups.length}`,
        name: pkg.name,
        type: 'package',
        parts: [],
        labor: [],
        servicePackages: [pkg],
        total: pkg.price || 0,
      });
    });

  // 3. General bucket — only when there are no services at all to absorb unassigned lines.
  if (!firstServiceId) {
    const gParts = parts.filter(isUnassigned);
    const gLabor = labor.filter(isUnassigned);
    if (gParts.length > 0 || gLabor.length > 0) {
      groups.push({
        key: 'general',
        name: GENERAL_JOB_NAME,
        type: 'general',
        parts: gParts,
        labor: gLabor,
        servicePackages: [],
        total: sumLines(gParts, gLabor),
      });
    }
  }

  return groups;
};

/**
 * Group a saved invoice's items[] by their denormalized jobName, preserving
 * first-appearance order. Items were stored in job order at issue time.
 * @param {Array} items invoice items with { jobName, type, total, ... }
 * @returns {Array<{name, items, total}>}
 */
export const groupInvoiceItemsByJob = (items = []) => {
  const order = [];
  const map = new Map();
  items.forEach((item) => {
    const name = (item.jobName && item.jobName.trim()) ? item.jobName : GENERAL_JOB_NAME;
    if (!map.has(name)) {
      map.set(name, { name, items: [], total: 0 });
      order.push(name);
    }
    const g = map.get(name);
    g.items.push(item);
    g.total += item.total || 0;
  });
  return order.map((name) => map.get(name));
};

// ---- Normalizers ----
// Both produce the shape consumed by <JobGroups /> and the PDF renderer:
//   { key, name, total, packages: [...], parts: [...], labor: [...] }

const normPackage = (pkg, i) => ({
  key: pkg._id || `pkg-${i}`,
  name: pkg.name || pkg.description || '',
  price: (pkg.price != null ? pkg.price : pkg.total) || 0,
  includedItems: pkg.includedItems || [],
});

const normPart = (p, i) => ({
  key: p._id || `part-${i}`,
  description: p.name || p.description || '',
  partNumber: p.partNumber || '',
  quantity: p.quantity != null ? p.quantity : 1,
  unitPrice: (p.price != null ? p.price : p.unitPrice) || 0,
  lineTotal: p.lineTotal != null ? p.lineTotal : partLineTotal(p),
  warranty: p.warranty || '',
  coreCharge: p.coreCharge || 0,
  coreChargeInvoiceable: !!p.coreChargeInvoiceable,
});

const normLabor = (l, i) => ({
  key: l._id || `labor-${i}`,
  description: l.description || '',
  quantity: (l.quantity != null ? l.quantity : l.hours) || 0,
  rate: (l.rate != null ? l.rate : l.unitPrice) || 0,
  billingType: l.billingType || 'hourly',
  lineTotal: l.lineTotal != null ? l.lineTotal : laborLineTotal(l),
});

// From live work-order/quote data (parts/labor carry serviceId).
export const normalizeLiveGroups = (data) =>
  groupLinesByJob(data).map((g) => ({
    key: g.key,
    name: g.name,
    total: g.total,
    packages: g.servicePackages.map(normPackage),
    parts: g.parts.map(normPart),
    labor: g.labor.map(normLabor),
  }));

// From a saved invoice's items[] (carry denormalized jobName + type).
export const normalizeInvoiceGroups = (items) =>
  groupInvoiceItemsByJob(items).map((g, gi) => {
    const parts = g.items.filter((i) => i.type === 'Part');
    const labor = g.items.filter((i) => i.type === 'Labor');
    const services = g.items.filter((i) => i.type === 'Service');
    return {
      key: `${g.name}-${gi}`,
      name: g.name,
      total: g.total,
      packages: services.map(normPackage),
      parts: parts.map((p, i) => normPart({ ...p, lineTotal: p.total }, i)),
      labor: labor.map((l, i) => normLabor({ ...l, rate: l.unitPrice, lineTotal: l.total }, i)),
    };
  });
