/**
 * Seed: shop-supplies tag tree, controlled vocabularies, and the ShopSupply
 * collection validator.
 *
 * Idempotent. Tags are upserted BY SLUG, so re-running preserves every _id and
 * therefore every item's existing tag assignments — a re-run after the triage
 * pass will not orphan anything. Renaming a node in the tree literal below
 * updates its name in place; changing its slug creates a new node.
 *
 * Writes only to new collections (supplytags, supplyvocabs, shopsupplies). It
 * never touches inventoryitems or settings — both are READ to seed vendor and
 * brand vocabularies, and neither is modified.
 *
 * Usage:
 *   node scripts/seed-supply-tags.js              # dry run (default)
 *   node scripts/seed-supply-tags.js --execute    # write changes
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const moment = require('moment');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

const SupplyTag = require('../src/server/models/SupplyTag');
const SupplyVocab = require('../src/server/models/SupplyVocab');
const { indexById, validateSubtreePlacement } = require('../src/server/utils/supplyRules');

const MONGODB_URI = process.env.MONGODB_URI;
const DRY_RUN = !process.argv.includes('--execute');

if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI not found in .env');
  process.exit(1);
}

// ───────────────────────────────────────────────────────────────────────────
// The tree (docs/shop-supplies-module.md §4)
//
// Top tier is JOB PHASE — what the tech is doing — because that is what a
// person on the floor navigates by. Each branch then gets its own second-tier
// criterion (substrate under Cleaning, vehicle system under Service Fluids,
// coating stage under Refinish); there is no principle unifying those beyond
// "where would someone look for this," which is an accepted cost.
//
// `notes` records which fields the node will contribute in Phase 2. It is
// documentation, not behaviour — do NOT turn these into tag nodes. A node named
// "80 grit" or "over 48in" duplicates a computable fact by hand and the
// hand-maintained copy drifts silently.
//
// `slug` is only spelled out where the derived slug would collide or read
// ambiguously out of context (Filters > Oil, Masking > Tape).
// ───────────────────────────────────────────────────────────────────────────
const TREE = [
  {
    name: 'Chemicals & Fluids',
    children: [
      {
        name: 'Cleaning & Detailing',
        children: [
          { name: 'Glass' },
          { name: 'Wheel & Tire' },
          { name: 'Interior — Carpet & Upholstery' },
          { name: 'Exterior Wash' },
          { name: 'Degreasers & All-Purpose' }
        ]
      },
      {
        name: 'Service Fluids',
        children: [
          { name: 'Engine Oil', notes: 'viscosity' },
          { name: 'Transmission & Gear Oil', notes: 'viscosity' },
          { name: 'Brake Fluid', notes: 'DOT rating' },
          { name: 'Coolant & Antifreeze', notes: 'spec/color' },
          { name: 'Power Steering' },
          { name: 'Washer Fluid' },
          { name: 'Refrigerant', notes: 'refrigerant type' }
        ]
      },
      {
        name: 'Lubricants & Penetrants',
        children: [
          { name: 'Grease', notes: 'NLGI grade' },
          { name: 'Penetrating Oil' },
          { name: 'Dry & Specialty Lubricants' },
          { name: 'Assembly Lube' }
        ]
      },
      {
        name: 'Shop Chemicals',
        children: [
          { name: 'Solvents & Thinners' },
          { name: 'Brake & Parts Cleaner' },
          { name: 'Hand Cleaner' },
          { name: 'Battery & Terminal' }
        ]
      }
    ]
  },
  {
    name: 'Refinish & Body',
    children: [
      {
        name: 'Surface Prep',
        children: [
          { name: 'Wax & Grease Remover' },
          { name: 'Adhesion Promoter' },
          { name: 'Etch & Conversion Coating' },
          { name: 'Panel Wipe' }
        ]
      },
      {
        name: 'Fillers & Putties',
        children: [
          { name: 'Body Filler' },
          { name: 'Glazing Putty' },
          { name: 'Fiberglass & Reinforced Filler' }
        ]
      },
      {
        name: 'Abrasives',
        children: [
          { name: 'Discs', slug: 'abrasive-discs', notes: 'grit, diameter' },
          { name: 'Sheets & Rolls', notes: 'grit' },
          { name: 'Pads & Scuff', notes: 'grit' },
          { name: 'Compounds & Polishes' }
        ]
      },
      {
        name: 'Coatings',
        children: [
          { name: 'Primer' },
          { name: 'Basecoat' },
          { name: 'Clearcoat' },
          { name: 'Single Stage' },
          { name: 'Reducers, Hardeners & Additives', notes: 'temp range' }
        ]
      },
      {
        name: 'Masking',
        children: [
          { name: 'Tape', slug: 'masking-tape', notes: 'width' },
          { name: 'Paper', slug: 'masking-paper', notes: 'width' },
          { name: 'Film & Plastic' },
          { name: 'Foam & Jamb' }
        ]
      }
    ]
  },
  {
    name: 'Consumable Hardware',
    children: [
      {
        name: 'Fasteners & Clips',
        children: [
          { name: 'Trim & Body Clips' },
          { name: 'Threaded Fasteners', notes: 'thread, length' },
          { name: 'Rivets' }
        ]
      },
      {
        name: 'Electrical Consumables',
        children: [
          { name: 'Terminals & Connectors', notes: 'gauge' },
          { name: 'Wire & Loom', notes: 'gauge' },
          { name: 'Heat Shrink & Electrical Tape' },
          { name: 'Fuses & Relays', notes: 'amperage' }
        ]
      },
      {
        name: 'Adhesives & Sealants',
        children: [
          { name: 'Urethane & Glass' },
          { name: 'Seam Sealer' },
          { name: 'Threadlocker', notes: 'strength' },
          { name: 'RTV & Gasket Maker' },
          { name: 'Structural & Panel Bond' }
        ]
      }
    ]
  },
  {
    name: 'Shop & Safety Consumables',
    children: [
      {
        name: 'PPE',
        children: [
          { name: 'Gloves', notes: 'size, material' },
          { name: 'Respiratory' },
          { name: 'Eye & Face' },
          { name: 'Protective Clothing', notes: 'size' }
        ]
      },
      {
        name: 'Absorbents & Spill',
        children: [
          { name: 'Floor Dry' },
          { name: 'Pads & Socks' },
          { name: 'Spill Kits' }
        ]
      },
      {
        name: 'Wipes, Rags & Towels',
        children: [
          { name: 'Shop Towels' },
          { name: 'Tack Cloth' },
          { name: 'Microfiber' },
          { name: 'Paper Products' }
        ]
      },
      {
        name: 'Mixing & Application',
        children: [
          { name: 'Mix Cups & Sticks', notes: 'volume' },
          { name: 'Strainers & Filters', notes: 'mesh' },
          { name: 'Spray Gun Consumables' },
          { name: 'Brushes & Applicators' }
        ]
      },
      {
        name: 'Disposal & Waste',
        children: [
          { name: 'Waste Oil' },
          { name: 'Used Filters' },
          { name: 'Sharps & Blades' },
          { name: 'Chemical Waste' }
        ]
      }
    ]
  },
  {
    name: 'Service Parts',
    children: [
      {
        name: 'Filters',
        children: [
          { name: 'Oil', slug: 'filter-oil' },
          { name: 'Air', slug: 'filter-air' },
          { name: 'Cabin', slug: 'filter-cabin' },
          { name: 'Fuel', slug: 'filter-fuel' }
        ]
      },
      { name: 'Wipers', notes: 'length' },
      { name: 'Bulbs', notes: 'bulb number' }
    ]
  }
];

// Static vocabularies. Locations are deliberately NOT seeded — see seedVocab().
const STATIC_VOCAB = {
  form: ['aerosol', 'liquid', 'solid', 'paste', 'gel', 'powder'],
  unit: ['each', 'can', 'quart', 'gallon', 'box', 'roll', 'sheet', 'ft', 'lb']
};

const slugify = (name) => name
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, ' ')   // drop &, em dashes, commas
  .trim()
  .replace(/[\s-]+/g, '-');

/**
 * Flatten TREE into [{ name, slug, parentSlug, sortOrder, kind, notes }].
 */
