const mongoose = require('mongoose');
const ShopSupply = require('../models/ShopSupply');
const SupplyTag = require('../models/SupplyTag');
const SupplyVocab = require('../models/SupplyVocab');
const SupplyMovement = require('../models/SupplyMovement');
const Settings = require('../models/Settings');
const supplyTagService = require('./supplyTagService');
const escapeRegex = require('../utils/escapeRegex');
const { resolvePrice } = require('../utils/supplyPricing');
const {
  idOf,
  validateTagAssignment,
  previewBulkTagChanges
} = require('../utils/supplyRules');

/**
 * Every ShopSupply / SupplyTag / SupplyVocab query lives in this file.
 *
 * That is a deliberate structural concession, not an abstraction for its own
 * sake: this deployment is single-tenant (each shop gets its own database), so
 * nothing in the schema carries a scope key. If a shared-database tier is ever
 * offered, a scope filter needs exactly one home rather than being scattered
 * across controller bodies. Keep queries out of the controller.
 */

/**
 * The writable field allow-list, defined ONCE.
 *
 * The old inventory controller spells its allow-list out separately in
 * createItem and updateItem, so adding a field means editing two places or
 * watching it get silently dropped on one path. Not repeating that.
 */
const SUPPLY_FIELDS = [
  'name', 'brand', 'vendor', 'partNumber',
  'tags', 'primaryTag',
  'form', 'location',
  'stockUnit', 'purchaseUnit', 'unitsPerPurchase',
  'reorderPoint', 'cost', 'price', 'priceOverridden',
  'sdsUrl', 'url', 'notes', 'isActive'
];

// Quantity is set at creation and thereafter only moves through adjustQuantity,
// so that every change leaves a SupplyMovement behind.
const CREATE_ONLY_FIELDS = ['quantityOnHand'];

const VOCAB_REF_FIELDS = ['brand', 'vendor', 'form', 'location', 'stockUnit', 'purchaseUnit'];

class SupplyError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isSupplyError = true;
  }
}

const pick = (source, fields) => {
  const out = {};
  fields.forEach((f) => {
    if (source[f] !== undefined) out[f] = source[f];
  });
  return out;
};

// A cleared <select> sends '', which Mongoose would reject as a cast error on
// an ObjectId path. Treat it as "no value".
const normalizeRefs = (data) => {
  [...VOCAB_REF_FIELDS, 'primaryTag'].forEach((f) => {
    if (data[f] === undefined) return;
    data[f] = data[f] === '' || data[f] === null ? null : idOf(data[f]);
  });
  if (Array.isArray(data.tags)) data.tags = data.tags.map(idOf).filter(Boolean);
  return data;
};

const getMarkupPercentage = async () => {
  const settings = await Settings.getSettings();
  return settings.partMarkupPercentage;
};

// ───────────────────────────────── Supplies ─────────────────────────────────

/**
 * List supplies.
 *
 * `tag` walks descendants in memory — see supplyTagService for why there is no
 * closure table or $graphLookup here.
 */
const listSupplies = async (query = {}) => {
  const { tag, untagged, brand, vendor, form, location, search, active } = query;
  const filter = { isActive: active === 'false' ? false : true };

  if (untagged === 'true') {
    filter.tags = { $size: 0 };
  } else if (tag) {
    const descendantIds = await supplyTagService.getDescendantIds(tag);
    if (descendantIds.length === 0) return [];
    filter.tags = { $in: descendantIds.map((id) => new mongoose.Types.ObjectId(id)) };
  }

  if (brand) filter.brand = brand;
  if (vendor) filter.vendor = vendor;
  if (form) filter.form = form;
  if (location) filter.location = location;

  if (search) {
    // Only the string fields can be regexed. brand and vendor are refs now, so
    // they're reached by their dropdown filters instead of by free text.
    const rx = new RegExp(escapeRegex(String(search).slice(0, 100)), 'i');
    filter.$or = [{ name: rx }, { partNumber: rx }, { notes: rx }];
  }

  return ShopSupply.find(filter).sort({ name: 1 }).lean();
};

