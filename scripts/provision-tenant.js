/**
 * Provision a new CV Repair tenant — interactive wizard.
 *
 *   npm run provision
 *
 * Asks for everything a fresh shop needs, validates it, shows a summary, and
 * only then writes to the tenant's (empty) database:
 *
 *   - Settings: company identity, labor/tax/markup defaults
 *   - The shop-supplies tag tree, measurements and vocabulary
 *   - The company logo, uploaded to the tenant's S3 bucket (optional)
 *   - The owner's admin account — a temporary password, or Google sign-in
 *
 * Then it prints the Render environment block (paste it with "Add from .env")
 * and the owner's sign-in details. Nothing is written until you confirm, and
 * it refuses any database that already holds shop data — or that is the
 * database your local .env points at, which is your own production shop.
 *
 * Re-runnable: the owner account is created last, so if anything fails before
 * that, fix it and run the wizard again against the same database.
 *
 * Collected secrets are printed once and never written to disk. Put them in a
 * password manager.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const readline = require('readline/promises');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const moment = require('moment-timezone');
const { S3Client, HeadBucketCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const Settings = require('../src/server/models/Settings');
const User = require('../src/server/models/User');
const { seedSupplyTags } = require('./seed-supply-tags');

// Read — never exported into process.env — so the wizard can refuse to
// provision on top of the local (production) database and offer to reuse
// shared keys, without anything from .env leaking into the tenant silently.
const localEnv = (() => {
  try {
    return dotenv.parse(fs.readFileSync(path.resolve(__dirname, '../.env')));
  } catch {
    return {};
  }
})();

const LOGO_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const SHOP_DATA_COLLECTIONS = ['users', 'customers', 'vehicles', 'workorders', 'invoices', 'quotes', 'appointments'];

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// ── Prompt helpers ────────────────────────────────────────────────────────────

const ask = async (label, { def, required = false, validate } = {}) => {
  for (;;) {
    const suffix = def !== undefined && def !== '' ? ` [${def}]` : '';
    const raw = (await rl.question(`  ${label}${suffix}: `)).trim();
    const value = raw === '' && def !== undefined ? String(def) : raw;
    if (required && !value) { console.log('    Required.'); continue; }
    if (value && validate) {
      const error = validate(value);
      if (error) { console.log(`    ${error}`); continue; }
    }
    return value;
  }
};

const askYesNo = async (label, def = true) => {
  const answer = (await ask(`${label} (${def ? 'Y/n' : 'y/N'})`)).toLowerCase();
  return answer === '' ? def : answer.startsWith('y');
};

const askNumber = async (label, def) => Number(await ask(label, {
  def,
  validate: (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? null : 'Enter a number, 0 or more.')
}));

const heading = (text) => console.log(`\n── ${text} ${'─'.repeat(Math.max(0, 70 - text.length))}`);

// ── Helpers ───────────────────────────────────────────────────────────────────

// Host + database name, without credentials. Used both to show the operator
// exactly where writes will land and to compare against the local .env.
const describeUri = (uri) => {
  try {
    const u = new URL(uri);
    return { host: u.hostname.toLowerCase(), db: decodeURIComponent(u.pathname.replace(/^\//, '')) };
  } catch {
    return null;
  }
};

const validateUri = (uri) => {
  if (!/^mongodb(\+srv)?:\/\//.test(uri)) return 'Must start with mongodb+srv:// or mongodb://';
  const parsed = describeUri(uri);
  if (!parsed) return 'Could not parse that URI. If the password contains @ / : or #, regenerate it without them.';
  if (/<.*>/.test(uri)) return 'Still contains a <placeholder> — substitute the real password.';
  if (!parsed.db) return 'No database name. Add one after the host: …mongodb.net/shopname?retryWrites=…';
  if (['test', 'admin', 'local', 'config'].includes(parsed.db)) return `"${parsed.db}" is not a tenant database name — pick one specific to this shop.`;
  const prod = localEnv.MONGODB_URI && describeUri(localEnv.MONGODB_URI);
  if (prod && prod.host === parsed.host && prod.db === parsed.db) {
    return 'REFUSED: that is the database your local .env points at — your own production shop.';
  }
  return null;
};

const slugify = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

// Unambiguous characters only (no 0/O, 1/l/I) — this gets read aloud or typed
// off a text message by the owner.
const tempPassword = () => {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(12);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
};

const mask = (secret) => (secret ? `${secret.slice(0, 4)}…${secret.slice(-2)} (${secret.length} chars)` : '(none)');

// ── Wizard ────────────────────────────────────────────────────────────────────

async function collect() {
  const a = {};

  heading('1 of 6 · Tenant database');
  console.log('  The MongoDB connection string for THIS shop\'s own, empty database.');
  a.mongoUri = await ask('MONGODB_URI', { required: true, validate: validateUri });

  process.stdout.write('  Connecting… ');
  await mongoose.connect(a.mongoUri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  const counts = {};
  for (const name of SHOP_DATA_COLLECTIONS) {
    counts[name] = await db.collection(name).countDocuments();
  }
  console.log(`connected to database "${db.databaseName}".`);
  const occupied = Object.entries(counts).filter(([, n]) => n > 0);
  if (occupied.length > 0) {
    throw new Error(`This database already holds shop data (${occupied.map(([c, n]) => `${c}: ${n}`).join(', ')}). `
      + 'Provisioning only ever targets an empty database — check the URI.');
  }
  console.log('  Empty — good.');

  heading('2 of 6 · The shop');
  console.log('  Printed on every invoice and quote. Leave optional lines blank to omit them.');
  a.companyName = await ask('Business name', { required: true });
  a.companyAddressLine1 = await ask('Street address');
  a.companyAddressLine2 = await ask('City, State ZIP');
  a.companyPhone = await ask('Phone');
  a.companyEmail = await ask('Email');
  a.companyWebsite = await ask('Website');
  a.logoPath = await ask('Logo image file (optional — drag the file here)', {
    validate: (p) => {
      const file = p.replace(/^["']|["']$/g, '');
      if (!fs.existsSync(file)) return 'File not found.';
      if (!LOGO_TYPES[path.extname(file).toLowerCase()]) return `Use one of: ${Object.keys(LOGO_TYPES).join(' ')}`;
      return null;
    }
  });
  a.logoPath = a.logoPath.replace(/^["']|["']$/g, '');

  heading('3 of 6 · Shop defaults');
  console.log('  All editable later in Settings.');
  a.timezone = await ask('Timezone', {
    def: 'America/New_York',
    validate: (tz) => (moment.tz.zone(tz) ? null : 'Not a known IANA timezone, e.g. America/Chicago, America/Denver, America/Los_Angeles.')
  });
  a.defaultLaborRate = await askNumber('Labor rate ($/hr)', 75);
  a.taxRate = await askNumber('Sales tax (%)', 8);
  a.partMarkupPercentage = await askNumber('Parts markup (%)', 30);

  heading('4 of 6 · Owner account');
  a.ownerName = await ask('Owner\'s name', { required: true });
  a.ownerEmail = (await ask('Owner\'s email (their sign-in)', {
    required: true,
    validate: (e) => (/^\S+@\S+\.\S+$/.test(e) ? null : 'That doesn\'t look like an email address.')
  })).toLowerCase();
  console.log('  1) Password — you get a temporary password to hand over; they change it in Settings → My Account');
  console.log('  2) Google   — they sign in with that Google account; no password at all');
  a.signIn = (await ask('Sign-in method', { def: '1', validate: (v) => (['1', '2'].includes(v) ? null : 'Enter 1 or 2.') })) === '2' ? 'google' : 'password';
  if (a.signIn === 'password') a.password = tempPassword();

  heading('5 of 6 · Deployment');
  const defaultService = `${slugify(a.companyName)}-crm`;
  a.serviceName = await ask('Render service name (becomes the URL)', {
    def: defaultService,
    validate: (v) => (/^[a-z0-9][a-z0-9-]{1,60}$/.test(v) ? null : 'Lowercase letters, digits and dashes only.')
  });
  a.appUrl = `https://${a.serviceName}.onrender.com`;
  console.log(`  → ${a.appUrl}`);
  console.log('    Render appends a suffix if the name is taken — see the last check in Next steps.');

  console.log('\n  S3 — where photos, receipts and the logo live. Blank to skip (uploads stay off).');
  a.awsBucket = await ask('S3_BUCKET_NAME');
  if (a.awsBucket) {
    a.awsRegion = await ask('AWS_REGION', { def: 'us-east-1', validate: (r) => (/^[a-z]{2}-[a-z]+-\d$/.test(r) ? null : 'e.g. us-east-1') });
    a.awsKeyId = await ask('AWS_ACCESS_KEY_ID', { required: true });
    a.awsSecret = await ask('AWS_SECRET_ACCESS_KEY', { required: true });
    process.stdout.write('  Checking the bucket… ');
    try {
      const s3 = new S3Client({ region: a.awsRegion, credentials: { accessKeyId: a.awsKeyId, secretAccessKey: a.awsSecret } });
      await s3.send(new HeadBucketCommand({ Bucket: a.awsBucket }));
      console.log('reachable with these keys.');
      a.s3Ok = true;
    } catch (err) {
      const status = err.$metadata && err.$metadata.httpStatusCode;
      const why = status === 301 ? 'the bucket is in a different region than AWS_REGION'
        : status === 403 ? 'these keys are not allowed to use this bucket'
          : status === 404 ? 'no bucket by that name'
            : err.message;
      console.log(`FAILED — ${why}.`);
      console.log('    Continuing, but uploads will fail on the live app until this is fixed.');
      a.s3Ok = false;
    }
  }
  if (a.logoPath && !a.s3Ok) {
    console.log('  The logo needs a working S3 bucket, so it will be skipped — upload it later in Settings.');
    a.logoPath = '';
  }

  console.log('\n  Gemini — AI receipt, registration and label reading.');
  a.geminiKey = localEnv.GEMINI_API_KEY && await askYesNo('Reuse the GEMINI_API_KEY from your local .env?')
    ? localEnv.GEMINI_API_KEY
    : await ask('GEMINI_API_KEY (blank to skip)');

  if (a.signIn === 'google' || await askYesNo('\n  Set up "Sign in with Google" for this shop too?', false)) {
    console.log('  One Google OAuth client can serve every shop — each shop just adds its own');
    console.log('  redirect URI to it in the Google Cloud console.');
    const canReuse = localEnv.GOOGLE_CLIENT_ID && localEnv.GOOGLE_CLIENT_SECRET;
    if (canReuse && await askYesNo('Reuse the Google OAuth client from your local .env?')) {
      a.googleClientId = localEnv.GOOGLE_CLIENT_ID;
      a.googleClientSecret = localEnv.GOOGLE_CLIENT_SECRET;
    } else {
      a.googleClientId = await ask('GOOGLE_CLIENT_ID', { required: a.signIn === 'google' });
      a.googleClientSecret = a.googleClientId ? await ask('GOOGLE_CLIENT_SECRET', { required: true }) : '';
    }
    if (a.googleClientId) a.googleCallbackUrl = `${a.appUrl}/api/auth/google/callback`;
  }

  return a;
}

function summarise(a) {
  const { host, db } = describeUri(a.mongoUri);
  heading('6 of 6 · Review');
  const rows = [
    ['Database', `${db}  on  ${host}`],
    ['Business', a.companyName],
    ['Address', [a.companyAddressLine1, a.companyAddressLine2].filter(Boolean).join(', ') || '(none)'],
    ['Phone / email', [a.companyPhone, a.companyEmail].filter(Boolean).join('  ·  ') || '(none)'],
    ['Website', a.companyWebsite || '(none)'],
    ['Logo', a.logoPath ? path.basename(a.logoPath) : '(none — name shows instead)'],
    ['Timezone', a.timezone],
    ['Labor / tax / markup', `$${a.defaultLaborRate}/hr  ·  ${a.taxRate}%  ·  ${a.partMarkupPercentage}%`],
    ['Owner', `${a.ownerName} <${a.ownerEmail}> — ${a.signIn === 'google' ? 'Google sign-in' : 'temporary password'}`],
    ['URL', a.appUrl],
    ['S3', a.awsBucket ? `${a.awsBucket} (${a.awsRegion}) ${a.s3Ok ? '✓' : '✗ not reachable'}` : 'off'],
    ['Gemini', a.geminiKey ? mask(a.geminiKey) : 'off'],
    ['Google sign-in', a.googleClientId ? 'on' : 'off'],
    ['SMS / email', 'off — add Twilio / SendGrid later, no rebuild needed']
  ];
  rows.forEach(([k, v]) => console.log(`  ${k.padEnd(22)}${v}`));
}

async function write(a) {
  heading('Writing');

  const settings = await Settings.getSettings();
  Object.assign(settings, {
    companyName: a.companyName,
    companyAddressLine1: a.companyAddressLine1,
    companyAddressLine2: a.companyAddressLine2,
    companyPhone: a.companyPhone,
    companyEmail: a.companyEmail,
    companyWebsite: a.companyWebsite,
    defaultLaborRate: a.defaultLaborRate,
    taxRate: a.taxRate,
    partMarkupPercentage: a.partMarkupPercentage
  });
  await settings.save();
  console.log('  ✓ Shop settings');

  const report = await seedSupplyTags({ dryRun: false });
  console.log(`  ✓ Supplies tag tree — ${report.nodeCount} categories, ${report.fieldsCreated.length + report.fieldsUnchanged.length} measurements`);
  if (String(report.validator).startsWith('SKIPPED')) {
    console.log('    (schema validator skipped — the DB user lacks dbAdmin; harmless, the app enforces it)');
  }

  if (a.logoPath) {
    const ext = path.extname(a.logoPath).toLowerCase();
    const key = `${crypto.randomUUID()}-logo${ext}`;
    const s3 = new S3Client({ region: a.awsRegion, credentials: { accessKeyId: a.awsKeyId, secretAccessKey: a.awsSecret } });
    await s3.send(new PutObjectCommand({ Bucket: a.awsBucket, Key: key, Body: fs.readFileSync(a.logoPath), ContentType: LOGO_TYPES[ext] }));
    settings.companyLogoKey = key;
    settings.companyLogoUrl = `/api/settings/company-logo?v=${encodeURIComponent(key)}`;
    await settings.save();
    console.log('  ✓ Logo uploaded');
  }

  // Last, so a failure anywhere above leaves the database re-runnable.
  const owner = { name: a.ownerName, email: a.ownerEmail, role: 'admin' };
  if (a.signIn === 'password') {
    Object.assign(owner, { status: 'active', password: a.password, passwordConfirm: a.password });
  } else {
    owner.status = 'pending';
  }
  await User.create(owner);
  console.log(`  ✓ Owner account (${a.signIn === 'password' ? 'active' : 'activates on first Google sign-in'})`);
}

function handover(a) {
  const env = [
    ['NODE_ENV', 'production'],
    ['NODE_VERSION', '22'],
    ['MONGODB_URI', a.mongoUri],
    ['JWT_SECRET', crypto.randomBytes(48).toString('hex')],
    ['JWT_EXPIRES_IN', '90d'],
    ['JWT_COOKIE_EXPIRES_IN', '90'],
    ['CLIENT_URL', a.appUrl],
    ['TIMEZONE', a.timezone],
    ['REACT_APP_TIMEZONE', a.timezone],
    ['AWS_ACCESS_KEY_ID', a.awsKeyId],
    ['AWS_SECRET_ACCESS_KEY', a.awsSecret],
    ['AWS_REGION', a.awsRegion],
    ['S3_BUCKET_NAME', a.awsBucket],
    ['GEMINI_API_KEY', a.geminiKey],
    ['GOOGLE_CLIENT_ID', a.googleClientId],
    ['GOOGLE_CLIENT_SECRET', a.googleClientSecret],
    ['GOOGLE_CALLBACK_URL', a.googleCallbackUrl]
  ].filter(([, v]) => v);

  heading('Render environment — copy everything between the lines');
  console.log('  Render → New Web Service → Environment → "Add from .env", and paste:\n');
  console.log('-'.repeat(72));
  env.forEach(([k, v]) => console.log(`${k}=${v}`));
  console.log('-'.repeat(72));
  console.log('  This contains secrets and is not saved anywhere. Store it in your password');
  console.log('  manager now — the MONGODB_URI is needed again for every backup and restore.');

  heading('Next steps');
  const steps = [
    `Render → New → Web Service → this repo. Name: ${a.serviceName}  ·  Branch: main`,
    '  Build: npm run install:all && npm run build   ·   Start: npm start',
    '  Instance: Starter ($7/mo) — Free sleeps when idle and wakes in ~40s, which reads as broken.',
    'Paste the environment block above, then Create Web Service.',
    `Confirm Render gave you ${a.appUrl}. If it added a suffix, change CLIENT_URL${a.googleCallbackUrl ? ' and GOOGLE_CALLBACK_URL' : ''} to the real URL.`
  ];
  if (a.googleCallbackUrl) {
    steps.push(`Google Cloud console → Credentials → the OAuth client → add redirect URI:\n       ${a.googleCallbackUrl}`);
    steps.push(`While the OAuth app is in Testing, add ${a.ownerEmail} as a test user.`);
  }
  steps.push(`Sign in yourself once as the owner, print an invoice to PDF, and check it says ${a.companyName}.`);
  steps.push('Run the acceptance test: docs/onboarding-acceptance-test.md');
  let n = 0;
  steps.forEach((s) => console.log(s.startsWith('  ') ? `     ${s.trim()}` : `  ${++n}. ${s}`));

  heading(`For ${a.ownerName}`);
  console.log(`  Sign in at:  ${a.appUrl}`);
  if (a.signIn === 'password') {
    console.log(`  Email:       ${a.ownerEmail}`);
    console.log(`  Password:    ${a.password}   (temporary)`);
    console.log('  Then change it: the ⚙ next to your name (bottom of the sidebar) → Settings');
    console.log('                  → My Account → Change Password.');
  } else {
    console.log(`  Use "Sign in with Google" with ${a.ownerEmail}.`);
  }
  console.log('');
}

async function main() {
  console.log('\nCV Repair — provision a new shop');
  console.log('Nothing is written until you confirm at the end. Ctrl+C to abandon at any point.');

  const answers = await collect();
  summarise(answers);

  const { db } = describeUri(answers.mongoUri);
  const confirm = await ask(`\n  Type the database name (${db}) to write this tenant, or anything else to abandon`);
  if (confirm !== db) {
    console.log('\n  Abandoned — nothing was written.');
    return;
  }

  await write(answers);
  handover(answers);
}

main()
  .catch((err) => {
    console.error(`\n  ✗ ${err.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    rl.close();
    await mongoose.disconnect().catch(() => {});
  });
