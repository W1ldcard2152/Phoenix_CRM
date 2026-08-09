const mongoose = require('mongoose');
const ShopSupply = require('../models/ShopSupply');
const SupplyTag = require('../models/SupplyTag');
const SupplyVocab = require('../models/SupplyVocab');
const SupplyField = require('../models/SupplyField');
const SupplyMovement = require('../models/SupplyMovement');
const Settings = require('../models/Settings');
const supplyTagService = require('./supplyTagService');
const s3Service = require('./s3Service');
const { resolvePrice } = require('../utils/supplyPricing');
const { composeDisplayName, canComposeName } = require('../utils/supplyNaming');
const {
  idOf,
  validateTagAssignment,
  previewBulkTagChanges,
  resolveFieldsForItem
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
  'name', 'qualifier', 'brand', 'vendor', 'partNumber',
  'tags', 'primaryTag',
  'form', 'location',
  'stockUnit', 'purchaseUnit', 'unitsPerPurchase',
  'reorderPoint', 'cost', 'price', 'priceOverridden',
  'sdsUrl', 'url', 'notes', 'isActive',
  'attributes'
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

/**
 * Strip attribute keys that aren't in the field registry.
 *
 * Mandatory, not defensive: `attributes` is a Map written straight into the
 * document, so an unchecked key is a client-controlled path. Whitelisting
 * against the registry also keeps the data honest — an attribute nothing
 * defines is invisible to every filter and every form, so writing one would
 * silently lose the value.
 *
 * Empty values delete the key rather than storing '' — a blank measurement is
 * an absent one, and storing it would make "has a viscosity" untrue-but-present.
 */
const sanitizeAttributes = async (attributes) => {
  if (!attributes || typeof attributes !== 'object') return undefined;

  const known = await SupplyField.find({}, 'key').lean();
  const allowed = new Set(known.map((f) => f.key));

  const clean = {};
  const rejected = [];
  Object.entries(attributes).forEach(([key, value]) => {
    const k = String(key).toLowerCase();
    if (!allowed.has(k)) { rejected.push(key); return; }
    const v = value === null || value === undefined ? '' : String(value).trim();
    if (v !== '') clean[k] = v;
  });

  if (rejected.length > 0) {
    console.warn(`[supplies] Dropped unknown attribute key(s): ${rejected.join(', ')}`);
  }

  return clean;
};

const listFields = async () => SupplyField.find({}).sort({ sortOrder: 1, label: 1 }).lean();

/**
 * Everything needed to compose display names, fetched once per request.
 * Tags come from the in-memory cache; vocab and fields are a few hundred rows.
 */
const namingContext = async () => {
  const [tags, vocab, fields] = await Promise.all([
    supplyTagService.getFlat(),
    SupplyVocab.find({}, '_id label value').lean(),
    SupplyField.find({}).lean()
  ]);

  const tagById = new Map(tags.map((t) => [String(t._id), t]));
  const vocabById = new Map(vocab.map((v) => [String(v._id), v.label || v.value]));
  const fieldById = new Map(fields.map((f) => [String(f._id), f]));

  return { tagById, vocabById, fieldById };
};

/**
 * Attach `displayName` to a supply. Derived on every read rather than stored:
 * a stored copy would need a cascade whenever a brand label or tag noun
 * changed, which is precisely the machinery the vocab-as-references design
 * exists to avoid.
 */
/**
 * Refuse a save that would leave an item with nothing to call it.
 *
 * With `name` optional, an item carrying no name, no brand, no part number and
 * no primary tag has no way to render — it would appear as "Untitled supply"
 * and be effectively unfindable. Catching it at the boundary beats discovering
 * it in the list.
 */
const assertNameable = async (data, ctx) => {
  const primaryTag = data.primaryTag ? ctx.tagById.get(String(data.primaryTag)) : null;
  const brandLabel = data.brand ? ctx.vocabById.get(String(data.brand)) : '';

  if (!canComposeName(data, { brandLabel, primaryTag })) {
    throw new SupplyError(
      'This needs something to be called: a name, or enough of a brand, part number and tag to build one from.',
      400,
      { code: 'NOT_NAMEABLE' }
    );
  }
};

const decorate = (supply, ctx) => {
  if (!supply) return supply;

  const primaryTag = supply.primaryTag ? ctx.tagById.get(String(supply.primaryTag)) : null;

  // Only the fields the primary tag actually contributes belong in the name —
  // a secondary tag's measurements describe the item's other door, not its
  // identity.
  const fieldIds = [];
  let node = primaryTag;
  const seen = new Set();
  while (node) {
    (node.fields || []).forEach((f) => fieldIds.push(String(f)));
    const parentId = node.parent ? String(node.parent) : null;
    if (!parentId || seen.has(parentId)) break;
    seen.add(parentId);
    node = ctx.tagById.get(parentId);
  }

  const fields = fieldIds.map((id) => ctx.fieldById.get(id)).filter(Boolean);

  return {
    ...supply,
    displayName: composeDisplayName(supply, {
      brandLabel: supply.brand ? ctx.vocabById.get(String(supply.brand)) : '',
      primaryTag,
      fields
    })
  };
};

// ───────────────────────────────── Supplies ─────────────────────────────────

/**
 * List supplies.
 *
 * `tag` walks descendants in memory — see supplyTagService for why there is no
 * closure table or $graphLookup here.
 */
const listSupplies = async (query = {}) => {
  const { tag, untagged, brand, vendor, form, location, search, active, attr } = query;
  const filter = { isActive: active === 'false' ? false : true };

  // attr[viscosity]=5W-30 — keys whitelisted against the registry so a crafted
  // key can't address an arbitrary document path.
  if (attr && typeof attr === 'object') {
    const known = await SupplyField.find({}, 'key').lean();
    const allowed = new Set(known.map((f) => f.key));
    Object.entries(attr).forEach(([key, value]) => {
      const k = String(key).toLowerCase();
      if (!allowed.has(k) || value === '' || value === undefined) return;
      filter[`attributes.${k}`] = String(value);
    });
  }

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

  const rows = await ShopSupply.find(filter).lean();

  const ctx = await namingContext();
  let decorated = rows.map((r) => decorate(r, ctx));

  // Search runs against the COMPOSED name, in memory.
  //
  // It has to: the name a user sees and would search for ("mobil 5w-30") exists
  // in no single column — brand is a ref, viscosity is a Map entry, the noun
  // lives on the tag. A Mongo regex can only see the fragments. Phase 1 has no
  // server-side pagination, so the full filtered set is already in hand; if that
  // ever changes, this needs a denormalized search key and the cascade that
  // implies.
  if (search) {
    const needle = String(search).slice(0, 100).toLowerCase().trim();
    decorated = decorated.filter((s) => {
      const hay = [
        s.displayName, s.name, s.qualifier, s.partNumber, s.notes
      ].filter(Boolean).join(' ').toLowerCase();
      // Every whitespace-separated term must appear, so "mobil 5w-30" narrows
      // rather than returning everything matching either word.
      return needle.split(/\s+/).every((term) => hay.includes(term));
    });
  }

  return decorated.sort((a, b) => a.displayName.localeCompare(b.displayName));
};

const getSupply = async (id) => {
  const supply = await ShopSupply.findById(id).lean();
  if (!supply) return null;
  return decorate(supply, await namingContext());
};

const createSupply = async (body, userId) => {
  const data = normalizeRefs({
    ...pick(body, SUPPLY_FIELDS),
    ...pick(body, CREATE_ONLY_FIELDS)
  });

  const check = validateTagAssignment(data.tags, data.primaryTag);
  if (!check.ok) throw new SupplyError(check.error, 400, { code: check.code });

  if (data.attributes !== undefined) {
    data.attributes = await sanitizeAttributes(data.attributes);
  }

  const ctx = await namingContext();
  await assertNameable(data, ctx);

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

  return decorate(supply.toObject(), ctx);
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

  if (data.attributes !== undefined) {
    // Whole-map replace, not a merge: the form always submits the full set for
    // the item's current fields, and a merge would strand the value of a field
    // that stopped applying when the primary tag changed.
    data.attributes = await sanitizeAttributes(data.attributes);
  }

  const touchesPricing = ['cost', 'unitsPerPurchase', 'price', 'priceOverridden']
    .some((f) => data[f] !== undefined);
  if (touchesPricing) {
    data.price = resolvePrice({ ...current, ...data }, await getMarkupPercentage());
  }

  // Validate against the RESULTING item — clearing the name is fine if a brand
  // and tag remain, and not fine if they don't.
  const ctx = await namingContext();
  await assertNameable({ ...current, ...data }, ctx);

  const updated = await ShopSupply.findByIdAndUpdate(
    id, { $set: data }, { new: true, runValidators: true }
  ).lean();

  return decorate(updated, ctx);
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

  const updated = decorate(
    await ShopSupply.findByIdAndUpdate(
      id, { $set: { quantityOnHand: resultingQoh } }, { new: true }
    ).lean(),
    await namingContext()
  );

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

/**
 * Attach (or replace) an item photo.
 *
 * The S3 key never comes from the client — it is minted here from the uploaded
 * buffer. `photoKey` is deliberately not in SUPPLY_FIELDS for the same reason:
 * a client-settable key would turn the photo stream route into a way to read
 * any object in the bucket.
 */
const setPhoto = async (id, file) => {
  const supply = await ShopSupply.findById(id).lean();
  if (!supply) return null;

  const upload = await s3Service.uploadFile(file.buffer, file.originalname || 'supply.png', file.mimetype);
  if (!upload.key) {
    throw new SupplyError('Photo storage is not configured on this server.', 500);
  }

  const updated = await ShopSupply.findByIdAndUpdate(
    id,
    { $set: { photoKey: upload.key, photoUpdatedAt: new Date() } },
    { new: true }
  ).lean();

  // Best-effort cleanup of the replaced object; a leaked S3 object is a far
  // smaller problem than failing the user's upload after it already succeeded.
  if (supply.photoKey && supply.photoKey !== upload.key) {
    try { await s3Service.deleteFile(supply.photoKey); } catch (err) {
      console.error('[supplies] Failed to delete replaced photo:', err.message);
    }
  }

  return updated;
};

const clearPhoto = async (id) => {
  const supply = await ShopSupply.findById(id).lean();
  if (!supply) return null;

  const updated = await ShopSupply.findByIdAndUpdate(
    id,
    { $set: { photoKey: null, photoUpdatedAt: null } },
    { new: true }
  ).lean();

  if (supply.photoKey) {
    try { await s3Service.deleteFile(supply.photoKey); } catch (err) {
      console.error('[supplies] Failed to delete photo object:', err.message);
    }
  }

  return updated;
};

const getPhotoStream = async (id) => {
  const supply = await ShopSupply.findById(id, 'photoKey').lean();
  if (!supply || !supply.photoKey) return null;
  return s3Service.getFileStream(supply.photoKey);
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

  // Full documents, then decorated: a violation message has to name the
  // offending items, and with `name` optional most items have no single column
  // that identifies them.
  const ctx = await namingContext();
  const items = (await ShopSupply.find({ _id: { $in: ids } }).lean())
    .map((r) => {
      const d = decorate(r, ctx);
      return { ...d, name: d.displayName };
    });

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

const getShoppingList = async () => {
  const rows = await ShopSupply.find({
    isActive: true,
    $expr: { $lte: ['$quantityOnHand', '$reorderPoint'] }
  }).lean();

  const ctx = await namingContext();
  return rows
    .map((r) => decorate(r, ctx))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
};

const countUntagged = async () => ShopSupply.countDocuments({ isActive: true, tags: { $size: 0 } });

// ─────────────────────────── Label extraction ───────────────────────────────

/** Human-readable path for a tag, for the prompt's category list. */
const tagPathOf = (tag, tagById) => {
  const names = [tag.name];
  const seen = new Set([String(tag._id)]);
  let node = tag;
  while (node && node.parent) {
    const pid = String(node.parent);
    if (seen.has(pid)) break;
    seen.add(pid);
    node = tagById.get(pid);
    if (!node) break;
    names.unshift(node.name);
  }
  return names.join(' > ');
};

/**
 * Read a product label into a draft supply.
 *
 * Everything the model returns is treated as a SUGGESTION and validated against
 * the real vocabulary before it reaches the client. Language models invent
 * plausible identifiers — a slug that looks right but matches nothing, a
 * measurement key that doesn't exist — and an invented value that silently
 * became real data would be exactly the "looks finished from every angle"
 * failure the tagging rule warns about.
 *
 * The suggested tag is returned SEPARATELY from the draft, never merged into
 * it. The client renders it as unconfirmed; if the user saves without accepting
 * it, the item lands untagged and shows up in Untagged (N) — the same safe
 * default as if the AI had never run.
 */
const extractFromLabel = async (file) => {
  const aiService = require('./aiService');

  const [tags, fields, vocab] = await Promise.all([
    supplyTagService.getFlat(),
    listFields(),
    SupplyVocab.find({}).lean()
  ]);

  const tagById = new Map(tags.map((t) => [String(t._id), t]));
  const childCount = new Map();
  tags.forEach((t) => {
    if (!t.parent) return;
    const k = String(t.parent);
    childCount.set(k, (childCount.get(k) || 0) + 1);
  });

  // Offer only leaf nodes as categories. Tagging at the deepest confident node
  // is the house rule, and offering interior nodes invites the model to take
  // the safe-looking shallow option every time.
  const leafTags = tags
    .filter((t) => !childCount.get(String(t._id)))
    .map((t) => ({ slug: t.slug, path: tagPathOf(t, tagById) }));

  const raw = await aiService.parseSupplyLabel(file.buffer, file.mimetype, {
    tags: leafTags,
    fields: fields.map((f) => ({
      key: f.key, label: f.label, type: f.type, options: f.options, unit: f.unit
    }))
  });

  // ── Validate the tag suggestion ──
  const tagBySlug = new Map(tags.map((t) => [t.slug, t]));
  const suggestedTag = raw.tagSlug ? tagBySlug.get(raw.tagSlug) || null : null;
  const rejected = [];
  if (raw.tagSlug && !suggestedTag) rejected.push(`category "${raw.tagSlug}"`);

  // ── Validate attributes: known key, applicable to the tag, allowed value ──
  const fieldByKey = new Map(fields.map((f) => [f.key, f]));
  const applicable = suggestedTag
    ? new Set(resolveFieldsForItem(
      { tags: [suggestedTag._id], primaryTag: suggestedTag._id }, tagById
    ).all)
    : new Set();

  const attributes = {};
  Object.entries(raw.attributes || {}).forEach(([key, value]) => {
    const k = String(key).toLowerCase();
    const field = fieldByKey.get(k);
    if (!field) { rejected.push(`measurement "${key}"`); return; }
    if (suggestedTag && !applicable.has(String(field._id))) {
      rejected.push(`${field.label} (doesn't apply to that category)`);
      return;
    }
    const v = String(value === null || value === undefined ? '' : value).trim();
    if (!v) return;

    if (field.type === 'select') {
      // Snap to the canonical option so "5w-30" becomes "5W-30" — otherwise the
      // dropdown can't display it and the value can't be filtered on.
      const match = (field.options || []).find((o) => o.toLowerCase() === v.toLowerCase());
      if (!match) { rejected.push(`${field.label} "${v}"`); return; }
      attributes[k] = match;
    } else {
      attributes[k] = v;
    }
  });

  // ── Map form and package unit onto existing vocab; never invent entries ──
  const vocabMatch = (fieldKey, value) => {
    if (!value) return null;
    const entry = vocab.find((e) => e.fieldKey === fieldKey
      && ((e.value || '').toLowerCase() === value.toLowerCase()
        || (e.label || '').toLowerCase() === value.toLowerCase()));
    return entry ? String(entry._id) : null;
  };

  const brandMatch = vocabMatch('brand', raw.brand);
  const draft = {
    brand: brandMatch,
    // Carried through so the client can offer to create the vocab entry rather
    // than silently dropping a brand the shop hasn't stocked before.
    brandSuggestion: brandMatch ? null : (raw.brand || ''),
    partNumber: raw.partNumber,
    qualifier: raw.qualifier,
    attributes,
    form: vocabMatch('form', raw.form),
    purchaseUnit: vocabMatch('unit', raw.packageUnit),
    unitsPerPurchase: raw.packageQuantity && raw.packageQuantity > 0 ? raw.packageQuantity : 1
  };

  return {
    draft,
    productType: raw.productType,
    suggestedTag: suggestedTag
      ? {
        _id: String(suggestedTag._id),
        slug: suggestedTag.slug,
        name: suggestedTag.name,
        path: tagPathOf(suggestedTag, tagById),
        confidence: raw.confidence
      }
      : null,
    rejected
  };
};

/**
 * Existing supplies that might already be this product.
 *
 * Done locally rather than with a second AI call: it runs once per photo in a
 * bulk import, and brand + part number is a decisive comparison that doesn't
 * need a language model. Composes [brand, partNumber] at compare time rather
 * than assuming a joined string — the old inventory stored the brand INSIDE
 * partNumber, and matching against supplies must not inherit that.
 */
const findSimilar = async (draft, productType) => {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const partKey = norm(draft.partNumber);
  if (!partKey && !productType) return [];

  const ctx = await namingContext();
  const rows = await ShopSupply.find({ isActive: true }).lean();

  return rows
    .map((r) => {
      const decorated = decorate(r, ctx);
      let score = 0;
      let reason = '';

      if (partKey && norm(r.partNumber) === partKey) {
        score = draft.brand && String(r.brand) === String(draft.brand) ? 100 : 80;
        reason = 'same part number';
      } else if (productType && decorated.displayName.toLowerCase().includes(productType.toLowerCase())
        && draft.brand && String(r.brand) === String(draft.brand)) {
        score = 50;
        reason = 'same brand and product type';
      }

      return score > 0 ? { ...decorated, matchScore: score, matchReason: reason } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 3);
};

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
  setPhoto,
  clearPhoto,
  getPhotoStream,
  getMovements,
  bulkUpdate,
  getShoppingList,
  countUntagged,
  listFields,
  extractFromLabel,
  findSimilar,
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
