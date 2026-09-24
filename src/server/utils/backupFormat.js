// The CV Repair backup file: write it, check it, restore it.
//
// A backup is gzipped, newline-delimited Extended JSON — one line per record:
//
//   {"type":"header","format":"cv-repair-backup","version":1,"database":…,"createdAt":…}
//   {"type":"doc","c":"customers","d":{…}}
//   …
//   {"type":"footer","counts":{"customers":148,…},"total":2694}
//
// Extended JSON (canonical mode) is what keeps an ObjectId an ObjectId and a
// Date a Date. Plain JSON turns both into strings, and a restore from it
// quietly breaks every reference between records — which is what the old
// scripts/backup-database.js did.
//
// The footer is written last, so a file cut short by a crash, a full disk or
// a yanked USB stick has none, and is rejected before anything is touched.
//
// Shared by the server (nightly/manual backups, admin restores) and the
// operator CLI (scripts/backup-database.js).

const fs = require('fs');
const zlib = require('zlib');
const readline = require('readline');
const { once } = require('events');
const { pipeline } = require('stream/promises');
// EJSON must come from the SAME driver as the connection the documents are
// read from: mongoose bundles its own mongodb driver (and bson), separate from
// the top-level `mongodb` package, and each bson refuses the other's ObjectIds.
const { mongo } = require('mongoose');

const { EJSON } = mongo.BSON;

const FORMAT = 'cv-repair-backup';
const VERSION = 1;
const TEMP_PREFIX = '__restore_';
const BATCH_SIZE = 500;

// Never backed up, never restored. backuplogs is the record of backups and
// restores themselves — rolling it back would hide the safety backup that
// undoes the restore you just ran.
const EXCLUDED_COLLECTIONS = new Set(['backuplogs']);

const isBackedUp = (name) =>
  !name.startsWith('system.') && !name.startsWith(TEMP_PREFIX) && !EXCLUDED_COLLECTIONS.has(name);

const listBackupCollections = async (db) => {
  const collections = await db.listCollections({ type: 'collection' }, { nameOnly: true }).toArray();
  return collections.map((c) => c.name).filter(isBackedUp).sort();
};

/**
 * Write a complete backup of `db` to the writable stream `out` (gzipped).
 * `meta` is merged into the header — who/what/why, for the person restoring.
 * Resolves to { counts, total } once `out` has flushed.
 */
const writeBackup = async (db, out, meta = {}) => {
  const gzip = zlib.createGzip();
  const finished = pipeline(gzip, out);
  const writeLine = async (obj) => {
    if (!gzip.write(`${EJSON.stringify(obj, { relaxed: false })}\n`)) await once(gzip, 'drain');
  };

  const collections = await listBackupCollections(db);
  await writeLine({
    type: 'header',
    format: FORMAT,
    version: VERSION,
    database: db.databaseName,
    createdAt: new Date(),
    collections,
    ...meta
  });

  const counts = {};
  let total = 0;
  for (const name of collections) {
    counts[name] = 0;
    for await (const doc of db.collection(name).find({})) {
      await writeLine({ type: 'doc', c: name, d: doc });
      counts[name] += 1;
      total += 1;
    }
  }

  await writeLine({ type: 'footer', counts, total });
  gzip.end();
  await finished;
  return { counts, total };
};

// Every line of a backup file, parsed. Throws on a corrupt or truncated gzip.
async function* readRecords(filePath) {
  const gunzip = zlib.createGunzip();
  const source = fs.createReadStream(filePath);
  source.on('error', (err) => gunzip.destroy(err));
  source.pipe(gunzip);
  const lines = readline.createInterface({ input: gunzip, crlfDelay: Infinity });
  let lineNo = 0;
  try {
    for await (const line of lines) {
      lineNo += 1;
      if (!line) continue;
      try {
        yield EJSON.parse(line, { relaxed: false });
      } catch {
        throw new Error(`Backup file is damaged (line ${lineNo} is not readable).`);
      }
    }
  } catch (err) {
    if (/unexpected end of file|incorrect header check|invalid/i.test(err.message)) {
      throw new Error('Backup file is damaged or incomplete — it could not be decompressed.');
    }
    throw err;
  }
}

const checkHeader = (header) => {
  if (!header || header.type !== 'header' || header.format !== FORMAT) {
    throw new Error('This is not a CV Repair backup file.');
  }
  if (Number(header.version) > VERSION) {
    throw new Error(`This backup was made by a newer version of CV Repair (format ${header.version}). Update before restoring it.`);
  }
};

const checkFooter = (footer, seen) => {
  if (!footer) {
    throw new Error('Backup file is incomplete — it ends before the final record count. It may have been cut short while saving.');
  }
  const expected = footer.counts || {};
  const names = new Set([...Object.keys(expected), ...Object.keys(seen)]);
  for (const name of names) {
    // Number(): canonical EJSON reads counts back as Int32 objects.
    if (Number(expected[name] || 0) !== (seen[name] || 0)) {
      throw new Error(`Backup file does not add up: ${name} should have ${Number(expected[name] || 0)} records, found ${seen[name] || 0}.`);
    }
  }
};

/**
 * Read a whole backup file and verify it without touching any database.
 * Returns { header, counts, total }.
 */
