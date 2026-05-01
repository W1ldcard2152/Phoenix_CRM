/**
 * Backfill: Recalculate retail price for inventory items with unitsPerPurchase > 1.
 *
 * Background: cost is stored per purchase unit (e.g., per 5qt jug) and price was
 * previously auto-calculated as `cost * (1 + markup)`, which produced a per-jug
 * retail price. The new convention is price-per-sale-unit:
 *
 *   price = (cost / unitsPerPurchase) * (1 + markup)
 *
 * To avoid clobbering prices the user has manually set, this script ONLY updates
 * items whose current price matches the buggy formula (cost * markup) within a
 * 1-cent tolerance. Items that look like manual overrides are listed but skipped.
 *
 * Usage:
 *   node scripts/backfill-inventory-unit-pricing.js              # dry run (default)
 *   node scripts/backfill-inventory-unit-pricing.js --execute     # write changes
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const moment = require('moment');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

const MONGODB_URI = process.env.MONGODB_URI;
const DRY_RUN = !process.argv.includes('--execute');
const TOLERANCE = 0.01;

if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI not found in .env');
  process.exit(1);
}

async function backupCollection(db, name) {
  const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
  const backupDir = path.resolve(__dirname, '../backups', `inventory-pricing-${timestamp}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const docs = await db.collection(name).find({}).toArray();
  const filePath = path.join(backupDir, `${name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(docs, null, 2));
  console.log(`Backed up ${docs.length} ${name} documents to ${filePath}\n`);
  return backupDir;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Inventory Unit-Pricing Backfill');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'EXECUTE'}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB.\n');

  const db = mongoose.connection.db;

  const settings = await db.collection('settings').findOne({});
  const markup = (settings && settings.partMarkupPercentage) || 30;
  const multiplier = 1 + markup / 100;
  console.log(`Using markup: ${markup}% (multiplier ${multiplier})\n`);

  const backupDir = await backupCollection(db, 'inventoryitems');

  const collection = db.collection('inventoryitems');
  const items = await collection.find({ unitsPerPurchase: { $gt: 1 } }).toArray();
  console.log(`Found ${items.length} items with unitsPerPurchase > 1.\n`);

  const willUpdate = [];
  const skipped = [];

  for (const item of items) {
    const cost = parseFloat(item.cost) || 0;
    const upp = parseInt(item.unitsPerPurchase) || 1;
    const currentPrice = parseFloat(item.price) || 0;
    const buggyExpected = parseFloat((cost * multiplier).toFixed(2));
    const correctPrice = parseFloat(((cost / upp) * multiplier).toFixed(2));

    if (cost <= 0) {
      skipped.push({ ...item, reason: 'zero cost' });
      continue;
    }

    if (Math.abs(currentPrice - buggyExpected) <= TOLERANCE) {
      willUpdate.push({
        _id: item._id,
        name: item.name,
        unit: item.unit,
        purchaseUnit: item.purchaseUnit,
        unitsPerPurchase: upp,
        cost,
        oldPrice: currentPrice,
        newPrice: correctPrice
      });
    } else {
      skipped.push({
        _id: item._id,
        name: item.name,
        cost,
        unitsPerPurchase: upp,
        currentPrice,
        wouldBe: correctPrice,
        reason: 'price does not match buggy formula — likely manual override'
      });
    }
  }

  console.log(`─── Items to update (${willUpdate.length}) ───`);
  for (const u of willUpdate) {
    console.log(`  ${u.name}`);
    console.log(`    cost $${u.cost} / ${u.purchaseUnit || 'pack'} (×${u.unitsPerPurchase} ${u.unit})`);
    console.log(`    price $${u.oldPrice} → $${u.newPrice}\n`);
  }

  if (skipped.length > 0) {
    console.log(`─── Skipped (${skipped.length}) — review manually ───`);
    for (const s of skipped) {
      console.log(`  ${s.name || s._id}: ${s.reason}`);
      if (s.currentPrice !== undefined) {
        console.log(`    current price $${s.currentPrice}, computed correct $${s.wouldBe}`);
      }
    }
    console.log();
  }

  if (!DRY_RUN && willUpdate.length > 0) {
    const ops = willUpdate.map(u => ({
      updateOne: {
        filter: { _id: u._id },
        update: { $set: { price: u.newPrice } }
      }
    }));
    const result = await collection.bulkWrite(ops);
    console.log(`✓ Updated ${result.modifiedCount} items.\n`);
  }

  const logPath = path.join(backupDir, 'backfill-log.json');
  fs.writeFileSync(logPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    dryRun: DRY_RUN,
    markup,
    updated: willUpdate,
    skipped
  }, null, 2));
  console.log(`Log saved: ${logPath}`);

  if (DRY_RUN) {
    console.log('\n⚠  DRY RUN — re-run with --execute to apply.');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
