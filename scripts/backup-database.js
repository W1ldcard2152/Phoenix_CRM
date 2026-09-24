/**
 * Operator backup & restore — any tenant, from your own machine.
 *
 * Shop admins back up and restore from Administration → Backups. This is for
 * you: a tenant whose app is down, a database moving to a new cluster, or a
 * restore from a file a shop sent you.
 *
 * Usage:
 *   node scripts/backup-database.js --uri "mongodb+srv://…/shop"                   # back up
 *   node scripts/backup-database.js --uri "…" --out D:\backups                     # …to a folder
 *   node scripts/backup-database.js --uri "…" --inspect file.cvbackup              # check a file
 *   node scripts/backup-database.js --uri "…" --restore file.cvbackup              # dry run
 *   node scripts/backup-database.js --uri "…" --restore file.cvbackup --execute    # restore
 *
 * --uri is always required — there is deliberately no fallback to .env, which
 * points at your own production shop. A restore takes a safety backup of the
 * current data into --out (default ./backups) first, and refuses a file from a
 * different database unless --allow-other-database is passed (e.g. moving a
 * shop to a new cluster under a new database name).
 *
 * Files use the .cvbackup format shared with the app (src/server/utils/
 * backupFormat.js), so a file downloaded from a shop's Backups page restores
 * here and vice versa. The folders of per-collection .json files this script
 * used to write are NOT restorable — that format lost every ObjectId and date.
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const moment = require('moment');
const { writeBackup, inspectBackup, restoreBackup } = require('../src/server/utils/backupFormat');

const argValue = (flag) => {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
};

const URI = argValue('--uri');
const OUT_DIR = path.resolve(argValue('--out') || path.join(__dirname, '../backups'));
const RESTORE_FILE = argValue('--restore');
const INSPECT_FILE = argValue('--inspect');
const EXECUTE = process.argv.includes('--execute');
const ALLOW_OTHER_DB = process.argv.includes('--allow-other-database');

const printCounts = (counts) => {
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, n]) => console.log(`  ${String(n).padStart(7)}  ${name}`));
};

const backupTo = async (db, reason) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `cvrepair-${db.databaseName}-${moment().format('YYYY-MM-DD-HHmmss')}-${reason}.cvbackup`);
  const { total } = await writeBackup(db, fs.createWriteStream(file), { kind: reason, takenBy: 'operator CLI' });
  await inspectBackup(file);
  return { file, total };
};

async function main() {
  if (INSPECT_FILE) {
    const { header, counts, total } = await inspectBackup(INSPECT_FILE);
    console.log(`\n  Valid backup of "${header.database}", taken ${header.createdAt.toISOString()} (${header.kind || 'unknown kind'})`);
    console.log(`  ${total} records:\n`);
    printCounts(counts);
    return;
  }

  if (!URI) {
    console.error('ERROR: --uri is required (no fallback to .env — that is your production shop).');
    console.error('  node scripts/backup-database.js --uri "mongodb+srv://…/shop" [--restore file.cvbackup [--execute]]');
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  console.log(`\n  Database: ${db.databaseName} on ${mongoose.connection.host}`);

  if (!RESTORE_FILE) {
    const { file, total } = await backupTo(db, 'operator');
    console.log(`  Backed up ${total} records → ${file}\n`);
    return;
  }

  const { header, counts, total } = await inspectBackup(RESTORE_FILE);
  console.log(`  Backup:   "${header.database}", taken ${header.createdAt.toISOString()}, ${total} records`);
  if (header.database !== db.databaseName && !ALLOW_OTHER_DB) {
    throw new Error(`That backup is from "${header.database}", not "${db.databaseName}". `
      + 'Pass --allow-other-database only if you are deliberately moving a shop between databases.');
  }
  console.log('\n  Restoring replaces ALL data in this database with:\n');
  printCounts(counts);

  if (!EXECUTE) {
    console.log('\n  Dry run — nothing changed. Add --execute to restore.\n');
    return;
  }

  const safety = await backupTo(db, 'pre-restore');
  console.log(`\n  Safety backup of current data: ${safety.file}`);
  const result = await restoreBackup(db, RESTORE_FILE, { allowOtherDatabase: ALLOW_OTHER_DB });
  console.log(`  Restored ${result.total} records.`);
  console.log('\n  RESTART the app service now — it caches data in memory. To undo, restore the');
  console.log('  safety backup above the same way.\n');
}

main()
  .catch((err) => {
    console.error(`\n  ✗ ${err.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect().catch(() => {}));