const getSupply = async (id) => ShopSupply.findById(id).lean();

const createSupply = async (body, userId) => {
  const data = normalizeRefs({
    ...pick(body, SUPPLY_FIELDS),
    ...pick(body, CREATE_ONLY_FIELDS)
  });

  const check = validateTagAssignment(data.tags, data.primaryTag);
  if (!check.ok) throw new SupplyError(check.error, 400, { code: check.code });

  data.price = resolvePrice(data, await getMarkupPercentage());

  const supply = await ShopSupply.create(data);

  if (supply.quantityOnHand > 0) {
    await SupplyMovement.create({
      supply: supply._id,
      type: 'count',
      quantity: supply.quantityOnHand,
      unit: supply.stockUnit || null,
      resultingQoh: supply.quantityOnHand,
      note: 'Opening count',
      createdBy: userId
    });
  }

  return supply.toObject();
};

/**
 * Update a supply.
 *
 * Resolves the INTENDED final tag state and validates it before issuing the
 * write, keeping the single-query shape. The model's pre('validate') hook does
 * not fire for findByIdAndUpdate — this is the actual enforcement point, not a
 * duplicate of it.
 */
const updateSupply = async (id, body) => {
  const data = normalizeRefs(pick(body, SUPPLY_FIELDS));

  const current = await ShopSupply.findById(id).lean();
  if (!current) return null;

  const nextTags = data.tags !== undefined ? data.tags : (current.tags || []);
  const nextPrimary = data.primaryTag !== undefined ? data.primaryTag : current.primaryTag;

  const check = validateTagAssignment(nextTags, nextPrimary);
  if (!check.ok) throw new SupplyError(check.error, 400, { code: check.code });

  const touchesPricing = ['cost', 'unitsPerPurchase', 'price', 'priceOverridden']
    .some((f) => data[f] !== undefined);
  if (touchesPricing) {
    data.price = resolvePrice({ ...current, ...data }, await getMarkupPercentage());
  }

  return ShopSupply.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean();
};

const deleteSupply = async (id) => ShopSupply.findByIdAndUpdate(
  id, { $set: { isActive: false } }, { new: true }
).lean();

/**
 * Move quantity and record why.
 */
const adjustQuantity = async (id, { quantity, type = 'adjust', unit, note }, userId) => {
  const delta = Number(quantity);
  if (!Number.isFinite(delta) || delta === 0) {
    throw new SupplyError('Adjustment quantity is required and cannot be zero.', 400);
  }

  const supply = await ShopSupply.findById(id);
  if (!supply) return null;

  const resultingQoh = Math.max(0, (supply.quantityOnHand || 0) + delta);

  const updated = await ShopSupply.findByIdAndUpdate(
    id, { $set: { quantityOnHand: resultingQoh } }, { new: true }
  ).lean();

  await SupplyMovement.create({
    supply: supply._id,
    type,
    quantity: delta,
    unit: unit || supply.stockUnit || null,
    resultingQoh,
    note: note || '',
    createdBy: userId
  });

  return updated;
};

const getMovements = async (id, limit = 50) => SupplyMovement.find({ supply: id })
  .sort({ createdAt: -1 })
  .limit(limit)
  .populate('createdBy', 'name displayName')
  .lean();

/**
 * Bulk edit. Preflights the entire batch; writes nothing if any item would
 * break the invariant.
 */
