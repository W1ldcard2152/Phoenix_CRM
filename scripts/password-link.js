/**
 * Issue a one-time "set your password" link for any user of any tenant.
 *
 * For the operator, when a shop's only admin is locked out — the in-app
 * routes to a new password (email, or another admin) aren't available to them.
 * It changes nothing but the user's pending reset token: their current password
 * keeps working until the link is used, and the link works once.
 *
 * Usage:
 *   node scripts/password-link.js --uri "mongodb+srv://…/shop" \
 *     --app-url https://shop-crm.onrender.com --email owner@shop.com [--hours 24]
 *
 * --uri and --app-url are required, with no fallback to your local .env: the
 * database decides whose account this is, the URL decides where the link goes,
 * and both must be the same tenant.
 */

const mongoose = require('mongoose');
const User = require('../src/server/models/User');
const { issuePasswordLink } = require('../src/server/utils/passwordLink');

const argValue = (flag) => {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
};

const URI = argValue('--uri');
const APP_URL = argValue('--app-url');
const EMAIL = (argValue('--email') || '').toLowerCase().trim();
const HOURS = Number(argValue('--hours') || 24);

if (!URI || !APP_URL || !EMAIL) {
  console.error('Usage: node scripts/password-link.js --uri "mongodb+srv://…" --app-url https://… --email user@shop.com [--hours 24]');
  process.exit(1);
}
if (!/^https?:\/\//.test(APP_URL)) {
  console.error('ERROR: --app-url must start with https:// (the tenant\'s own address).');
  process.exit(1);
}
if (!(HOURS > 0 && HOURS <= 72)) {
  console.error('ERROR: --hours must be between 0 and 72.');
  process.exit(1);
}

async function main() {
  await mongoose.connect(URI);
  console.log(`\n  Database: ${mongoose.connection.name} on ${mongoose.connection.host}`);

  const user = await User.findOne({ email: EMAIL });
  if (!user) throw new Error(`No user with email ${EMAIL} in this database.`);
  if (user.status === 'disabled') throw new Error(`${EMAIL} is disabled — re-enable them before issuing a link.`);

  const { url, expiresAt } = await issuePasswordLink(user, { ttlMinutes: HOURS * 60, baseUrl: APP_URL });

  console.log(`  User:     ${user.name} <${user.email}> (${user.role})`);
  console.log(`\n  ${url}\n`);
  console.log(`  Works once, until ${expiresAt.toLocaleString()}. Send it to them directly —`);
  console.log('  anyone holding it can set this account\'s password.\n');
}

main()
  .catch((err) => {
    console.error(`\n  ✗ ${err.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect().catch(() => {}));
