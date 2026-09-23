// One-time "set your password" links.
//
// The same link serves three purposes, and all three go through here:
//   - Forgot password, when the deployment can send email (10-minute link)
//   - An admin handing a link to a staff member — a forgotten password, or a
//     newly invited user on a shop that signs in with passwords (24 hours)
//   - scripts/password-link.js, for when a shop's only admin is locked out
//
// The link opens the client's /reset-password/:token page, which PATCHes
// /api/users/resetPassword/:token. Only the token's hash is stored.

const SELF_SERVICE_MINUTES = 10;
const ADMIN_ISSUED_MINUTES = 24 * 60;

// CLIENT_URL is the deployment's own origin in production (the server serves
// the client). Falls back to the request's host for a deployment missing it.
const appBaseUrl = (req) =>
  (process.env.CLIENT_URL || (req ? `${req.protocol}://${req.get('host')}` : '')).replace(/\/+$/, '');

/**
 * Issue a link for `user` and persist the token. Returns { url, expiresAt }.
 */
const issuePasswordLink = async (user, { ttlMinutes = SELF_SERVICE_MINUTES, baseUrl }) => {
  const token = user.createPasswordResetToken(ttlMinutes);
  await user.save({ validateBeforeSave: false });
  return {
    url: `${baseUrl.replace(/\/+$/, '')}/reset-password/${token}`,
    expiresAt: user.passwordResetExpires
  };
};

const clearPasswordLink = async (user) => {
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save({ validateBeforeSave: false });
};

module.exports = {
  SELF_SERVICE_MINUTES,
  ADMIN_ISSUED_MINUTES,
  appBaseUrl,
  issuePasswordLink,
  clearPasswordLink
};
