const SupplyCount = require('../models/SupplyCount');
const SupplyCountScope = require('../models/SupplyCountScope');
const ShopSupply = require('../models/ShopSupply');
const supplyService = require('./supplyService');
const {
  resolveCountEntry, resolveCountLine, summarizeCount, countProgress, isCounted
} = require('../utils/countRules');

/**
 * Cycle counts.
 *
 * Sits on top of supplyService rather than beside it: a count's scope is
 * expressed in exactly the filter language listSupplies already speaks, so
 * resolving a scope IS a call to listSupplies. A second selection query here
 * would drift from the one the supply list uses, and the two would eventually
 * disagree about what "all Valvoline" means.
 *
 * Posting likewise goes through supplyService.adjustQuantity, so every
 * correction lands in the movement ledger by the same path as every other
 * quantity change. There is no privileged write to quantityOnHand in this file.
 */

class CountError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isSupplyError = true; // reuses the controller's structured error handler
  }
}

const asList = (v) => {
  if (v === undefined || v === null || v === '') return [];
  return (Array.isArray(v) ? v : [v]).filter((x) => x !== undefined && x !== null && x !== '');
};

/**
 * `attributes` arrives as a plain object from a request body and as a Mongoose
 * Map from a stored scope. Object.entries on a Map yields NOTHING rather than
 * failing, so a Map slipping through here would silently drop every
 * measurement filter from a re-run saved scope. Normalized in one place.
 */
const attributesOf = (scope = {}) => (scope.attributes instanceof Map
  ? Object.fromEntries(scope.attributes)
  : (scope.attributes || {}));

/** Turn a stored scope into listSupplies query params. */
const scopeToQuery = (scope = {}) => {
  const query = {};
  ['tag', 'brand', 'vendor', 'form', 'location', 'locationPrefix'].forEach((key) => {
    const list = asList(scope[key]).map(String);
    if (list.length > 0) query[key] = list;
  });

  const attr = {};
  Object.entries(attributesOf(scope)).forEach(([key, value]) => {
    const list = asList(value).map(String);
    if (list.length > 0) attr[key] = list;
  });
  if (Object.keys(attr).length > 0) query.attr = attr;

  return query;
};

/** Sanitize an incoming scope down to the fields the schema knows. */
const normalizeScope = (scope = {}) => ({
  tag: asList(scope.tag).map(String),
  brand: asList(scope.brand).map(String),
  vendor: asList(scope.vendor).map(String),
  form: asList(scope.form).map(String),
  location: asList(scope.location).map(String),
  locationPrefix: asList(scope.locationPrefix).map((p) => String(p).trim()).filter(Boolean),
  attributes: Object.fromEntries(
    Object.entries(attributesOf(scope))
      .map(([k, v]) => [String(k).toLowerCase(), asList(v).map(String)])
      .filter(([, v]) => v.length > 0)
  )
});

/** Preview how many items a scope covers, before committing to counting them. */
const previewScope = async (scope) => {
  const supplies = await supplyService.listSupplies(scopeToQuery(normalizeScope(scope)));
  return {
    count: supplies.length,
    supplies: supplies.map((s) => ({
      _id: s._id,
      displayName: s.displayName,
      location: s.location,
      lastCountedAt: s.lastCountedAt || null
    }))
  };
};

/**
 * Cut a sheet from a scope.
 *
 * Expected quantities are frozen here. Everything that happens between now and
 * posting is measured against this moment, which is what makes a count taken
 * over a busy day meaningful rather than a race.
 */
const createCount = async (body, userId) => {
  const scope = normalizeScope(body.scope);
  const supplies = await supplyService.listSupplies(scopeToQuery(scope));

  if (supplies.length === 0) {
    throw new CountError('Nothing matches that scope, so there is nothing to count.', 400, {
      code: 'EMPTY_SCOPE'
    });
  }

  const count = await SupplyCount.create({
    name: (body.name || '').trim(),
    scope,
    blind: body.blind !== false,
    notes: body.notes || '',
    createdBy: userId,
    lines: supplies.map((s) => ({
      supply: s._id,
      expectedQuantity: s.quantityOnHand || 0,
      unitsPerPurchase: Math.max(1, s.unitsPerPurchase || 1),
      price: s.price || 0
    }))
  });

  // Returned blind like every other read of an open sheet, so the response that
  // creates a count can't be the one place the expected figures leak out.
  return decorateCount(count.toObject(), { reveal: false });
};

