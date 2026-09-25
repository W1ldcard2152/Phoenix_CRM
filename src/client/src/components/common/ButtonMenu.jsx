import React, { useEffect, useRef, useState } from 'react';
import Button from './Button';

/**
 * A Button that opens a short menu of actions instead of doing one thing.
 *
 * For the case where several related actions want one slot in a crowded
 * toolbar — "Add Supply" covering both typing an item in and reading one off a
 * photo. The trigger itself has no default action: a split button whose two
 * halves do different things is a coin flip at a glance, and the halves are
 * about eight pixels apart.
 *
 * Renders the real Button for the trigger rather than restating its variant
 * classes, so it stays in step with the rest of the toolbar for free.
 *
 * @param {React.ReactNode} label - trigger contents, icon included
 * @param {Array<{key?, label, description?, icon?, onClick, disabled?}>} items
 * @param {'left'|'right'} align - which edge the panel hangs from
 */
const ButtonMenu = ({
  label,
  items = [],
  variant = 'primary',
  size = 'md',
  align = 'right',
  className = '',
  disabled = false
}) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  // Close on an outside click or Escape. Both, because a menu you can only
  // dismiss by picking something from it is a trap — and on a toolbar the most
  // likely next move is clicking one of the buttons beside it.
  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (!wrapperRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const choose = (item) => {
    if (item.disabled) return;
    setOpen(false);
    item.onClick?.();
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <Button
        variant={variant}
        size={size}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
        <i className={`fas fa-chevron-${open ? 'up' : 'down'} ml-2 text-xs`}></i>
      </Button>

      {open && (
        <div
          role="menu"
          className={`absolute z-30 mt-1 min-w-[15rem] rounded-md border border-gray-200 bg-white py-1 shadow-lg ${
            align === 'left' ? 'left-0' : 'right-0'
          }`}
        >
          {items.map((item, i) => (
            <button
              key={item.key || item.label || i}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => choose(item)}
              className={`flex w-full items-start gap-2.5 px-3 py-2 text-left ${
                item.disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-gray-50'
              }`}
            >
              {item.icon && (
                <i className={`${item.icon} mt-0.5 w-4 shrink-0 text-center text-xs text-gray-400`}></i>
              )}
              <span className="min-w-0">
                <span className="block text-sm text-gray-800">{item.label}</span>
                {item.description && (
                  <span className="block text-xs text-gray-500">{item.description}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ButtonMenu;
