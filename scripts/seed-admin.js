/**
 * Seed the first admin user into an empty database.
 *
 * Background: a fresh deployment cannot be logged into. Public self-registration
 * is disabled (src/server/routes/authRoutes.js), creating users requires an
 * already-authenticated admin, and Google OAuth rejects any email with no
 * matching user (src/server/config/passport.js). Empty database = locked door.
 * This script is the only way in.
 *
 * Two modes:
 *
 *   Google sign-in (default) — creates a `pending` admin with no password. When
 *   that person signs in with Google, passport matches on email, links their
 *   googleId, and flips them to `active`. The email MUST be a Google account.
 *
 *   Password sign-in (--password) — creates an `active` admin with a password.
 *   Use when the shop does not use Google accounts.
 *
 * Safety: dry run by default, and refuses to touch a database that already has
 * users unless --force is passed. Existing users almost always mean the URI is
 * pointing at the wrong tenant.
 *
 * Usage:
 *   node scripts/seed-admin.js --email owner@shop.com                    # dry run
 *   node scripts/seed-admin.js --email owner@shop.com --execute
 *   node scripts/seed-admin.js --email owner@shop.com --password 'S3cret!!' --execute
 *   node scripts/seed-admin.js --email owner@shop.com --uri "mongodb+srv://..." --execute
 *
 * When provisioning a new tenant, always pass --uri explicitly. Without it the
 * script falls back to MONGODB_URI in your local .env — which is your own
 * production database.
 */

const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

const User = require('../src/server/models/User');

const argValue = (flag) => {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
};

const EMAIL = argValue('--email');
const NAME = argValue('--name');
const PASSWORD = argValue('--password');
const URI = argValue('--uri') || process.env.MONGODB_URI;
const EXECUTE = process.argv.includes('--execute');
const FORCE = process.argv.includes('--force');

if (!EMAIL) {
  console.error('ERROR: --email is required.\n');
  console.error('  node scripts/seed-admin.js --email owner@shop.com [--execute]');
  process.exit(1);
}

if (!URI) {
  console.error('ERROR: no database URI. Pass --uri or set MONGODB_URI in .env');
  process.exit(1);
}

if (PASSWORD && PASSWORD.length < 8) {
  console.error('ERROR: --password must be at least 8 characters (User model minimum).');
  process.exit(1);
}

async function main() {
  await mongoose.connect(URI);

  const { host, name: dbName } = mongoose.connection;
  console.log('');
  console.log(`  Host:     ${host}`);
  console.log(`  Database: ${dbName}`);
  console.log(`  Mode:     ${EXECUTE ? 'EXECUTE (will write)' : 'DRY RUN'}`);
  console.log('');

  // countDocuments bypasses the model's pre-find `active` filter, so this sees
  // soft-deleted users too — which is what we want for an "is this DB empty?" check.
  const existingUsers = await User.countDocuments({});

  if (existingUsers > 0 && !FORCE) {
    console.error(`REFUSING: database already has ${existingUsers} user(s).`);
    console.error('This script is for empty databases. If the URI is correct and you');
    console.error('really mean to add another admin, re-run with --force.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const duplicate = await User.findOne({ email: EMAIL.toLowerCase() });
  if (duplicate) {
    console.error(`REFUSING: a user with email ${EMAIL} already exists.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const doc = {
    name: NAME || EMAIL.split('@')[0],
    email: EMAIL.toLowerCase(),
    role: 'admin',
    status: PASSWORD ? 'active' : 'pending'
  };

  if (PASSWORD) {
    doc.password = PASSWORD;
    doc.passwordConfirm = PASSWORD;
  }

  console.log('Will create admin user:');
  console.log(`  name:   ${doc.name}`);
  console.log(`  email:  ${doc.email}`);
  console.log(`  role:   ${doc.role}`);
  console.log(`  status: ${doc.status}${doc.status === 'pending' ? '  (activates on first Google sign-in)' : ''}`);
  console.log(`  auth:   ${PASSWORD ? 'password' : 'Google OAuth'}`);
  console.log('');

  if (!EXECUTE) {
    console.log('Dry run — nothing written. Re-run with --execute to create.');
    await mongoose.disconnect();
    return;
  }

  // Password hashing happens in the model's pre-save hook, so use create()
  // rather than a raw driver insert.
  const user = await User.create(doc);

  console.log(`Created admin user ${user.email} (_id: ${user._id})`);
  console.log('');
  console.log('Next steps:');
  if (PASSWORD) {
    console.log(`  1. Sign in at the deployment URL with ${user.email} and the password you set.`);
  } else {
    console.log(`  1. Have ${user.email} sign in with Google at the deployment URL.`);
    console.log('     The account activates automatically on first sign-in.');
  }
  console.log('  2. Go to Settings and set the company identity. A new deployment');
  console.log('     defaults to Phoenix Automotive Group branding — name, address,');
  console.log('     and phone — which appears on screen and on printed invoices.');
  console.log('  3. Invite the rest of the staff from the admin panel.');
  console.log('');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(`FAILED: ${err.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