/**
 * Attach display names, and withhold what a blind count must not show.
 *
 * `reveal` is the caller's assertion that the reader is entitled to the
 * expected figures - true on review and after posting, false while counting.
 * Stripping them HERE rather than in the component is the actual enforcement: a
 * value omitted from the response cannot be read out of the network tab, and
 * one merely hidden by CSS can.
 *
 * Note what a hidden line does NOT carry: not just expectedQuantity, but the
 * whole supply document, because quantityOnHand lives on it and usually equals
 * the expected figure. Attaching the full item and blanking one field beside it
 * would have shipped the answer anyway.
 *
 * This is not a total information barrier and does not pretend to be - a
 * counter can still open the supplies list and read stock levels there. What it
 * guarantees is that the counting surface itself never puts the expected number
 * in front of someone about to write a number down.
 */
const decorateCount = async (count, { reveal = true } = {}) => {
  if (!count) return count;

  const ids = (count.lines || []).map((l) => l.supply).filter(Boolean);
  const supplies = await supplyService.listSuppliesByIds(ids);
  const byId = new Map(supplies.map((s) => [String(s._id), s]));

  const hide = count.blind && !reveal;

  const lines = (count.lines || []).map((line) => {
    const supply = byId.get(String(line.supply));

    if (hide) {
      // Only what is needed to find the thing on the shelf and name it. The
      // photo fields carry no quantity, and a picture is the fastest way to
      // confirm you are holding the right item.
      return {
        _id: line._id,
        supply: supply
          ? {
            _id: supply._id,
            partNumber: supply.partNumber,
            photoKey: supply.photoKey,
            photoUpdatedAt: supply.photoUpdatedAt
          }
          : { _id: line.supply },
        displayName: supply?.displayName || 'Unknown item',
        stockUnit: supply?.stockUnit || null,
        // The packaging the shelf is counted in. Carries no quantity — it says
        // "this comes in jugs of 5", not how many jugs there are.
        purchaseUnit: supply?.purchaseUnit || null,
        unitsPerPurchase: line.unitsPerPurchase || 1,
        location: supply?.location || null,
        countedQuantity: line.countedQuantity ?? null,
        countedPackages: line.countedPackages ?? null,
        countedLoose: line.countedLoose ?? null,
        countedBy: line.countedBy || null,
        countedAt: line.countedAt || null,
        addedDuringCount: !!line.addedDuringCount,
        note: line.note || ''
      };
    }

    return {
      ...line,
      supply: supply || { _id: line.supply },
      displayName: supply?.displayName || 'Unknown item',
      stockUnit: supply?.stockUnit || null,
      purchaseUnit: supply?.purchaseUnit || null,
      unitsPerPurchase: line.unitsPerPurchase || 1,
      location: supply?.location || null,
      liveQoh: supply?.quantityOnHand ?? null
    };
  });

  return {
    ...count,
    lines,
    progress: countProgress(count.lines || []),
    ...(hide ? { expectedHidden: true } : {})
  };
};

const listCounts = async () => {
  // Progress comes from an aggregation rather than from loading every line of
  // every count: the list wants "6 of 12", not the twelve.
  const [counts, progress] = await Promise.all([
    SupplyCount.find({})
      .select('-lines')
      .populate('createdBy', 'name displayName')
      .populate('postedBy', 'name displayName')
      .sort({ createdAt: -1 })
      .lean(),
    SupplyCount.aggregate([
      {
        $project: {
          total: { $size: { $ifNull: ['$lines', []] } },
          done: {
            $size: {
              $filter: {
                input: { $ifNull: ['$lines', []] },
                cond: { $ne: ['$$this.countedQuantity', null] }
              }
            }
          }
        }
      }
    ])
  ]);

  const byId = new Map(progress.map((p) => [String(p._id), p]));

  return counts.map((c) => {
    const p = byId.get(String(c._id)) || { total: 0, done: 0 };
    return {
      ...c,
      progress: {
        total: p.total,
        done: p.done,
        remaining: p.total - p.done,
        complete: p.total > 0 && p.done === p.total
      }
    };
  });
};

