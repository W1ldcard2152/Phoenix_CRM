import { detectSellerFromUrl } from '../../utils/vendorRanking';

/**
 * Reduce a product URL to the hostname used as a tax-rule key.
 *
 *   https://www.walmart.com/ip/12345  ->  walmart.com
 *   walmart.com/whatever              ->  walmart.com
 *
 * Tolerates a missing scheme because that is how people paste URLs, and drops
 * "www." so the same storefront doesn't produce two rules. Deliberately keeps
 * the full remaining host — shop.example.com and example.com may genuinely be
 * different sellers, and merging them would be a guess.
 */
export const hostnameOf = (url) => {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    const host = new URL(withScheme).hostname.toLowerCase();
    return host.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/**
 * The vendor directory's URL matcher expects a parseable absolute URL, and
 * `new URL()` throws on the scheme-less form people actually paste. Reduce to a
 * canonical `https://host` first so the shared matcher — which owns the
 * hostname→vendor mapping in Settings — stays the single source of truth
 * instead of this module growing a second one.
 */
export const canonicalUrl = (url) => {
  const host = hostnameOf(url);
  return host ? `https://${host}` : '';
};

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
  const canonical = canonicalUrl(url);
  if (!canonical) return null;

  const name = detectSellerFromUrl(canonical, directoryVendors);
  if (!name) return null;

  const entry = vocab.find((v) => v.fieldKey === 'vendor'
    && (v.label || v.value || '').toLowerCase() === name.toLowerCase());

  return { id: entry ? String(entry._id) : null, name };
};

export default hostnameOf;
