import { indexTags, idOf } from './tagTree';

/**
 * Client-side mirror of src/server/utils/supplyNaming.js.
 *
 * The server is authoritative — every item it returns already carries a
 * `displayName`, and that is what the list renders. This exists only so the
 * form can show the name updating as you type, before anything is saved.
 *
 * Keep the two in step. If they drift, the preview lies about what will be
 * stored, which is worse than having no preview.
 */

const appendQualifier = (base, qualifier) => {
  const q = (qualifier || '').trim();
  return q ? `${base} (${q})` : base;
};

const nounForTag = (tag) => {
  if (!tag) return '';
  return (tag.noun && tag.noun.trim()) || tag.name || '';
};

/** Fields the primary tag contributes, walking ancestors. */
const primaryFieldIds = (primaryTag, byId) => {
  const out = [];
  const seen = new Set();
  let node = byId[idOf(primaryTag)];
  while (node) {
    (node.fields || []).forEach((f) => {
      const id = idOf(f);
      if (!out.includes(id)) out.push(id);
    });
    const parentId = idOf(node.parent);
    if (!parentId || seen.has(parentId)) break;
    seen.add(parentId);
    node = byId[parentId];
  }
  return out;
};

/**
 * @param {object} data      - form state { name, qualifier, brand, partNumber, attributes, primaryTag }
 * @param {Array}  tags      - flat tag list
 * @param {Array}  fields    - SupplyField list
 * @param {Array}  vocab     - SupplyVocab list (for the brand label)
 * @returns {string}
 */
export const composeDisplayName = (data, tags = [], fields = [], vocab = []) => {
  if (!data) return '';

  const explicit = (data.name || '').trim();
  if (explicit) return appendQualifier(explicit, data.qualifier);

  const byId = indexTags(tags);
  const primaryTag = data.primaryTag ? byId[idOf(data.primaryTag)] : null;

  const brandEntry = data.brand
    ? vocab.find((v) => String(v._id) === idOf(data.brand))
    : null;
  const brandLabel = brandEntry ? (brandEntry.label || brandEntry.value) : '';

  const fieldById = {};
  fields.forEach((f) => { fieldById[String(f._id)] = f; });

  const measurements = primaryFieldIds(data.primaryTag, byId)
    .map((id) => fieldById[id])
    .filter(Boolean)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map((f) => {
      const raw = (data.attributes || {})[f.key];
      if (raw === undefined || raw === null || String(raw).trim() === '') return null;
      const value = String(raw).trim();
      const hasUnit = f.unit && value.toLowerCase().endsWith(f.unit.toLowerCase());
      return f.unit && !hasUnit ? `${value}${f.unit}` : value;
    })
    .filter(Boolean);

  const parts = [
    brandLabel.trim(),
    (data.partNumber || '').trim(),
    ...measurements,
    nounForTag(primaryTag)
  ].filter(Boolean);

  if (parts.length === 0) return '';

  return appendQualifier(parts.join(' '), data.qualifier);
};

export default composeDisplayName;