/**
 * Read a count.
 *
 * Whether the expected figures come back is decided by the count's STATUS, not
 * by anything the caller asks for. There is deliberately no reveal parameter:
 * an open blind sheet that could be unblinded with a query string would not be
 * blind, it would be blind by default, and the difference is the entire value
 * of the feature.
 */
const getCount = async (id) => {
  const count = await SupplyCount.findById(id)
    .populate('createdBy', 'name displayName')
    .populate('postedBy', 'name displayName')
    .lean();
  if (!count) return null;

  return decorateCount(count, { reveal: count.status !== 'counting' });
};

/**
 * Record a physical count for one line.
 *
 * Writes nothing to stock. The only thing that changes here is the sheet.
 */
const setLineCount = async (countId, lineId, body, userId) => {
  const count = await SupplyCount.findById(countId);
  if (!count) return null;
  if (count.status !== 'counting') {
    throw new CountError('This count is no longer open for entry.', 409, { code: 'NOT_COUNTING' });
  }

  const line = count.lines.id(lineId);
  if (!line) throw new CountError('No such line on this count.', 404);

  const resolved = resolveCountEntry(body, line.unitsPerPurchase);
  if (!resolved.ok) throw new CountError(resolved.error, 400);
  const { entry } = resolved;

  // An explicitly cleared entry returns the line to uncounted, which is not the
  // same as counting zero and must stay expressible.
  if (entry === null) {
    line.countedQuantity = null;
    line.countedPackages = null;
    line.countedLoose = null;
    line.countedBy = null;
    line.countedAt = null;
  } else {
    line.countedQuantity = entry.countedQuantity;
    line.countedPackages = entry.countedPackages;
    line.countedLoose = entry.countedLoose;
    line.countedBy = userId;
    line.countedAt = new Date();
  }

  if (body.note !== undefined) line.note = body.note;

  await count.save();
  return getCount(countId);
};

/**
 * Add something found on the shelf that the scope did not include.
 *
 * Its expected quantity is read now rather than at the original snapshot, which
 * is the honest figure: nobody expected this item to be here at all, so "when
 * the sheet was cut" is not a meaningful moment for it.
 */
const addLine = async (countId, supplyId, userId) => {
  const count = await SupplyCount.findById(countId);
  if (!count) return null;
  if (count.status !== 'counting') {
    throw new CountError('This count is no longer open for entry.', 409, { code: 'NOT_COUNTING' });
  }

  if (count.lines.some((l) => String(l.supply) === String(supplyId))) {
    throw new CountError('That item is already on this sheet.', 409, { code: 'DUPLICATE_LINE' });
  }

  const supply = await ShopSupply.findById(supplyId).lean();
  if (!supply) throw new CountError('No supply found with that ID.', 404);

  count.lines.push({
    supply: supply._id,
    expectedQuantity: supply.quantityOnHand || 0,
    unitsPerPurchase: Math.max(1, supply.unitsPerPurchase || 1),
    price: supply.price || 0,
    addedDuringCount: true
  });

  await count.save();
  return getCount(countId);
};

const removeLine = async (countId, lineId) => {
  const count = await SupplyCount.findById(countId);
  if (!count) return null;
  if (count.status !== 'counting') {
    throw new CountError('This count is no longer open for entry.', 409, { code: 'NOT_COUNTING' });
  }

  const line = count.lines.id(lineId);
  if (!line) throw new CountError('No such line on this count.', 404);
  line.deleteOne();

  await count.save();
  return getCount(countId);
};

/** Record something on the shelf that is not a supply yet. */
const addFoundItem = async (countId, body) => {
  const count = await SupplyCount.findById(countId);
  if (!count) return null;

  const description = String(body.description || '').trim();
  if (!description) throw new CountError('Describe what you found.', 400);

  count.foundNotInSystem.push({
    description,
    location: body.location || null,
    quantity: body.quantity === undefined || body.quantity === '' ? null : Number(body.quantity)
  });

  await count.save();
  return getCount(countId);
};

