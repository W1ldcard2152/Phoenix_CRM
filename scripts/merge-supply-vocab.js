/**
 * Merge near-duplicate shop-supply vocabulary entries.
 *
 * The vendor vocabulary was seeded by unioning `Settings.customVendors` names
 * with `distinct('vendor')` from the old InventoryItem table. Those two sources
 * spell the same vendor differently and the seed's dedupe was exact-match, so
 * both spellings survived:
 *
 *     Amazon + Amazon.com      Rock Auto + RockAuto      Walmart + Walmart.com
 *
 * Which makes the filters look broken: pick "Walmart" when the items are on
 * "Walmart.com" and you get nothing.
 *
 * Entries CANNOT simply be deleted — supplies reference vocabulary by ObjectId,
 * so deleting a row would strip the field from every item pointing at it. Each
 * group therefore picks a winner, repoints the referencing supplies, and only
 * then removes the losers.
 *
 * Usage:
 *   node scripts/merge-supply-vocab.js                    # dry run (default)
 *   node scripts/merge-supply-vocab.js --execute          # write changes
 *   node scripts/merge-supply-vocab.js --field=brand      # default: vendor
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const moment = require('moment');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

const SupplyVocab = require('../src/server/models/SupplyVocab');
const ShopSupply = require('../src/server/models/ShopSupply');
const Settings = require('../src/server/models/Settings');

const MONGODB_URI = process.env.MONGODB_URI;
const DRY_RUN = !process.argv.includes('--execute');
const fieldArg = process.argv.find((a) => a.startsWith('--field='));
const FIELD_KEY = fieldArg ? fieldArg.split('=')[1] : 'vendor';

// Every ShopSupply path that points at a vocabulary entry. All of them have to
// be repointed, not just the one matching FIELD_KEY — `unit` entries are used
// by two different paths, so assuming one would strand the other.
const VOCAB_REF_FIELDS = ['brand', 'vendor', 'form', 'location', 'stockUnit', 'purchaseUnit'];

if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI not found in .env');
  process.exit(1);
}

/**
 * The key two spellings must share to be considered the same thing.
 *
 * Strips case, punctuation, whitespace and a trailing ".com" — which covers
 * every observed pair. Deliberately conservative: it will NOT merge "Advance
 * Auto" with "Advance Auto Parts", because those could genuinely be different
 * accounts and a wrong merge is unrecoverable without the backup.
 */
const normalise = (s) => String(s || '')
  .toLowerCase()
  .replace(/\.com$/, '')
  .replace(/[^a-z0-9]/g, '');

