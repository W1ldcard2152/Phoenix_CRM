// Helpers for gating the customer "Communication Preference" field on what the
// deployment can actually send. SMS and Email need credentials; Phone and None
// never do. See `useCapabilities()` in contexts/CompanyContext for the flags.
//
// The three customer forms word their options differently ("SMS" vs "SMS/Text",
// "None" vs "No Contact"), so these take an option list rather than producing
// one — each form keeps its own labels.

const CREDENTIALED = { SMS: 'sms', Email: 'email' };

/**
 * Drop options whose channel this deployment has no credentials for.
 *
 * `currentValue` is always kept, even if unavailable: a customer already set to
 * SMS at a shop that has since turned SMS off must not be silently rewritten to
 * something else the next time someone edits their record.
 *
 * @param {Array<{value: string, label: string}>} options
 * @param {{sms: boolean, email: boolean}} capabilities
 * @param {string} [currentValue]
 * @returns {Array<{value: string, label: string}>}
 */
export const filterCommunicationOptions = (options, capabilities, currentValue) =>
  options.filter(({ value }) => {
    if (value === currentValue) return true;
    const flag = CREDENTIALED[value];
    return !flag || Boolean(capabilities?.[flag]);
  });

/**
 * Best channel to pre-select for a new customer: the most direct one the shop
 * can actually reach them on. Mirrors defaultCommunicationPreference() on the
 * server so an API-created customer and a form-created one agree.
 *
 * @param {{sms: boolean, email: boolean}} capabilities
 * @returns {string}
 */
export const defaultCommunicationPreference = (capabilities) => {
  if (capabilities?.sms) return 'SMS';
  if (capabilities?.email) return 'Email';
  return 'Phone';
};
