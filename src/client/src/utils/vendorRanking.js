// Pure helpers for the Parts Purchase Worksheet's vendor ranking and URL→seller
// detection. Kept side-effect-free so they're easy to reason about and test.

// Normalize a URL to its bare hostname (lowercased, no leading "www.").
export function extractHostname(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

// Given a hostname and the tagged customVendors list, return the matching
// vendor's name (or null). Matches exact host or any subdomain of a registered
// hostname (e.g. "parts.napaonline.com" matches "napaonline.com").
export function detectSellerFromUrl(url, vendors = []) {
  const hostname = extractHostname(url);
  if (!hostname) return null;
  for (const vendor of vendors) {
    const hostnames = vendor.hostnames || [];
    for (const h of hostnames) {
      const domain = (h || '').toLowerCase().replace(/^www\./, '');
      if (domain && (hostname === domain || hostname.endsWith('.' + domain))) {
        return vendor.name;
      }
    }
  }
  return null;
}

// Format a hostname into a readable seller suggestion (e.g. "ebay.com" → "Ebay").
export function formatHostnameAsName(hostname) {
  if (!hostname) return '';
  const name = hostname.replace(/\.(com|net|org|co|io)$/i, '');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Does this vendor serve the given vehicle make? `makes: ['all']` (or empty)
// means every make; otherwise the make must be listed (case-insensitive).
export function vendorServesMake(vendor, make) {
  const makes = vendor.makes || [];
  if (makes.length === 0 || makes.includes('all')) return true;
  if (!make) return true; // no make to filter on → don't hard-exclude
  return makes.some(m => (m || '').toLowerCase() === make.toLowerCase());
}

// Rank vendors for a work order's sourcing primer. This FILTERS and SORTS only —
// it never hard-excludes. Vehicle make filters to vendors serving that make (or
// 'all'); the active priority chooses the tier to sort by (cost→costTier,
// time→speedTier, lower = better); sortOrder breaks ties.
export function rankVendors(vendors = [], { priority, make } = {}) {
  const tierKey = priority === 'time' ? 'speedTier' : 'costTier';
  return vendors
    .filter(v => vendorServesMake(v, make))
    .slice()
    .sort((a, b) => {
      const at = a[tierKey] ?? 0;
      const bt = b[tierKey] ?? 0;
      if (at !== bt) return at - bt;                 // lower tier = better
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0); // tiebreaker
    });
}