/**
 * Move a sheet into review, exposing the variances.
 *
 * Live quantities are read here so the review shows what posting would actually
 * do, including any line that has moved since the snapshot. They are read again
 * at post time - this is a preview, and stock can move between reading it and
 * acting on it.
 */
const reviewCount = async (id) => {
  const count = await SupplyCount.findById(id);
  if (!count) return null;

  if (count.status === 'counting') {
    count.status = 'review';
    await count.save();
  }

  return getVariances(id);
};

/** Reopen a sheet for more entry. Only from review - posted counts are final. */
const reopenCount = async (id) => {
  const count = await SupplyCount.findById(id);
  if (!count) return null;
  if (count.status !== 'review') {
    throw new CountError('Only a count in review can be reopened.', 409, { code: 'NOT_REVIEW' });
  }

  count.status = 'counting';
  await count.save();
  return getCount(id);
};

/**
 * What posting would do, line by line, with live stock folded in.
 *
 * Refuses while the sheet is still open. This endpoint is the other door into
 * the expected quantities, and leaving it ungated would make the blind sheet
 * decorative - anyone counting could read the answers from it.
 */
const getVariances = async (id) => {
  const count = await SupplyCount.findById(id)
    .populate('createdBy', 'name displayName')
    .populate('postedBy', 'name displayName')
    .lean();
  if (!count) return null;

  if (count.status === 'counting') {
    throw new CountError(
      'Finish counting before opening the variances.',
      409,
      { code: 'STILL_COUNTING' }
    );
  }

  const decorated = await decorateCount(count, { reveal: true });

  const resolved = decorated.lines.map((line) => {
    // A posted count reports what it DID, not what it would do now; re-resolving
    // it against today's stock would rewrite history every time it was opened.
    //
    // Shaped identically to resolveCountLine's output, so the report renders the
    // same before and after posting rather than quietly losing its columns.
    if (count.status === 'posted') {
      const counted = isCounted(line) ? Number(line.countedQuantity) : null;
      return {
        ...line,
        counted,
        expected: line.expectedQuantity,
        variance: counted === null ? 0 : counted - line.expectedQuantity,
        newQoh: line.postedQoh,
        moved: !!line.movedDuringCount,
        clamped: !!line.clamped,
        shouldPost: false
      };
    }
    return { ...line, ...resolveCountLine(line, line.liveQoh ?? line.expectedQuantity) };
  });

  return {
    ...decorated,
    lines: resolved,
    summary: summarizeCount(resolved)
  };
};

/**
 * Post the count: write the corrections.
 *
 * Each line posts a DELTA through adjustQuantity, so consumption that happened
 * during the count survives - see countRules.js for why that matters. Lines
 * that were counted and matched write no movement, but DO refresh the item's
 * last-counted stamp, because "we looked and it was right" is exactly the fact
 * that stamp records.
 *
 * Not a transaction. Posting is N independent adjustments and a partial failure
 * would leave some lines posted and some not - which is why the count keeps its
 * own record of which lines it wrote, rather than inferring it from stock. A
 * failure mid-post is reported with the lines that did succeed; the remaining
 * ones can be posted again.
 */