const bulkUpdate = async ({ ids, set = {} }) => {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new SupplyError('No items selected.', 400);
  }

  const items = await ShopSupply.find({ _id: { $in: ids } }, '_id name tags primaryTag').lean();

  const touchesTags = ['addTags', 'removeTags', 'primaryTag']
    .some((k) => Object.prototype.hasOwnProperty.call(set, k));

  const plain = {};
  if (set.location !== undefined) plain.location = set.location || null;
  if (set.vendor !== undefined) plain.vendor = set.vendor || null;

  let tagResults = [];
  if (touchesTags) {
    const { results, violations } = previewBulkTagChanges(items, set);
    if (violations.length > 0) {
      throw new SupplyError(
        `${violations.length} item${violations.length === 1 ? '' : 's'} would be left without a primary tag. Nothing was changed.`,
        400,
        { code: 'BULK_WOULD_ORPHAN_PRIMARY', violations }
      );
    }
    tagResults = results;
  }

  if (!touchesTags && Object.keys(plain).length === 0) {
    throw new SupplyError('No changes specified.', 400);
  }

  const byId = new Map(tagResults.map((r) => [r._id, r]));
  const ops = items.map((item) => {
    const tagChange = byId.get(String(item._id));
    const $set = { ...plain };
    if (tagChange) {
      $set.tags = tagChange.tags.map((t) => new mongoose.Types.ObjectId(t));
      $set.primaryTag = tagChange.primaryTag
        ? new mongoose.Types.ObjectId(tagChange.primaryTag)
        : null;
    }
    return { updateOne: { filter: { _id: item._id }, update: { $set } } };
  });

  if (ops.length === 0) return { matched: 0, modified: 0 };

  const result = await ShopSupply.bulkWrite(ops);
  return { matched: result.matchedCount, modified: result.modifiedCount };
};

const getShoppingList = async () => ShopSupply.find({
  isActive: true,
  $expr: { $lte: ['$quantityOnHand', '$reorderPoint'] }
}).sort({ name: 1 }).lean();

const countUntagged = async () => ShopSupply.countDocuments({ isActive: true, tags: { $size: 0 } });

// ─────────────────────────────────── Tags ───────────────────────────────────

const listTags = async () => supplyTagService.getFlat();

const createTag = async (body) => {
  const tag = new SupplyTag({
    name: body.name,
    slug: body.slug || String(body.name || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').trim().replace(/[\s-]+/g, '-'),
    parent: body.parent || null,
    sortOrder: body.sortOrder || 0,
    kind: body.kind || 'judgment',
    notes: body.notes || ''
  });
  await tag.save(); // .save() so the depth/cycle hook actually runs
  supplyTagService.invalidate();
  return tag.toObject();
};

const updateTag = async (id, body) => {
  const tag = await SupplyTag.findById(id);
  if (!tag) return null;

  if (body.name !== undefined) tag.name = body.name;
  if (body.sortOrder !== undefined) tag.sortOrder = body.sortOrder;
  if (body.notes !== undefined) tag.notes = body.notes;
  if (body.parent !== undefined) tag.parent = body.parent || null;

  await tag.save();
  supplyTagService.invalidate();
  return tag.toObject();
};

/**
 * Delete a tag — refused unless it is BOTH childless and unused.
 *
 * The usage count checks `primaryTag` as well as `tags`. Checking `tags` alone
 * would only be sufficient if the invariant already held everywhere, which is
 * circular reasoning: the whole point of the check is that it might not.
 */
const deleteTag = async (id) => {
  const childCount = await SupplyTag.countDocuments({ parent: id });
  if (childCount > 0) {
    throw new SupplyError(
      `That tag has ${childCount} child tag${childCount === 1 ? '' : 's'}. Move or delete them first.`,
      409,
      { code: 'TAG_HAS_CHILDREN', childCount }
    );
  }

  const usageCount = await ShopSupply.countDocuments({
    $or: [{ tags: id }, { primaryTag: id }]
  });
  if (usageCount > 0) {
    throw new SupplyError(
      `That tag is on ${usageCount} item${usageCount === 1 ? '' : 's'}. Retag them first.`,
      409,
      { code: 'TAG_IN_USE', usageCount }
    );
  }

  const deleted = await SupplyTag.findByIdAndDelete(id);
  supplyTagService.invalidate();

  // Sweep: the count-then-delete window above is not transactional. At this
  // user count a race is vanishingly unlikely, and this sweep is the control
  // rather than a transaction and the replica-set commitment it would imply.
  // If this ever logs, that assumption was wrong and §6a needs revisiting.
  const [pulled, cleared] = await Promise.all([
    ShopSupply.updateMany({ tags: id }, { $pull: { tags: id } }),
    ShopSupply.updateMany({ primaryTag: id }, { $set: { primaryTag: null } })
  ]);
  const sweptCount = Math.max(pulled.modifiedCount || 0, cleared.modifiedCount || 0);
  if (sweptCount > 0) {
    console.warn(`[supplies] Tag ${id} was attached to ${sweptCount} item(s) between the `
      + 'usage check and the delete. Swept — but this race was assumed not to happen.');
  }

  return deleted;
};

/**
 * Tag usage counts for the manager UI, so a blocked delete can say why.
 */
const getTagUsage = async () => {
  const [byTag, children] = await Promise.all([
    ShopSupply.aggregate([
      { $match: { isActive: true } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } }
    ]),
    SupplyTag.aggregate([
      { $match: { parent: { $ne: null } } },
      { $group: { _id: '$parent', count: { $sum: 1 } } }
    ])
  ]);

  const usage = {};
  byTag.forEach((r) => { usage[String(r._id)] = { items: r.count, children: 0 }; });
  children.forEach((r) => {
    const key = String(r._id);
    if (!usage[key]) usage[key] = { items: 0, children: 0 };
    usage[key].children = r.count;
  });
  return usage;
};