const inspectBackup = async (filePath) => {
  let header = null;
  let footer = null;
  const counts = {};
  for await (const record of readRecords(filePath)) {
    if (!header) { checkHeader(record); header = record; continue; }
    if (footer) throw new Error('Backup file is damaged (records after the final count).');
    if (record.type === 'doc') counts[record.c] = (counts[record.c] || 0) + 1;
    else if (record.type === 'footer') footer = record;
  }
  checkHeader(header);
  checkFooter(footer, counts);
  return { header, counts, total: Number(footer.total) };
};

// $out enforces a collection's validator, and skipping it (bypassDocumentValidation)
// is a privilege Atlas does not give an ordinary app user. So check the loaded
// records against each live validator BEFORE anything is swapped in: a failure
// here leaves the shop untouched, where a failure mid-swap would leave some
// collections restored and others not.
const checkValidators = async (db, names) => {
  for (const name of names) {
    const [info] = await db.listCollections({ name }).toArray();
    const validator = info && info.options && info.options.validator;
    if (!validator) continue;
    const failing = await db.collection(TEMP_PREFIX + name).countDocuments({ $nor: [validator] });
    if (failing > 0) {
      throw new Error(`${failing} record(s) in "${name}" don't meet this shop's current data rules, so the backup was not restored. Nothing was changed.`);
    }
  }
};

const dropTempCollections = async (db) => {
  const temps = await db.listCollections({ name: { $regex: `^${TEMP_PREFIX}` } }, { nameOnly: true }).toArray();
  await Promise.all(temps.map((t) => db.collection(t.name).drop().catch(() => {})));
};

/**
 * Replace the contents of `db` with the backup at `filePath`.
 *
 *   1. Load every record into scratch collections, verifying as it goes.
 *      A bad file fails here, with the live data untouched.
 *   2. Swap each collection's contents in with $out — atomic per collection,
 *      and it keeps the collection's existing indexes and validators.
 *   3. Empty collections that didn't exist when the backup was taken.
 *
 * Options:
 *   allowOtherDatabase — restore a backup taken from a different database.
 *     Off by default: that is almost always another shop's data.
 *   preserveUserId — make sure this user still exists afterwards (the admin
 *     running the restore), so a restore from before they were added doesn't
 *     lock them out of the shop.
 *
 * Returns { header, counts, total }.
 */
const restoreBackup = async (db, filePath, { allowOtherDatabase = false, preserveUserId = null } = {}) => {
  await dropTempCollections(db);

  const preservedUser = preserveUserId
    ? await db.collection('users').findOne({ _id: preserveUserId })
    : null;

  let header = null;
  let footer = null;
  const counts = {};
  const batches = new Map();
  const flush = async (name) => {
    const batch = batches.get(name);
    if (batch && batch.length) {
      // Scratch collections have no validator, so nothing to bypass here.
      await db.collection(TEMP_PREFIX + name).insertMany(batch, { ordered: true });
      batches.set(name, []);
    }
  };

  try {
    for await (const record of readRecords(filePath)) {
      if (!header) {
        checkHeader(record);
        header = record;
        if (header.database !== db.databaseName && !allowOtherDatabase) {
          throw new Error(`This backup is from a different database ("${header.database}"), not this shop's ("${db.databaseName}"). It was not restored.`);
        }
        continue;
      }
      if (footer) throw new Error('Backup file is damaged (records after the final count).');
      if (record.type === 'footer') { footer = record; continue; }
      if (record.type !== 'doc') continue;
      if (!isBackedUp(record.c)) continue;

      counts[record.c] = (counts[record.c] || 0) + 1;
      if (!batches.has(record.c)) batches.set(record.c, []);
      const batch = batches.get(record.c);
      batch.push(record.d);
      if (batch.length >= BATCH_SIZE) await flush(record.c);
    }
    checkHeader(header);
    for (const name of batches.keys()) await flush(name);
    checkFooter(footer, counts);
    await checkValidators(db, Object.keys(counts));
  } catch (err) {
    await dropTempCollections(db);
    throw err;
  }

  // The file is complete and verified. Swap it in.
  const inBackup = new Set(Object.keys(footer.counts || {}));
  for (const name of inBackup) {
    if (counts[name]) {
      await db.collection(TEMP_PREFIX + name).aggregate([{ $out: name }]).toArray();
    } else {
      await db.collection(name).deleteMany({});
    }
  }
  for (const name of await listBackupCollections(db)) {
    if (!inBackup.has(name)) await db.collection(name).deleteMany({});
  }
  await dropTempCollections(db);

  if (preservedUser && !(await db.collection('users').findOne({ _id: preservedUser._id }))) {
    try {
      await db.collection('users').insertOne(preservedUser);
    } catch (err) {
      // Duplicate email: an account with the same email came back with the
      // backup, so they can still sign in. Anything else is a real problem.
      if (err.code !== 11000) throw err;
    }
  }

  return { header, counts, total: Number(footer.total) };
};

module.exports = {
  FORMAT,
  VERSION,
  EXCLUDED_COLLECTIONS,
  listBackupCollections,
  writeBackup,
  inspectBackup,
  restoreBackup
};
