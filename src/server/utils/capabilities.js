// Which optional communication channels this deployment can actually use.
//
// The same build serves every tenant — Phoenix's own shop has Twilio and
// SendGrid, a freshly-provisioned shop has neither — so this is derived from
// credentials at boot rather than from a build-time flag. Adding credentials
// and restarting is the only step needed to switch a channel on; no code
// change, no rebuild.
//
// This module is the single source of truth for the gates. twilioService and
// emailService import from here rather than re-deriving them, and it reads
// process.env directly so it stays correct even where those services are
// mocked. It deliberately has no dependencies, so models and controllers can
// require it without dragging in the Twilio/SendGrid SDKs.

// Twilio account SIDs always start with "AC"; a placeholder value throws at
// client construction exactly the way a missing one does, so check the shape
// of the credential rather than mere presence.
const smsEnabled = Boolean(
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN &&
  process.env.TWILIO_ACCOUNT_SID.startsWith('AC')
);

// SendGrid API keys always start with "SG."; setApiKey does not throw on a bad
// one, it just fails opaquely at send time, so apply the same shape check.
const emailEnabled = Boolean(
  process.env.SENDGRID_API_KEY &&
  process.env.SENDGRID_API_KEY.startsWith('SG.') &&
  process.env.EMAIL_FROM
);

/**
 * The capability flags as sent to the client.
 * @returns {{sms: boolean, email: boolean}}
 */
const getCapabilities = () => ({ sms: smsEnabled, email: emailEnabled });

/**
 * Customer communication preferences this deployment can honour, best-first.
 * 'Phone' and 'None' need no credentials, so there is always a valid answer.
 * @returns {string[]}
 */
const availableCommunicationPreferences = () => [
  ...(smsEnabled ? ['SMS'] : []),
  ...(emailEnabled ? ['Email'] : []),
  'Phone',
  'None'
];

/**
 * The preference to give a new customer when nobody picks one — the best
 * channel this deployment can actually reach them on.
 * @returns {string}
 */
const defaultCommunicationPreference = () => availableCommunicationPreferences()[0];

module.exports = {
  smsEnabled,
  emailEnabled,
  getCapabilities,
  availableCommunicationPreferences,
  defaultCommunicationPreference
};