// ────────────────────────────────── Vocab ──────────────────────────────────

const listVocab = async () => SupplyVocab.find({}).sort({ fieldKey: 1, sortOrder: 1, label: 1 }).lean();

const createVocab = async (body) => {
  const value = String(body.value || body.label || '').trim().toLowerCase();
  if (!value) throw new SupplyError('A value is required.', 400);

  const existing = await SupplyVocab.findOne({ fieldKey: body.fieldKey, value });
  if (existing) return existing.toObject();

  const created = await SupplyVocab.create({
    fieldKey: body.fieldKey,
    value,
    label: (body.label || body.value || '').trim(),
    sortOrder: body.sortOrder || 0
  });
  return created.toObject();
};

const updateVocab = async (id, body) => {
  const update = {};
  if (body.label !== undefined) update.label = body.label;
  if (body.sortOrder !== undefined) update.sortOrder = body.sortOrder;
  if (body.isActive !== undefined) update.isActive = body.isActive;
  // `value` is intentionally not editable: it is the stable key. Renaming is a
  // label change, which is exactly what propagates to every item for free.
  return SupplyVocab.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
};

const deleteVocab = async (id) => {
  const entry = await SupplyVocab.findById(id).lean();
  if (!entry) return null;

  const inUse = await ShopSupply.countDocuments({
    $or: VOCAB_REF_FIELDS.map((f) => ({ [f]: id }))
  });
  if (inUse > 0) {
    throw new SupplyError(
      `"${entry.label || entry.value}" is used by ${inUse} item${inUse === 1 ? '' : 's'}. `
      + 'Deactivate it instead — it will stop being offered but existing items keep resolving.',
      409,
      { code: 'VOCAB_IN_USE', inUse }
    );
  }

  return SupplyVocab.findByIdAndDelete(id);
};

module.exports = {
  SupplyError,
  SUPPLY_FIELDS,
  listSupplies,
  getSupply,
  createSupply,
  updateSupply,
  deleteSupply,
  adjustQuantity,
  getMovements,
  bulkUpdate,
  getShoppingList,
  countUntagged,
  listTags,
  createTag,
  updateTag,
  deleteTag,
  getTagUsage,
  listVocab,
  createVocab,
  updateVocab,
  deleteVocab
};
