/**
 * Migration Script: Fix Invoice Dates (UTC midnight → Business Timezone midnight)
 *
 * Problem: invoiceDate and dueDate were previously saved at midnight UTC (00:00:00.000Z)
 * via parseLocalDate(), causing them to display as the previous day in America/New_York.
 *
 * Fix: Shift affected dates so they represent midnight in America/New_York instead.
 * Only touches dates whose time component is exactly 00:00:00.000 UTC (the fingerprint
 * of the old parseLocalDate bug). Dates with other times are timestamps and are left alone.
 *
 * Usage:
 *   node scripts/migrate-invoice-dates.js              # dry run (default)
 *   node scripts/migrate-invoice-dates.js --execute     # actually write changes
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const moment = require('moment-timezone');
const dotenv = require('dotenv');

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

const TIMEZONE = process.env.TIMEZONE || 'America/New_York';
const MONGODB_URI = process.env.MONGODB_URI;
const DRY_RUN = !process.argv.includes('--execute');

if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI not found in .env');
  process.exit(1);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Check if a Date is at exactly midnight UTC (the old bug fingerprint).
 */
function isMidnightUTC(date) {
  if (!date || !(date instanceof Date)) return false;
  return date.getUTCHours() === 0 &&
         date.getUTCMinutes() === 0 &&
         date.getUTCSeconds() === 0 &&
         date.getUTCMilliseconds() === 0;
}

/**
 * Shift a midnight-UTC date to midnight in the business timezone.
 * Preserves the calendar date: 2026-03-01T00:00Z → 2026-03-01T05:00Z (EST)
 */
function shiftToBusinessTz(date) {
  const dateStr = moment.utc(date).format('YYYY-MM-DD');
  return moment.tz(dateStr, 'YYYY-MM-DD', TIMEZONE).toDate();
}

// ─── Backup ────────────────────────────────────────────────────────────────────

async function backupDatabase(db) {
  const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
  const backupDir = path.resolve(__dirname, '../backups', timestamp);
  fs.mkdirSync(backupDir, { recursive: true });

  const collections = await db.listCollections().toArray();
  console.log(`\nBacking up ${collections.length} collections to ${backupDir} ...`);

  for (const col of collections) {
    const name = col.name;
    const docs = await db.collection(name).find({}).toArray();
    const filePath = path.join(backupDir, `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(docs, null, 2));
    console.log(`  ✓ ${name} (${docs.length} documents)`);
  }

  console.log(`Backup complete: ${backupDir}\n`);
  return backupDir;
}

// ─── Migration ─────────────────────────────────────────────────────────────────

async function migrateInvoices(db) {
  const collection = db.collection('invoices');
  const invoices = await collection.find({}).toArray();

  console.log(`Found ${invoices.length} total invoices. Scanning for midnight-UTC dates...\n`);

  let updatedCount = 0;
  const changes = [];

  for (const invoice of invoices) {
    const updates = {};
    const changeLog = { _id: invoice._id, invoiceNumber: invoice.invoiceNumber };
    let needsUpdate = false;

    // Check invoiceDate
    if (invoice.invoiceDate && isMidnightUTC(new Date(invoice.invoiceDate))) {
      const oldDate = new Date(invoice.invoiceDate);
      const newDate = shiftToBusinessTz(oldDate);
      updates.invoiceDate = newDate;
      changeLog.invoiceDate = {
        old: oldDate.toISOString(),
        new: newDate.toISOString()
      };
      needsUpdate = true;
    }

    // Check dueDate
    if (invoice.dueDate && isMidnightUTC(new Date(invoice.dueDate))) {
      const oldDate = new Date(invoice.dueDate);
      const newDate = shiftToBusinessTz(oldDate);
      updates.dueDate = newDate;
      changeLog.dueDate = {
        old: oldDate.toISOString(),
        new: newDate.toISOString()
      };
      needsUpdate = true;
    }

    if (needsUpdate) {
      changes.push(changeLog);

      if (!DRY_RUN) {
        await collection.updateOne(
          { _id: invoice._id },
          { $set: updates }
        );
      }
      updatedCount++;
    }
  }

  return { updatedCount, changes };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Invoice Date Migration: UTC midnight → Business TZ');
  console.log(`  Timezone: ${TIMEZONE}`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no changes will be written)' : 'EXECUTE (writing changes)'}`);
  console.log('═══════════════════════════════════════════════════════════');

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB.');

  const db = mongoose.connection.db;

  // Step 1: Full database backup
  const backupDir = await backupDatabase(db);

  // Step 2: Migrate invoice dates
  console.log('─── Invoice Date Migration ───');
  const { updatedCount, changes } = await migrateInvoices(db);

  // Report
  if (changes.length === 0) {
    console.log('No invoices with midnight-UTC dates found. Nothing to migrate.');
  } else {
    console.log(`\n${DRY_RUN ? 'Would update' : 'Updated'} ${updatedCount} invoice(s):\n`);
    for (const change of changes) {
      console.log(`  Invoice ${change.invoiceNumber || change._id}:`);
      if (change.invoiceDate) {
        console.log(`    invoiceDate: ${change.invoiceDate.old} → ${change.invoiceDate.new}`);
      }
      if (change.dueDate) {
        console.log(`    dueDate:     ${change.dueDate.old} → ${change.dueDate.new}`);
      }
    }
  }

  // Save migration log
  const logPath = path.join(backupDir, 'migration-log.json');
  fs.writeFileSync(logPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    timezone: TIMEZONE,
    dryRun: DRY_RUN,
    totalInvoices: (await db.collection('invoices').countDocuments()),
    migratedCount: updatedCount,
    changes
  }, null, 2));
  console.log(`\nMigration log saved to: ${logPath}`);

  if (DRY_RUN) {
    console.log('\n⚠  This was a DRY RUN. To apply changes, re-run with --execute');
  } else {
    console.log('\n✓  Migration complete.');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
