// Job grouping helpers
//
// Customer-facing documents (quotes, work orders, invoices) are presented "by job"
// rather than by charge type. A job is one of:
//   - a Service Requested entry (services[]) with its assigned parts + labor
//   - a committed service package (its own job, flat price + included items)
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

const sumLines = (parts, labor) =>
  parts.reduce((s, p) => s + partLineTotal(p), 0) +
  labor.reduce((s, l) => s + laborLineTotal(l), 0);

/**
 * Group live work-order/quote data by job.
 * @param {{services?: Array, parts?: Array, labor?: Array, servicePackages?: Array}} data
 * @returns {Array<{key, name, type, parts, labor, servicePackage, total}>}
 */
export const groupLinesByJob = ({ services = [], parts = [], labor = [], servicePackages = [] } = {}) => {
  const groups = [];

  const validServices = services.filter((s) => s && s._id);
  const serviceIds = new Set(validServices.map((s) => idStr(s._id)));
  // Unassigned = no serviceId or a serviceId that no longer resolves.
  const isUnassigned = (line) => !line.serviceId || !serviceIds.has(idStr(line.serviceId));
  const firstServiceId = validServices.length > 0 ? idStr(validServices[0]._id) : null;

  // 1. Service-based jobs, in services[] order. Skip services with no assigned lines.
  //    The FIRST service also absorbs all unassigned lines ("unassigned → Job 1").
  validServices.forEach((svc, idx) => {
    const sid = idStr(svc._id);
    const belongs = (line) => idStr(line.serviceId) === sid || (idx === 0 && isUnassigned(line));
    const gParts = parts.filter(belongs);
    const gLabor = labor.filter(belongs);
    if (gParts.length === 0 && gLabor.length === 0) return;
    groups.push({
      key: sid,
      name: svc.description,
      type: 'service',
      parts: gParts,
      labor: gLabor,
      servicePackage: null,
      total: sumLines(gParts, gLabor),
    });
  });

  // 2. Service packages — each committed package is its own job.
  servicePackages
    .filter((pkg) => pkg && pkg.committed !== false)
    .forEach((pkg) => {
      groups.push({
        key: idStr(pkg._id) || `pkg-${groups.length}`,
        name: pkg.name,
        type: 'package',
        parts: [],
        labor: [],
        servicePackage: pkg,
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
        servicePackage: null,
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

/**
 * Customer-facing notes filed against a job print inside that job's block; only
 * work-order-level notes fall through to the document's bottom Notes block. A
 * note whose serviceId no longer resolves counts as work-order-level, so a
 * removed job never hides a note the customer was meant to see.
 * @param {Array} notes customer-facing notes with { serviceId, serviceName, content }
 * @param {Array} services the document's services[]
 * @returns {{byServiceId: Map<string, Array>, documentLevel: Array}}
 */
export const splitNotesByJob = (notes = [], services = []) => {
  const serviceIds = new Set(
    services.filter((s) => s && s._id).map((s) => idStr(s._id))
  );
  const byServiceId = new Map();
  const documentLevel = [];
  notes.forEach((note) => {
    const sid = note.serviceId ? idStr(note.serviceId) : null;
    if (sid && serviceIds.has(sid)) {
      if (!byServiceId.has(sid)) byServiceId.set(sid, []);
      byServiceId.get(sid).push(note);
    } else {
      documentLevel.push(note);
    }
  });
  return { byServiceId, documentLevel };
};

/**
 * Same split for a saved invoice, which has no live services[] — its notes are
 * matched to job groups by the denormalized serviceName captured at write time.
 * @param {Array} notes customer-facing notes
 * @param {Array<string>} jobNames the invoice's job group names
 */
export const splitNotesByJobName = (notes = [], jobNames = []) => {
  const known = new Set(jobNames);
  const byName = new Map();
  const documentLevel = [];
  notes.forEach((note) => {
    const name = note.serviceName;
    if (name && known.has(name)) {
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(note);
    } else {
      documentLevel.push(note);
    }
  });
  return { byName, documentLevel };
};

/**
 * The notes a document must print in its own Notes section: everything not
 * already shown inside a rendered job block. Derived from the groups rather than
 * from serviceId, because a job with a note but no parts or labor is skipped by
 * the grouping entirely — its note belongs at document level, not nowhere.
 * @param {Array} notes customer-facing notes
 * @param {Array} groups the normalized groups actually being rendered
 */
export const notesNotShownInGroups = (notes = [], groups = []) => {
  const shown = new Set(
    groups.flatMap((g) => (g.notes || []).map((n) => n && n._id)).filter(Boolean)
  );
  return notes.filter((n) => !(n && n._id && shown.has(n._id)));
};

// ---- Normalizers ----
// Both produce the shape consumed by <JobGroups /> and the PDF renderer:
//   { key, name, total, pkg|null, parts: [...], labor: [...] }

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
// `customerFacingNotes` on the data are distributed to the job they were filed
// under; the caller keeps the leftovers for the document's Notes block.
export const normalizeLiveGroups = (data) => {
  const { byServiceId } = splitNotesByJob(
    data?.customerFacingNotes || [],
    data?.services || []
  );
  return groupLinesByJob(data).map((g) => ({
    key: g.key,
    name: g.name,
    total: g.total,
    pkg: g.servicePackage
      ? { includedItems: g.servicePackage.includedItems || [], price: g.servicePackage.price || 0 }
      : null,
    parts: g.parts.map(normPart),
    labor: g.labor.map(normLabor),
    notes: byServiceId.get(g.key) || [],
  }));
};

// From a saved invoice's items[] (carry denormalized jobName + type).
export const normalizeInvoiceGroups = (items, customerFacingNotes = []) => {
  const grouped = groupInvoiceItemsByJob(items);
  const { byName } = splitNotesByJobName(customerFacingNotes, grouped.map((g) => g.name));
  return grouped.map((g, gi) => {
    const parts = g.items.filter((i) => i.type === 'Part');
    const labor = g.items.filter((i) => i.type === 'Labor');
    const services = g.items.filter((i) => i.type === 'Service');
    const pkg = (services.length > 0 && parts.length === 0 && labor.length === 0)
      ? {
          includedItems: services[0].includedItems || [],
          price: services.reduce((s, i) => s + (i.total || 0), 0),
        }
      : null;
    return {
      key: `${g.name}-${gi}`,
      name: g.name,
      total: g.total,
      pkg,
      parts: parts.map((p, i) => normPart({ ...p, lineTotal: p.total }, i)),
      labor: labor.map((l, i) => normLabor({ ...l, rate: l.unitPrice, lineTotal: l.total }, i)),
      notes: byName.get(g.name) || [],
    };
  });
};
