/**
 * Database Backup Script
 *
 * Exports all collections from the MongoDB Atlas database to timestamped JSON files.
 * Uses the existing mongoose/mongodb driver — no additional tools required.
 *
 * Usage:
 *   node scripts/backup-database.js
 *
 * Backups are saved to: backups/YYYY-MM-DD_HH-MM-SS/
 *
 * To restore a specific collection:
 *   node scripts/backup-database.js --restore backups/2026-02-15_14-30-00/customers.json
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BACKUP_DIR = path.resolve(__dirname, '../backups');

async function connectToDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('ERROR: MONGODB_URI not found in .env');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  console.log('Connected successfully.');
  return mongoose.connection.db;
}

async function backupAll() {
  const db = await connectToDatabase();

  // Create timestamped backup directory
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/T/, '_')
    .replace(/:/g, '-')
    .replace(/\..+/, '');
  const backupPath = path.join(BACKUP_DIR, timestamp);
  fs.mkdirSync(backupPath, { recursive: true });

  // Get all collection names
  const collections = await db.listCollections().toArray();
  const collectionNames = collections.map(c => c.name);

  console.log(`\nFound ${collectionNames.length} collections to back up:`);
  console.log(collectionNames.map(n => `  - ${n}`).join('\n'));
  console.log('');

  let totalDocs = 0;

  for (const name of collectionNames) {
    const collection = db.collection(name);
    const docs = await collection.find({}).toArray();
    const filePath = path.join(backupPath, `${name}.json`);

    fs.writeFileSync(filePath, JSON.stringify(docs, null, 2));
    console.log(`  ${name}: ${docs.length} documents`);
    totalDocs += docs.length;
  }

  console.log(`\nBackup complete: ${totalDocs} total documents across ${collectionNames.length} collections`);
  console.log(`Saved to: ${backupPath}\n`);

  await mongoose.disconnect();
  return backupPath;
}

async function restoreCollection(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: File not found: ${filePath}`);
    process.exit(1);
  }

  const db = await connectToDatabase();
  const collectionName = path.basename(filePath, '.json');
  const docs = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  console.log(`\nWARNING: This will DROP and recreate the "${collectionName}" collection.`);
  console.log(`The collection will be replaced with ${docs.length} documents from the backup.`);
  console.log('Press Ctrl+C within 5 seconds to cancel...\n');

  await new Promise(resolve => setTimeout(resolve, 5000));

  const collection = db.collection(collectionName);
  await collection.drop().catch(() => {}); // Ignore error if collection doesn't exist
  if (docs.length > 0) {
    await collection.insertMany(docs);
  }

  console.log(`Restored ${docs.length} documents to "${collectionName}"`);

  await mongoose.disconnect();
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args[0] === '--restore' && args[1]) {
  restoreCollection(args[1]).catch(err => {
    console.error('Restore failed:', err.message);
    process.exit(1);
  });
} else if (args.length === 0) {
  backupAll().catch(err => {
    console.error('Backup failed:', err.message);
    process.exit(1);
  });
} else {
  console.log('Usage:');
  console.log('  Backup:   node scripts/backup-database.js');
  console.log('  Restore:  node scripts/backup-database.js --restore backups/<timestamp>/<collection>.json');
  process.exit(1);
}
