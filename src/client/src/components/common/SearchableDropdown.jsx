import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Searchable single-select dropdown.
 *
 * Props:
 *   options:      [{ value: any, label: string, sublabel?: string, keywords?: string }]
 *   value:        currently selected value (must match one option.value, or null)
 *   onChange:     (newValue) => void
 *   placeholder:  shown when no value is selected
 *   allowClear:   when true, shows a "— None —" option
 *   clearLabel:   custom label for the clear option (default "— None —")
 *   className:    extra wrapper classes
 *   disabled:     disables interaction
 *   size:         "sm" | "md" — controls padding/text size (default "sm")
 *
 * The option panel is rendered with position:fixed so it escapes any ancestor
 * with `overflow:hidden|auto` (e.g. modal scroll containers). Position is
 * recalculated on scroll/resize and the panel flips upward when there isn't
 * enough room below the trigger.
 */
const PANEL_MAX_H = 288; // matches max-h-72

const SearchableDropdown = ({
  options = [],
  value = null,
  onChange,
  placeholder = 'Select...',
  allowClear = false,
  clearLabel = '— None —',
  className = '',
  disabled = false,
  size = 'sm',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [panelStyle, setPanelStyle] = useState({});
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const inputRef = useRef(null);

  const selectedOption = useMemo(
    () => options.find(o => o.value === value) || null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? options.filter(o => {
          const hay = `${o.label || ''} ${o.sublabel || ''} ${o.keywords || ''}`.toLowerCase();
          return hay.includes(q);
        })
      : options;
    return list;
  }, [options, query]);

  // Compute & update panel position whenever it's open
  useEffect(() => {
    if (!open || !triggerRef.current) return;

    const updatePosition = () => {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const flipUp = spaceBelow < PANEL_MAX_H && spaceAbove > spaceBelow;

      if (flipUp) {
        setPanelStyle({
          position: 'fixed',
          left: rect.left,
          width: rect.width,
          bottom: window.innerHeight - rect.top + 4,
          maxHeight: Math.min(PANEL_MAX_H, spaceAbove - 8),
        });
      } else {
        setPanelStyle({
          position: 'fixed',
          left: rect.left,
          width: rect.width,
          top: rect.bottom + 4,
          maxHeight: Math.min(PANEL_MAX_H, spaceBelow - 8),
        });
      }
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open]);

  // Close on outside click — must check both wrapper (trigger) and panel since
  // the panel is no longer a DOM child of the wrapper visually.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      const inWrapper = wrapperRef.current?.contains(e.target);
      const inPanel = panelRef.current?.contains(e.target);
      if (!inWrapper && !inPanel) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
      setHighlight(0);
    }
  }, [open]);

  const choose = (opt) => {
    onChange?.(opt ? opt.value : null);
    setOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e) => {
    const total = filtered.length + (allowClear ? 1 : 0);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(total - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allowClear && highlight === 0) {
        choose(null);
      } else {
        const idx = allowClear ? highlight - 1 : highlight;
        if (filtered[idx]) choose(filtered[idx]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setQuery('');
    }
  };

  const padCls = size === 'md' ? 'px-3 py-2 text-sm' : 'px-2 py-1 text-xs';

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`w-full ${padCls} border border-gray-300 rounded bg-white text-left flex items-center justify-between gap-1 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-400'}`}
      >
        <span className={`truncate ${selectedOption ? 'text-gray-900' : 'text-gray-400'}`}>
          {selectedOption ? (
            <>
              {selectedOption.label}
              {selectedOption.sublabel && (
                <span className="text-gray-400 ml-1">· {selectedOption.sublabel}</span>
              )}
            </>
          ) : placeholder}
        </span>
        <i className={`fas fa-chevron-down text-[10px] text-gray-400 ${open ? 'rotate-180' : ''}`}></i>
      </button>

      {open && (
        <div
          ref={panelRef}
          style={panelStyle}
          className="z-[100] bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden flex flex-col"
        >
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
              onKeyDown={handleKeyDown}
              placeholder="Type to search..."
              className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <ul className="overflow-y-auto flex-1">
            {allowClear && (
              <li
                onMouseEnter={() => setHighlight(0)}
                onClick={() => choose(null)}
                className={`px-3 py-1.5 text-xs cursor-pointer text-gray-500 italic ${highlight === 0 ? 'bg-primary-50' : 'hover:bg-gray-50'}`}
              >
                {clearLabel}
              </li>
            )}
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-gray-400 text-center">No matches</li>
            )}
            {filtered.map((opt, idx) => {
              const realIdx = allowClear ? idx + 1 : idx;
              const isHighlighted = realIdx === highlight;
              const isSelected = opt.value === value;
              return (
                <li
                  key={`${opt.value}`}
                  onMouseEnter={() => setHighlight(realIdx)}
                  onClick={() => choose(opt)}
                  className={`px-3 py-1.5 text-xs cursor-pointer ${isHighlighted ? 'bg-primary-50' : 'hover:bg-gray-50'} ${isSelected ? 'font-semibold text-primary-700' : 'text-gray-800'}`}
                >
                  <div className="truncate">{opt.label}</div>
                  {opt.sublabel && (
                    <div className="text-[10px] text-gray-400 truncate">{opt.sublabel}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export default SearchableDropdown;