const postCount = async (id, userId) => {
  const count = await SupplyCount.findById(id);
  if (!count) return null;

  if (count.status === 'posted') {
    throw new CountError('This count has already been posted.', 409, { code: 'ALREADY_POSTED' });
  }
  if (count.status === 'cancelled') {
    throw new CountError('This count was cancelled.', 409, { code: 'CANCELLED' });
  }
  // Review is not optional. Skipping it would mean stock could be rewritten by
  // someone who never saw the variances they were about to write, which is the
  // one thing the counting/correcting split exists to prevent.
  if (count.status !== 'review') {
    throw new CountError(
      'Finish counting and review the variances before posting.',
      409,
      { code: 'NOT_REVIEWED' }
    );
  }

  const countable = count.lines.filter(isCounted);
  if (countable.length === 0) {
    throw new CountError('Nothing on this sheet has been counted yet.', 400, { code: 'NOTHING_COUNTED' });
  }

  const failures = [];
  const stampedAt = new Date();

  for (const line of countable) {
    const supply = await ShopSupply.findById(line.supply).lean();
    if (!supply) {
      failures.push({ line: String(line._id), reason: 'Item no longer exists.' });
      continue;
    }

    const resolved = resolveCountLine(line, supply.quantityOnHand || 0);
    line.movedDuringCount = resolved.moved;
    line.clamped = resolved.clamped;

    try {
      if (resolved.shouldPost && resolved.delta !== 0) {
        await supplyService.adjustQuantity(line.supply, {
          quantity: resolved.delta,
          type: 'count',
          unit: supply.stockUnit || null,
          note: count.name ? `Cycle count: ${count.name}` : 'Cycle count'
        }, userId);
      }
      line.postedQoh = resolved.newQoh;

      // Stamped for every counted line, variance or not.
      await ShopSupply.findByIdAndUpdate(line.supply, { $set: { lastCountedAt: stampedAt } });
    } catch (err) {
      failures.push({ line: String(line._id), reason: err.message });
    }
  }

  if (failures.length === countable.length) {
    await count.save(); // keep the moved/clamped findings even though nothing posted
    throw new CountError('Nothing could be posted.', 500, { code: 'POST_FAILED', failures });
  }

  count.status = 'posted';
  count.postedBy = userId;
  count.postedAt = stampedAt;
  await count.save();

  const result = await getVariances(id);
  return failures.length > 0 ? { ...result, failures } : result;
};

const cancelCount = async (id) => {
  const count = await SupplyCount.findById(id);
  if (!count) return null;
  if (count.status === 'posted') {
    throw new CountError('A posted count cannot be cancelled.', 409, { code: 'ALREADY_POSTED' });
  }

  count.status = 'cancelled';
  await count.save();
  return getCount(id);
};

const deleteCount = async (id) => {
  const count = await SupplyCount.findById(id).lean();
  if (!count) return null;
  if (count.status === 'posted') {
    throw new CountError(
      'A posted count is the record of a stock correction and cannot be deleted.',
      409,
      { code: 'ALREADY_POSTED' }
    );
  }
  await SupplyCount.findByIdAndDelete(id);
  return count;
};

// --------------------------------- Saved scopes ---------------------------------

const listScopes = async () => SupplyCountScope.find({}).sort({ name: 1 }).lean();

const createScope = async (body, userId) => {
  const name = String(body.name || '').trim();
  if (!name) throw new CountError('A saved scope needs a name.', 400);

  const existing = await SupplyCountScope.findOne({ name });
  if (existing) {
    throw new CountError(`A saved scope called "${name}" already exists.`, 409, {
      code: 'DUPLICATE_SCOPE'
    });
  }

  const created = await SupplyCountScope.create({
    name,
    scope: normalizeScope(body.scope),
    createdBy: userId
  });
  return created.toObject();
};

const updateScope = async (id, body) => {
  const update = {};
  if (body.name !== undefined) update.name = String(body.name).trim();
  if (body.scope !== undefined) update.scope = normalizeScope(body.scope);
  return SupplyCountScope.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
};

const deleteScope = async (id) => SupplyCountScope.findByIdAndDelete(id).lean();

/** Cut a fresh sheet from a saved scope. */
const runScope = async (id, userId) => {
  const scope = await SupplyCountScope.findById(id);
  if (!scope) return null;

  const count = await createCount({
    name: scope.name,
    scope: scope.scope,
    blind: true
  }, userId);

  scope.lastRunAt = new Date();
  await scope.save();

  return count;
};

module.exports = {
  CountError,
  scopeToQuery,
  normalizeScope,
  previewScope,
  createCount,
  listCounts,
  getCount,
  getVariances,
  setLineCount,
  addLine,
  removeLine,
  addFoundItem,
  reviewCount,
  reopenCount,
  postCount,
  cancelCount,
  deleteCount,
  listScopes,
  createScope,
  updateScope,
  deleteScope,
  runScope
};
