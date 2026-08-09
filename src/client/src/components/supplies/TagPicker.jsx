import React, { useMemo, useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { buildTree, indexTags, tagPath, idOf } from './tagTree';

/**
 * Modal tree picker. Checkbox selects; the star marks which selection is the
 * PRIMARY tag — the item's canonical home.
 *
 * Enforces the strict invariant client-side: any tagged item needs a primary.
 * The server rejects a violation anyway, but catching it here means the user
 * finds out while they are still looking at the tree.
 *
 * Deliberately does NOT auto-promote a survivor when the primary is unchecked.
 * Picking one for them would let list order decide the canonical home silently,
 * and the primary is what drives Phase 2's field set. The one exception is the
 * FIRST tag selected on an untagged item — there is only one candidate, so
 * making it primary is unambiguous rather than a guess.
 */
const TagRow = ({ node, depth, selected, primary, expanded, onToggleExpand, onToggle, onSetPrimary }) => {
  const id = idOf(node._id);
  const isSelected = selected.includes(id);
  const isPrimary = primary === id;
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.includes(id);

  // 3-12 children is a warning, not a constraint — it can't be enforced at save
  // time or you could never reach three. Surfaced as a hint instead.
  const childCountWarning = hasChildren && (node.children.length < 3 || node.children.length > 12);

  return (
    <>
      <div
        className={`flex items-center gap-2 py-1.5 pr-2 rounded hover:bg-gray-50 ${isSelected ? 'bg-primary-50' : ''}`}
        style={{ paddingLeft: `${depth * 18 + 4}px` }}
      >
        <button
          type="button"
          onClick={() => hasChildren && onToggleExpand(id)}
          className={`w-4 text-gray-400 text-[10px] ${hasChildren ? 'hover:text-gray-700' : 'invisible'}`}
          aria-label={isOpen ? 'Collapse' : 'Expand'}
        >
          <i className={`fas ${isOpen ? 'fa-chevron-down' : 'fa-chevron-right'}`}></i>
        </button>

        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle(id)}
          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />

        <button
          type="button"
          onClick={() => isSelected && onSetPrimary(id)}
          disabled={!isSelected}
          title={isSelected ? 'Make this the primary tag' : 'Select this tag first'}
          className={`text-xs ${isPrimary ? 'text-yellow-500' : 'text-gray-300'} ${isSelected ? 'hover:text-yellow-500' : 'cursor-default'}`}
        >
          <i className={`${isPrimary ? 'fas' : 'far'} fa-star`}></i>
        </button>

        <span className={`text-sm flex-1 ${isSelected ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
          {node.name}
          {node.notes && (
            <span className="ml-2 text-[10px] text-gray-400 italic">{node.notes}</span>
          )}
        </span>

        {hasChildren && (
          <span className={`text-[10px] ${childCountWarning ? 'text-amber-600' : 'text-gray-400'}`}>
            {node.children.length}
          </span>
        )}
      </div>

      {isOpen && node.children.map((child) => (
        <TagRow
          key={idOf(child._id)}
          node={child}
          depth={depth + 1}
          selected={selected}
          primary={primary}
          expanded={expanded}
          onToggleExpand={onToggleExpand}
          onToggle={onToggle}
          onSetPrimary={onSetPrimary}
        />
      ))}
    </>
  );
};

const TagPicker = ({ isOpen, onClose, tags = [], selectedTags = [], primaryTag = null, onSave }) => {
  const [selected, setSelected] = useState(selectedTags.map(idOf));
  const [primary, setPrimary] = useState(idOf(primaryTag));
  const [expanded, setExpanded] = useState([]);
  const [search, setSearch] = useState('');

  const byId = useMemo(() => indexTags(tags), [tags]);
  const tree = useMemo(() => buildTree(tags), [tags]);

  // Reset local state whenever the picker reopens for a different item.
  React.useEffect(() => {
    if (!isOpen) return;
    setSelected(selectedTags.map(idOf));
    setPrimary(idOf(primaryTag));
    setSearch('');
    // Open the branches containing the current selection so it's visible.
    const toExpand = new Set();
    selectedTags.map(idOf).forEach((tagId) => {
      let node = byId[tagId];
      while (node && node.parent) {
        toExpand.add(idOf(node.parent));
        node = byId[idOf(node.parent)];
      }
    });
    setExpanded(Array.from(toExpand));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const toggleExpand = (id) => setExpanded((prev) => (
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
  ));

  const toggle = (id) => {
    setSelected((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        // Unchecking the primary clears it. The user picks the replacement.
        if (primary === id) setPrimary(null);
        return next;
      }
      const next = [...prev, id];
      // First tag on an untagged item: only one candidate, so no guess involved.
      if (next.length === 1) setPrimary(id);
      return next;
    });
  };

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return tags.filter((t) => t.name.toLowerCase().includes(q));
  }, [search, tags]);

  const invalid = selected.length > 0 && !primary;

  const handleSave = () => {
    if (invalid) return;
    onSave({ tags: selected, primaryTag: primary });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Tags" size="lg">
      <div className="space-y-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tags..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
        />

        <div className="border border-gray-200 rounded-md max-h-[45vh] overflow-y-auto py-1">
          {matches ? (
            matches.length === 0
              ? <p className="text-sm text-gray-400 text-center py-6">No tags match "{search}"</p>
              : matches.map((t) => {
                const id = idOf(t._id);
                const isSelected = selected.includes(id);
                return (
                  <div
                    key={id}
                    className={`flex items-center gap-2 py-1.5 px-3 hover:bg-gray-50 ${isSelected ? 'bg-primary-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(id)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <button
                      type="button"
                      onClick={() => isSelected && setPrimary(id)}
                      disabled={!isSelected}
                      className={`text-xs ${primary === id ? 'text-yellow-500' : 'text-gray-300'}`}
                    >
                      <i className={`${primary === id ? 'fas' : 'far'} fa-star`}></i>
                    </button>
                    <span className="text-sm text-gray-700">{tagPath(id, byId)}</span>
                  </div>
                );
              })
          ) : (
            tree.map((node) => (
              <TagRow
                key={idOf(node._id)}
                node={node}
                depth={0}
                selected={selected}
                primary={primary}
                expanded={expanded}
                onToggleExpand={toggleExpand}
                onToggle={toggle}
                onSetPrimary={setPrimary}
              />
            ))
          )}
        </div>

        {selected.length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1.5">
              Selected — the starred tag is where this item lives
            </div>
            <div className="flex flex-wrap gap-1.5">
              {selected.map((id) => (
                <span
                  key={id}
                  className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border ${
                    primary === id
                      ? 'border-yellow-400 bg-yellow-50 text-yellow-800'
                      : 'border-gray-300 bg-gray-50 text-gray-700'
                  }`}
                >
                  {primary === id && <i className="fas fa-star text-[9px]"></i>}
                  {tagPath(id, byId)}
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    className="text-gray-400 hover:text-gray-700"
                    title="Remove"
                  >
                    <i className="fas fa-times text-[10px]"></i>
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {invalid && (
          <p className="text-xs text-red-600">
            <i className="fas fa-exclamation-circle mr-1"></i>
            Star one tag as the primary. An item with tags but no primary is invisible
            to every rollup, and to the Untagged filter.
          </p>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="light" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} disabled={invalid}>Apply</Button>
      </div>
    </Modal>
  );
};

export default TagPicker;
