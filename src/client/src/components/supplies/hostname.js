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

export default hostnameOf;
