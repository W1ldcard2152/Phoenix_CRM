/**
 * Unit tests for the security helper utilities introduced in the hardening
 * sweep: the SSRF guard (used by AI URL extraction) and the shared regex
 * escaper (used by all user-input search queries).
 */

const { isBlockedIp, assertSafeUrl } = require('../../utils/ssrfGuard');
const escapeRegex = require('../../utils/escapeRegex');

describe('ssrfGuard.isBlockedIp', () => {
  it.each([
    '127.0.0.1',        // loopback
    '10.0.0.5',         // private
    '172.16.5.4',       // private
    '172.31.255.255',   // private (upper end of /12)
    '192.168.1.1',      // private
    '169.254.169.254',  // link-local / cloud metadata
    '100.64.0.1',       // carrier-grade NAT
    '::1',              // IPv6 loopback
    '::ffff:127.0.0.1', // IPv4-mapped loopback
    'fe80::1',          // IPv6 link-local
    'fc00::1',          // IPv6 unique-local
  ])('blocks internal/reserved address %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '172.32.0.1',       // just outside the 172.16/12 private block
    '93.184.216.34',    // example.com
  ])('allows public address %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });
});

describe('ssrfGuard.assertSafeUrl', () => {
  it('rejects non-http(s) schemes', async () => {
    await expect(assertSafeUrl('ftp://example.com/x')).rejects.toMatchObject({ statusCode: 400 });
    await expect(assertSafeUrl('file:///etc/passwd')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects malformed URLs', async () => {
    await expect(assertSafeUrl('not a url')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects IP-literal hosts in reserved ranges', async () => {
    await expect(assertSafeUrl('http://169.254.169.254/latest/meta-data/'))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(assertSafeUrl('http://127.0.0.1:5000/'))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('allows a public https URL', async () => {
    await expect(assertSafeUrl('https://example.com/page?a=1&b=2')).resolves.toBeUndefined();
  });
});

describe('escapeRegex', () => {
  it('escapes regex metacharacters', () => {
    expect(escapeRegex('a+b')).toBe('a\\+b');
    expect(escapeRegex('(a+)+$')).toBe('\\(a\\+\\)\\+\\$');
    expect(escapeRegex('a.b*c?')).toBe('a\\.b\\*c\\?');
  });

  it('leaves ordinary search text untouched', () => {
    expect(escapeRegex('Bosch 0986')).toBe('Bosch 0986');
  });

  it('coerces non-strings to empty string', () => {
    expect(escapeRegex(undefined)).toBe('');
    expect(escapeRegex(null)).toBe('');
    expect(escapeRegex(42)).toBe('');
  });
});
