// SSRF guard: validate that a user-supplied URL is safe to fetch server-side.
// Blocks non-http(s) schemes and any hostname that resolves to a private,
// loopback, link-local, or otherwise reserved IP range (incl. cloud metadata
// at 169.254.169.254 and IPv4-mapped IPv6). Used by the AI URL-extraction
// feature, which fetches arbitrary product pages on the user's behalf.
//
// Note: this mitigates SSRF by checking every address a host resolves to (and
// re-checking on each redirect). It does not fully prevent DNS-rebinding TOCTOU
// attacks — acceptable here because the endpoint is authenticated office-staff
// only. See SECURITY.md.

const dns = require('dns').promises;
const net = require('net');
const { URL } = require('url');
const AppError = require('./appError');

const ipToLong = (ip) =>
  ip.split('.').reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);

// IPv4 ranges that must never be fetched (CIDR base + prefix length)
const V4_BLOCKED = [
  ['0.0.0.0', 8],       // "this" network
  ['10.0.0.0', 8],      // private
  ['100.64.0.0', 10],   // carrier-grade NAT
  ['127.0.0.0', 8],     // loopback
  ['169.254.0.0', 16],  // link-local (incl. cloud metadata 169.254.169.254)
  ['172.16.0.0', 12],   // private
  ['192.0.0.0', 24],    // IETF protocol assignments
  ['192.0.2.0', 24],    // TEST-NET-1
  ['192.168.0.0', 16],  // private
  ['198.18.0.0', 15],   // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24],  // TEST-NET-3
  ['224.0.0.0', 4],     // multicast
  ['240.0.0.0', 4]      // reserved
];

const inV4Range = (ip) => {
  const addr = ipToLong(ip);
  return V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (addr & mask) === (ipToLong(base) & mask);
  });
};

const isBlockedIp = (ip) => {
  if (net.isIPv4(ip)) return inV4Range(ip);
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true; // loopback / unspecified
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
    if (mapped) return inV4Range(mapped[1]);
    if (/^f[cd]/.test(lower)) return true;    // fc00::/7 unique-local
    if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 link-local
    if (/^ff/.test(lower)) return true;       // ff00::/8 multicast
    return false;
  }
  return true; // unknown format — block by default
};

// Throws AppError(400) if the URL is unsafe to fetch. Resolves silently if safe.
const assertSafeUrl = async (rawUrl) => {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (err) {
    throw new AppError('Invalid URL', 400);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError('Only http and https URLs are allowed', 400);
  }

  const hostname = parsed.hostname;

  // Hostname is already an IP literal — check it directly
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new AppError('URL resolves to a disallowed address', 400);
    }
    return;
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch (err) {
    throw new AppError('Could not resolve URL host', 400);
  }

  if (!addresses.length) {
    throw new AppError('Could not resolve URL host', 400);
  }

  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      throw new AppError('URL resolves to a disallowed (internal) address', 400);
    }
  }
};

module.exports = { assertSafeUrl, isBlockedIp };