async function backupCollections(db) {
  const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
  const dir = path.resolve(__dirname, '../backups', `supply-vocab-merge-${timestamp}`);
  fs.mkdirSync(dir, { recursive: true });

  for (const name of ['supplyvocabs', 'shopsupplies']) {
    const docs = await db.collection(name).find({}).toArray();
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(docs, null, 2));
    console.log(`Backed up ${docs.length} ${name} documents`);
  }
  console.log(`  -> ${dir}\n`);
  return dir;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Shop Supplies — Vocabulary Merge');
  console.log(`  Field: ${FIELD_KEY}`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'EXECUTE'}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB.\n');

  const entries = await SupplyVocab.find({ fieldKey: FIELD_KEY }).lean();
  const supplies = await ShopSupply.find({}, VOCAB_REF_FIELDS.join(' ')).lean();

  // How many supplies point at each vocab id, across every referencing path.
  const refCount = new Map();
  supplies.forEach((s) => {
    VOCAB_REF_FIELDS.forEach((f) => {
      const id = s[f] ? String(s[f]) : null;
      if (id) refCount.set(id, (refCount.get(id) || 0) + 1);
    });
  });

  // The directory spelling is what URL detection resolves to and what the parts
  // worksheet already uses, so it wins — choosing the other one would silently
  // break vendor autofill for every future entry.
  const settings = await Settings.getSettings();
  const directoryNames = new Set(
    (settings.customVendors || []).map((v) => String(v.name || '').toLowerCase())
  );

  const groups = new Map();
  entries.forEach((e) => {
    const key = normalise(e.label || e.value);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  });

  const merges = [];
  groups.forEach((rows, key) => {
    if (rows.length < 2) return;

    const score = (e) => {
      const inDirectory = FIELD_KEY === 'vendor'
        && directoryNames.has(String(e.label || e.value).toLowerCase());
      return [inDirectory ? 1 : 0, refCount.get(String(e._id)) || 0];
    };

    const ranked = [...rows].sort((a, b) => {
      const [ad, ar] = score(a);
      const [bd, br] = score(b);
      return (bd - ad) || (br - ar) || String(a.label).localeCompare(String(b.label));
    });

    merges.push({ key, winner: ranked[0], losers: ranked.slice(1) });
  });

  if (merges.length === 0) {
    console.log(`No near-duplicate "${FIELD_KEY}" entries found. Nothing to do.`);
    await mongoose.disconnect();
    return;
  }

  console.log(`─── ${merges.length} group(s) to merge ───\n`);
  let totalRepointed = 0;
  merges.forEach(({ winner, losers }) => {
    const winnerRefs = refCount.get(String(winner._id)) || 0;
    const inDir = directoryNames.has(String(winner.label || winner.value).toLowerCase());
    console.log(`  KEEP  "${winner.label}"  (${winnerRefs} items${inDir ? ', in vendor directory' : ''})`);
    losers.forEach((l) => {
      const n = refCount.get(String(l._id)) || 0;
      totalRepointed += n;
      console.log(`  drop  "${l.label}"  (${n} item${n === 1 ? '' : 's'} -> "${winner.label}")`);
    });
    console.log();
  });
  console.log(`Total supplies to repoint: ${totalRepointed}\n`);

  const report = { timestamp: new Date().toISOString(), dryRun: DRY_RUN, fieldKey: FIELD_KEY, merges: [] };

  if (!DRY_RUN) {
    const backupDir = await backupCollections(mongoose.connection.db);
    report.backupDir = backupDir;

    for (const { winner, losers } of merges) {
      for (const loser of losers) {
        let repointed = 0;
        // Repoint every path, not just the one named by FIELD_KEY: `unit`
        // entries are referenced by both stockUnit and purchaseUnit.
        for (const f of VOCAB_REF_FIELDS) {
          const res = await ShopSupply.updateMany(
            { [f]: loser._id },
            { $set: { [f]: winner._id } }
          );
          repointed += res.modifiedCount || 0;
        }
        await SupplyVocab.deleteOne({ _id: loser._id });
        report.merges.push({
          winner: winner.label, loser: loser.label, repointed
        });
        console.log(`✓ "${loser.label}" -> "${winner.label}" (${repointed} repointed, entry removed)`);
      }
    }

    // Conservation check: nothing may have lost or gained a value.
    const after = await ShopSupply.find({}, VOCAB_REF_FIELDS.join(' ')).lean();
    const countSet = (docs) => VOCAB_REF_FIELDS.reduce((acc, f) => {
      acc[f] = docs.filter((d) => d[f]).length;
      return acc;
    }, {});
    const before = countSet(supplies);
    const now = countSet(after);
    const drifted = VOCAB_REF_FIELDS.filter((f) => before[f] !== now[f]);

    console.log('\n─── Conservation check ───');
    VOCAB_REF_FIELDS.forEach((f) => {
      const flag = before[f] === now[f] ? 'ok' : 'DRIFT';
      console.log(`  ${f}: ${before[f]} -> ${now[f]}  [${flag}]`);
    });
    if (drifted.length > 0) {
      console.error(`\n✗ ${drifted.join(', ')} changed count. Restore from ${backupDir}.`);
      report.drifted = drifted;
    }

    // No supply may point at an id that no longer exists.
    const liveIds = new Set((await SupplyVocab.find({}, '_id').lean()).map((v) => String(v._id)));
    const dangling = [];
    after.forEach((s) => VOCAB_REF_FIELDS.forEach((f) => {
      if (s[f] && !liveIds.has(String(s[f]))) dangling.push({ _id: String(s._id), field: f });
    }));
    console.log(`  dangling references: ${dangling.length}`);
    report.dangling = dangling;
  }

  const logDir = path.resolve(__dirname, '../backups');
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `merge-supply-vocab-${moment().format('YYYY-MM-DD_HH-mm-ss')}.json`);
  fs.writeFileSync(logPath, JSON.stringify(report, null, 2));
  console.log(`\nLog saved: ${logPath}`);

  if (DRY_RUN) {
    console.log('\n⚠  DRY RUN — re-run with --execute to apply.');
  } else {
    console.log('\n✓ Merge complete. RESTART THE SERVER — it caches vocabulary-adjacent data.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Merge failed:', err);
  process.exit(1);
});
