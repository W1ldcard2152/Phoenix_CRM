import { detectSellerFromUrl, extractHostname } from '../../utils/vendorRanking';

/**
 * Reduce a product URL to the hostname used as a tax-rule key.
 *
 *   https://www.walmart.com/ip/12345  ->  walmart.com
 *   walmart.com/whatever              ->  walmart.com
 *
 * A thin alias over the shared helper so supplies and the parts worksheet agree
 * on what "the same vendor" means — two hostname functions would eventually
 * disagree about a trailing dot or a subdomain and produce two rules for one
 * storefront. Returns '' rather than null because it is used as an object key.
 */
export const hostnameOf = (url) => extractHostname(url) || '';

/**
 * Resolve a product URL to a supply vendor.
 *
 * Two lookups chained: the shared directory maps hostname → vendor NAME (that
 * mapping lives in Settings and is shared with the parts worksheet), then that
 * name is matched against the supplies vendor vocabulary to get an id.
 *
 * A directory hit with no matching vocab entry returns `{ id: null, name }` so
 * the caller can offer to add it — the shop clearly buys from them, they just
 * haven't been used for supplies yet. Inventing the vocab entry silently would
 * break the rule that nothing enters the vocabulary without a person saying so.
 *
 * @returns {{ id: string|null, name: string }|null}
 */
export const detectVendor = (url, directoryVendors = [], vocab = []) => {
  const name = detectSellerFromUrl(url, directoryVendors);
  if (!name) return null;

  const entry = vocab.find((v) => v.fieldKey === 'vendor'
    && (v.label || v.value || '').toLowerCase() === name.toLowerCase());

  return { id: entry ? String(entry._id) : null, name };
};

export default hostnameOf;