const flattenTree = (nodes, parentSlug = null, out = []) => {
  nodes.forEach((node, index) => {
    const slug = node.slug || slugify(node.name);
    out.push({
      name: node.name,
      slug,
      parentSlug,
      sortOrder: index,
      kind: 'judgment',
      notes: node.notes || ''
    });
    if (node.children) flattenTree(node.children, slug, out);
  });
  return out;
};

/**
 * Check the literal above against the same rules the model enforces, before
 * touching the database. Seeding writes via findOneAndUpdate, which bypasses
 * document middleware — so without this a bad edit to TREE would be written
 * unchecked and only fail later, from the UI.
 */
const validateTreeLiteral = (flat) => {
  const errors = [];

  const bySlug = new Map(flat.map((n) => [n.slug, n]));
  const seen = new Set();
  flat.forEach((n) => {
    if (seen.has(n.slug)) errors.push(`Duplicate slug "${n.slug}" (${n.name})`);
    seen.add(n.slug);
    if (n.parentSlug && !bySlug.has(n.parentSlug)) {
      errors.push(`"${n.name}" references unknown parent "${n.parentSlug}"`);
    }
  });

  // Re-express as id-shaped nodes so the pure rules can walk them.
  const asNodes = flat.map((n) => ({
    _id: n.slug,
    name: n.name,
    parent: n.parentSlug,
    kind: n.kind
  }));
  const byId = indexById(asNodes);
  asNodes.forEach((n) => {
    const result = validateSubtreePlacement(n, byId);
    if (!result.ok) errors.push(`"${n.name}": ${result.error}`);
  });

  return errors;
};

