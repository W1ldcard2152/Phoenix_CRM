/**
 * VIN helpers — pure, no I/O.
 *
 * Every vehicle built for the North American market since 1981 carries a check
 * digit in position 9 (49 CFR 565). It catches almost every single-character
 * misread, which is exactly the failure mode of reading a VIN off a photo.
 */

const TRANSLITERATION = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

// Characters a camera + OCR commonly swap, in both directions. Kept short on
// purpose: a random swap passes the mod-11 check ~1 time in 11, so every extra
// pair adds false candidates.
const LOOKALIKES = {
  S: ['5'], 5: ['S'],
  B: ['8'], 8: ['B'],
  Z: ['2'], 2: ['Z'],
  G: ['6'], 6: ['G'],
  D: ['0'], 0: ['D'],
  U: ['V'], V: ['U'],
  1: ['7'], 7: ['1']
};

// Position 10 → model year. The cycle repeats every 30 years.
const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';

/**
 * Uppercase, strip separators, and map I/O/Q (never legal in a VIN) to the
 * digits they are always a misread of.
 */
const normalizeVin = (raw) => {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .toUpperCase()
    .replace(/[\s\-.*]/g, '')
    .replace(/I/g, '1')
    .replace(/[OQ]/g, '0');
};

/** Expected check digit for a 17-char VIN, or null if it has illegal characters. */
const vinCheckDigit = (vin) => {
  if (!vin || vin.length !== 17) return null;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const c = vin[i];
    const value = /\d/.test(c) ? Number(c) : TRANSLITERATION[c];
    if (value === undefined) return null;
    sum += value * WEIGHTS[i];
  }
  const remainder = sum % 11;
  return remainder === 10 ? 'X' : String(remainder);
};

/** Well-formed 17-char VIN whose position-9 check digit is correct. */
const isValidVin = (vin) => VIN_REGEX.test(vin || '') && vinCheckDigit(vin) === vin[8];

/**
 * Every VIN reachable from `vin` by swapping ONE character for a lookalike
 * that passes the check digit. The check-digit position itself is also tried.
 * Returns [] for a VIN that is already valid or not 17 characters.
 */
const lookalikeCorrections = (vin) => {
  if (!vin || vin.length !== 17 || isValidVin(vin)) return [];
  const found = new Set();
  for (let i = 0; i < 17; i++) {
    for (const swap of LOOKALIKES[vin[i]] || []) {
      const candidate = vin.slice(0, i) + swap + vin.slice(i + 1);
      if (isValidVin(candidate)) found.add(candidate);
    }
  }
  return [...found];
};

/**
 * Possible model years for a VIN's position-10 code, newest first
 * (e.g. '7' → [2037, 2007]). Only years up to `maxYear` are returned.
 */
const modelYearsFromVin = (vin, maxYear = new Date().getFullYear() + 1) => {
  if (!vin || vin.length !== 17) return [];
  const idx = YEAR_CODES.indexOf(vin[9]);
  if (idx === -1) return [];
  const years = [];
  for (let y = 1980 + idx; y <= maxYear; y += 30) years.unshift(y);
  return years;
};

module.exports = {
  VIN_REGEX,
  normalizeVin,
  vinCheckDigit,
  isValidVin,
  lookalikeCorrections,
  modelYearsFromVin
};
