import { idOf } from './tagTree';

/**
 * Unit naming for the supply forms.
 *
 * Two rules, both learned the hard way:
 *
 * 1. Never say "unit" on its own. There are two of them — the STOCK unit you
 *    use and the PURCHASE unit you order — and a bare "unit" is ambiguous
 *    exactly where the distinction matters. Unqualified fallbacks read as
 *    "Cost per unit" and leave the reader guessing which.
 *
 * 2. Never build a plural by appending "s". "each" is the most common unit in
 *    the shop and pluralises to "each", so the naive form produced "eachs per
 *    each" and "how many eachs on hand".
 */

// Units that are already plural, or are abbreviations that never take one.
const INVARIANT = new Set(['each', 'ft', 'lb', 'lbs', 'oz', 'in', 'ml', 'l', 'kg', 'g', 'cc']);

/**
 * @param {string} word
 * @param {number} [count] - 1 returns the singular; anything else pluralises
 */
export const pluralize = (word, count = 2) => {
  const w = String(word || '').trim();
  if (!w || count === 1) return w;
  if (INVARIANT.has(w.toLowerCase())) return w;
  if (/(s|x|z|ch|sh)$/i.test(w)) return `${w}es`;
  if (/[^aeiou]y$/i.test(w)) return `${w.slice(0, -1)}ies`;
  return `${w}s`;
};

/** Resolve a vocab id to its display label, or null when unset/unknown. */
export const unitLabel = (vocab, id) => {
  const entry = (vocab || []).find((v) => String(v._id) === idOf(id));
  return entry ? (entry.label || entry.value) : null;
};

/**
 * The word to print for a unit, qualified when none has been chosen.
 *
 * `kind` is 'stock' or 'purchase' — that qualifier is what stops an unset unit
 * rendering as the ambiguous bare "unit".
 *
 * @returns {string} e.g. "quart", "quarts", "stock unit", "purchase units"
 */
export const unitWord = (vocab, id, kind, count = 1) => {
  const label = unitLabel(vocab, id);
  if (label) return pluralize(label, count);
  return pluralize(kind === 'purchase' ? 'purchase unit' : 'stock unit', count);
};

/**
 * "How many each on hand" is grammatical but reads badly, because "each" is a
 * placeholder unit rather than a real one — it means "no unit, just a count".
 * This returns the phrase with the word dropped in that case, so a box of
 * filters asks "How many on hand" and a jug of oil asks "How many jugs on hand".
 *
 * @param {string} word - already resolved and pluralised via unitWord
 * @returns {string} the word, or '' when it carries no information
 */
export const meaningfulUnit = (word) => (
  String(word || '').trim().toLowerCase() === 'each' ? '' : word
);

export default unitWord;
