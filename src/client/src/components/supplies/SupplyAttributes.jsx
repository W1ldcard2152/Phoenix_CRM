import React, { useMemo } from 'react';
import SearchableDropdown from '../common/SearchableDropdown';
import { indexTags, idOf } from './tagTree';

/**
 * Measurement inputs for a supply, driven by its tags.
 *
 * Which inputs appear is not a property of this component — it comes from the
 * tag tree. Tag an item Engine Oil and a Viscosity dropdown appears; retag it
 * to Abrasives → Discs and you get Grit and Diameter instead. That is the whole
 * point of separating "what is this FOR?" (tags) from "what IS this?" (fields):
 * the judgment decides which measurements are even meaningful.
 *
 * Required vs optional follows the primary tag — see resolveFieldsForItem on
 * the server, which this mirrors.
 */

/** Fields from a tag plus its ancestors, matching the server's resolution. */
const fieldsForTag = (tagId, byId) => {
  const out = [];
  const seen = new Set();
  let node = byId[idOf(tagId)];
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

export const resolveFields = (tags, primaryTag, tagList) => {
  const byId = indexTags(tagList);
  const primaryId = idOf(primaryTag);

  const required = primaryId ? fieldsForTag(primaryId, byId) : [];
  const requiredSet = new Set(required);

  const optional = [];
  (tags || []).forEach((t) => {
    if (idOf(t) === primaryId) return;
    fieldsForTag(t, byId).forEach((f) => {
      if (!requiredSet.has(f) && !optional.includes(f)) optional.push(f);
    });
  });

  return { required, optional };
};

const SupplyAttributes = ({ tags, primaryTag, tagList = [], fieldList = [], values = {}, onChange }) => {
  const { required, optional } = useMemo(
    () => resolveFields(tags, primaryTag, tagList),
    [tags, primaryTag, tagList]
  );

  const fieldById = useMemo(() => {
    const map = {};
    fieldList.forEach((f) => { map[String(f._id)] = f; });
    return map;
  }, [fieldList]);

  const rows = [...required, ...optional]
    .map((id) => ({ field: fieldById[id], isRequired: required.includes(id) }))
    .filter((r) => r.field)
    .sort((a, b) => (a.field.sortOrder || 0) - (b.field.sortOrder || 0));

  if (rows.length === 0) {
    return (
      <p className="text-xs text-gray-400">
        {primaryTag
          ? 'No measurements defined for this tag.'
          : 'Tag this item to see the measurements it should carry.'}
      </p>
    );
  }

  const set = (key, value) => onChange({ ...values, [key]: value });

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500';

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {rows.map(({ field, isRequired }) => (
        <div key={String(field._id)}>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {field.label}
            {field.unit && <span className="text-gray-400"> ({field.unit})</span>}
            {!isRequired && <span className="ml-1 text-[10px] text-gray-400 italic">optional</span>}
          </label>

          {field.type === 'select' ? (
            <SearchableDropdown
              size="md"
              options={(field.options || []).map((o) => ({ value: o, label: o }))}
              value={values[field.key] || null}
              onChange={(v) => set(field.key, v || '')}
              placeholder="—"
              allowClear
            />
          ) : (
            <input
              type={field.type === 'number' ? 'number' : 'text'}
              value={values[field.key] || ''}
              onChange={(e) => set(field.key, e.target.value)}
              placeholder={field.placeholder}
              className={inputCls}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default SupplyAttributes;