/**
 * Upsert every tag by slug, parents before children so parent ids resolve.
 */
const seedTags = async (flat, report) => {
  const existing = await SupplyTag.find({}, '_id slug name parent sortOrder notes').lean();
  const existingBySlug = new Map(existing.map((t) => [t.slug, t]));
  const idBySlug = new Map(existing.map((t) => [t.slug, t._id]));

  for (const node of flat) {
    const parentId = node.parentSlug ? idBySlug.get(node.parentSlug) || null : null;
    const prior = existingBySlug.get(node.slug);

    if (!prior) {
      report.tagsCreated.push(node.slug);
    } else {
      const changed = prior.name !== node.name
        || String(prior.parent || '') !== String(parentId || '')
        || prior.sortOrder !== node.sortOrder
        || (prior.notes || '') !== node.notes;
      if (changed) report.tagsUpdated.push(node.slug);
      else report.tagsUnchanged.push(node.slug);
    }

    if (DRY_RUN) {
      // Keep the slug→id map populated so children of a would-be-new parent
      // still resolve during the dry run.
      if (!idBySlug.has(node.slug)) idBySlug.set(node.slug, `dry-run:${node.slug}`);
      continue;
    }

    const saved = await SupplyTag.findOneAndUpdate(
      { slug: node.slug },
      {
        $set: {
          name: node.name,
          parent: parentId,
          sortOrder: node.sortOrder,
          kind: node.kind,
          notes: node.notes
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    idBySlug.set(node.slug, saved._id);
  }

  // Nodes in the database that are no longer in the literal. Reported, never
  // deleted — they may carry items, and deletion is a decision for the tag
  // manager where the in-use count is visible.
  const literalSlugs = new Set(flat.map((n) => n.slug));
  existing.forEach((t) => {
    if (!literalSlugs.has(t.slug)) report.tagsOrphaned.push(t.slug);
  });
};

/**
 * Seed vocabularies. Reads Settings and InventoryItem; writes neither.
 */
const seedVocab = async (report) => {
  const db = mongoose.connection.db;
  const entries = [];

  Object.entries(STATIC_VOCAB).forEach(([fieldKey, values]) => {
    values.forEach((value, index) => {
      entries.push({ fieldKey, value, label: value, sortOrder: index });
    });
  });

  // Vendors: the Settings directory (inventory-tagged only) unioned with
  // whatever the old table actually used, so nothing in the data is lost.
  const settings = await db.collection('settings').findOne({});
  const directoryVendors = ((settings && settings.customVendors) || [])
    .filter((v) => v && typeof v === 'object' && (v.usedFor || []).includes('inventory'))
    .map((v) => v.name)
    .filter(Boolean);
  const usedVendors = (await db.collection('inventoryitems').distinct('vendor')) || [];
  const brands = (await db.collection('inventoryitems').distinct('brand')) || [];

  const addUnique = (fieldKey, values) => {
    const seen = new Set();
    values
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .forEach((value) => {
        const key = value.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        entries.push({ fieldKey, value: key, label: value, sortOrder: 0 });
      });
  };

  addUnique('vendor', [...directoryVendors, ...usedVendors]);
  addUnique('brand', brands);

  report.vocabFromDirectory = directoryVendors.length;
  report.vocabFromInventory = {
    vendor: usedVendors.filter(Boolean).length,
    brand: brands.filter(Boolean).length
  };

  const existing = await SupplyVocab.find({}, 'fieldKey value').lean();
  const existingKeys = new Set(existing.map((v) => `${v.fieldKey}:${v.value}`));

  for (const entry of entries) {
    const key = `${entry.fieldKey}:${entry.value}`;
    if (existingKeys.has(key)) {
      report.vocabUnchanged.push(key);
      continue;
    }
    report.vocabCreated.push(key);
    if (DRY_RUN) continue;

    await SupplyVocab.findOneAndUpdate(
      { fieldKey: entry.fieldKey, value: entry.value },
      { $set: { label: entry.label, sortOrder: entry.sortOrder }, $setOnInsert: { isActive: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
};

/**
 * Apply the permissive collection validator (§6a).
 *
 * This is the only layer that catches a raw-driver bulkWrite from a future
 * ad-hoc script — document middleware doesn't run for those, and neither does
 * the application helper. Deliberately permissive: it checks only that a SET
 * primaryTag appears in tags, and must accept { tags: [], primaryTag: null },
 * which is the normal state of every imported item. Rejecting that would make
 * the validator reject the import's own output.
 *
 * validationLevel 'moderate' so it applies to inserts and to updates of already
 * valid documents, without retroactively locking anything out.
 *
 * NON-FATAL. Applying a validator needs the dbAdmin role, which a stock Atlas
 * application user does not have. Losing this layer costs defence in depth
 * against raw-driver writes from future ad-hoc scripts — it does NOT weaken any
 * path that goes through the app, all of which call validateTagAssignment
 * explicitly. Seeding the tree is the point of this script; failing the whole
 * run over an optional hardening layer would be the wrong trade.
 */
const applyValidator = async (report) => {
  const db = mongoose.connection.db;
  const collections = await db.listCollections({ name: 'shopsupplies' }).toArray();

  const validator = {
    $expr: {
      $or: [
        { $eq: [{ $ifNull: ['$primaryTag', null] }, null] },
        { $in: ['$primaryTag', { $ifNull: ['$tags', []] }] }
      ]
    }
  };

  if (DRY_RUN) {
    report.validator = collections.length === 0
      ? 'would create collection + apply validator'
      : 'would apply validator to existing collection';
    return;
  }

  try {
    if (collections.length === 0) await db.createCollection('shopsupplies');
    await db.command({
      collMod: 'shopsupplies',
      validator,
      validationLevel: 'moderate',
      validationAction: 'error'
    });
    report.validator = 'applied';
  } catch (err) {
    const denied = err.code === 8000 || /not allowed to do action/i.test(err.message || '');
    report.validator = denied ? 'SKIPPED — insufficient privileges' : `FAILED — ${err.message}`;
    report.validatorError = err.message;
    if (!denied) throw err;
  }
};

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Shop Supplies — Tag Tree & Vocabulary Seed');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'EXECUTE'}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const flat = flattenTree(TREE);

  const literalErrors = validateTreeLiteral(flat);
  if (literalErrors.length > 0) {
    console.error('✗ The tree literal in this script is invalid — nothing was written:\n');
    literalErrors.forEach((e) => console.error(`  ${e}`));
    process.exit(1);
  }
  console.log(`Tree literal OK: ${flat.length} nodes, `
    + `${flat.filter((n) => !n.parentSlug).length} top-level phases.\n`);

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB.\n');

  const report = {
    tagsCreated: [], tagsUpdated: [], tagsUnchanged: [], tagsOrphaned: [],
    vocabCreated: [], vocabUnchanged: [], validator: null
  };

  await seedTags(flat, report);
  await seedVocab(report);
  await applyValidator(report);

  console.log('─── Tags ───');
  console.log(`  create:    ${report.tagsCreated.length}`);
  console.log(`  update:    ${report.tagsUpdated.length}`);
  console.log(`  unchanged: ${report.tagsUnchanged.length}`);
  if (report.tagsOrphaned.length > 0) {
    console.log(`\n  ⚠  ${report.tagsOrphaned.length} tag(s) in the database are not in this script:`);
    report.tagsOrphaned.forEach((s) => console.log(`       ${s}`));
    console.log('     Left alone — they may carry items. Delete them from the tag manager,');
    console.log('     where the in-use count is visible.');
  }

  console.log('\n─── Vocabulary ───');
  console.log(`  create:    ${report.vocabCreated.length}`);
  console.log(`  unchanged: ${report.vocabUnchanged.length}`);
  console.log(`  vendors from Settings directory: ${report.vocabFromDirectory}`);
  console.log(`  vendors found on inventory items: ${report.vocabFromInventory.vendor}`);
  console.log(`  brands found on inventory items:  ${report.vocabFromInventory.brand}`);
  console.log('\n  Locations are NOT seeded. Shelf codes are specific to your shop and a');
  console.log('  guessed set would be worse than none — add them in the supplies UI, or');
  console.log('  type one into the Location box and it will be created.');

  console.log(`\n─── Collection validator ───\n  ${report.validator}`);
  if (String(report.validator).startsWith('SKIPPED')) {
    console.log('\n  This database user lacks the dbAdmin role, so the schema-level guard on');
    console.log('  primaryTag could not be installed. Every write through the app still');
    console.log('  enforces the invariant in the service layer — what is missing is the');
    console.log('  backstop against a future raw-driver script writing around the app.');
    console.log('  To enable it: grant the user dbAdmin on this database, then re-run.');
  }

  const logDir = path.resolve(__dirname, '../backups');
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `seed-supply-tags-${moment().format('YYYY-MM-DD_HH-mm-ss')}.json`);
  fs.writeFileSync(logPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    dryRun: DRY_RUN,
    nodeCount: flat.length,
    ...report
  }, null, 2));
  console.log(`\nLog saved: ${logPath}`);

  if (DRY_RUN) {
    console.log('\n⚠  DRY RUN — re-run with --execute to apply.');
  } else {
    console.log('\n✓ Seed complete.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
