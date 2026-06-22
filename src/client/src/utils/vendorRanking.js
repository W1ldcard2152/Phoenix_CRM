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
//
// An UNSET tier (0 or blank) ranks LAST, not first — so a newly-added vendor with
// no tiers yet doesn't jump above an established, ranked list. Among unset (and
// among equal) tiers, sortOrder breaks the tie.
// `usage` ('parts' | 'inventory') filters to vendors tagged for that use; vendors
// missing usedFor are treated as parts vendors (back-compat). Omit usage to skip.
export function rankVendors(vendors = [], { priority, make, usage } = {}) {
  const tierKey = priority === 'time' ? 'speedTier' : 'costTier';
  const effectiveTier = (v) => {
    const t = v[tierKey];
    return (t == null || t === 0) ? Number.POSITIVE_INFINITY : t; // unset → worst
  };
  const servesUsage = (v) => !usage || (v.usedFor && v.usedFor.length ? v.usedFor : ['parts']).includes(usage);
  return vendors
    .filter(v => servesUsage(v) && vendorServesMake(v, make))
    .slice()
    .sort((a, b) => {
      const at = effectiveTier(a);
      const bt = effectiveTier(b);
      if (at !== bt) return at - bt;                 // lower tier = better; unset last
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0); // tiebreaker
    });
}
