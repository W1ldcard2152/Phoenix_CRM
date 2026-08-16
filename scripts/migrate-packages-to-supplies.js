/**
 * Point service-package lines at shop-supply TAGS instead of the legacy
 * free-text `packageTag`.
 *
 * `packageTag` was a parallel vocabulary in `Settings.packageTags`, invented
 * because the old inventory had no taxonomy for a package to point at. Shop
 * supplies has one, so a line now references a node in the tag tree and the
 * supplies that satisfy it are everything tagged at or beneath that node.
 *
 * Touches ONLY the ServicePackage collection. Work orders are left exactly as
 * they are: their committed package lines record which inventory item was
 * actually consumed, and a work order is a historical document — rewriting what
 * it drew would be a lie. Commit and removal branch on which id a line carries,
 * so old lines keep working against the old table.
 *
 * Usage:
 *   node scripts/migrate-packages-to-supplies.js              # dry run
 *   node scripts/migrate-packages-to-supplies.js --execute
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const moment = require('moment');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

const ServicePackage = require('../src/server/models/ServicePackage');
const SupplyTag = require('../src/server/models/SupplyTag');
const ShopSupply = require('../src/server/models/ShopSupply');

const MONGODB_URI = process.env.MONGODB_URI;
const DRY_RUN = !process.argv.includes('--execute');

/**
 * Legacy packageTag -> supply tag slug.
 *
 * Spelled out rather than matched by name because the tree deliberately names
 * nodes for their position in it: the oil-filter node is called "Oil" (it sits
 * under Filters) and carries "Oil Filter" only as its display noun. Fuzzy
 * matching would have missed four of these six and silently produced a package
 * that draws from the wrong shelf.
 */
const TAG_MAP = {
  'Motor Oil': 'engine-oil',
  'Oil Filter': 'filter-oil',
  'Transmission Fluid': 'transmission-gear-oil',
  'Brake Fluid': 'brake-fluid',
  Coolant: 'coolant-antifreeze',
  'Power Steering Fluid': 'power-steering'
};

if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI not found in .env');
  process.exit(1);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Service Packages — point lines at shop supply tags');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'EXECUTE'}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB.\n');

  const tags = await SupplyTag.find({}, '_id slug name noun').lean();
  const tagBySlug = new Map(tags.map((t) => [t.slug, t]));

  // Every mapping must resolve before anything is written — a half-migrated
  // package is worse than an unmigrated one.
  const missing = Object.entries(TAG_MAP).filter(([, slug]) => !tagBySlug.has(slug));
  if (missing.length > 0) {
    console.error('✗ These tag slugs do not exist. Run the seed first:\n');
    missing.forEach(([tag, slug]) => console.error(`    ${tag} -> ${slug}`));
    process.exit(1);
  }

  const packages = await ServicePackage.find({}).lean();
  console.log(`${packages.length} service package(s).\n`);

  const report = { timestamp: new Date().toISOString(), dryRun: DRY_RUN, packages: [] };
  let linesToMigrate = 0;
  let unmapped = 0;

  for (const pkg of packages) {
    const lines = pkg.includedItems || [];
    console.log(`─── "${pkg.name}" ($${pkg.price}) ───`);
    if (lines.length === 0) {
      console.log('  no included items — flat rate only, nothing to migrate\n');
      continue;
    }

    const migrated = [];
    for (const line of lines) {
      if (line.supplyTag) {
        console.log(`  "${line.label}" already points at a tag — left alone`);
        migrated.push(line);
        continue;
      }

      const slug = TAG_MAP[line.packageTag];
      const tag = slug ? tagBySlug.get(slug) : null;

      if (!tag) {
        unmapped += 1;
        console.log(`  ⚠  "${line.label}" tag "${line.packageTag}" has no mapping — left as-is`);
        migrated.push(line);
        continue;
      }

      // How many supplies would actually satisfy this line once migrated? A
      // mapping that resolves to an empty shelf is technically correct and
      // practically useless, so surface it now rather than at the counter.
      const descendants = await SupplyTag.find({ parent: tag._id }, '_id').lean();
      const ids = [tag._id, ...descendants.map((d) => d._id)];
      const candidates = await ShopSupply.countDocuments({ isActive: true, tags: { $in: ids } });

      linesToMigrate += 1;
      console.log(`  "${line.label}"  ${line.packageTag} -> ${slug}`
        + `  (${candidates} ${candidates === 1 ? 'supply' : 'supplies'} available)`);
      if (candidates === 0) {
        console.log('       ⚠  nothing is tagged there yet — the line will have nothing to pick');
      }

      migrated.push({ ...line, supplyTag: tag._id, packageTag: line.packageTag });
    }

    report.packages.push({ name: pkg.name, lines: migrated.length });

    if (!DRY_RUN) {
      await ServicePackage.updateOne({ _id: pkg._id }, { $set: { includedItems: migrated } });
      console.log('  ✓ updated');
    }
    console.log();
  }

  console.log(`Lines to migrate: ${linesToMigrate}${unmapped ? `, unmapped: ${unmapped}` : ''}`);
  console.log('\nWork orders are NOT touched. Their committed package lines record what');
  console.log('was actually consumed from the old inventory, and that history stands.');

  const logDir = path.resolve(__dirname, '../backups');
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `migrate-packages-${moment().format('YYYY-MM-DD_HH-mm-ss')}.json`);
  fs.writeFileSync(logPath, JSON.stringify(report, null, 2));
  console.log(`\nLog saved: ${logPath}`);

  if (DRY_RUN) console.log('\n⚠  DRY RUN — re-run with --execute to apply.');
  else console.log('\n✓ Migration complete. Restart the server.');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
