import React, { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Custom DateTimePicker with scroll-wheel time selection and confirm button.
 * - Date: standard date input
 * - Time: scroll wheels for hour, minute, AM/PM that snap to center
 * - Confirm button to apply the selected datetime
 */

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1-12
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,10,...,55
const PERIODS = ['AM', 'PM'];

const ITEM_HEIGHT = 36; // px per item in the wheel
const VISIBLE_ITEMS = 5; // number of visible items in wheel

// Scroll-wheel column component
const WheelColumn = ({ items, selectedIndex, onSelect, formatItem }) => {
  const containerRef = useRef(null);
  const isUserScrolling = useRef(false);
  const scrollTimeout = useRef(null);

  const scrollToIndex = useCallback((index, smooth = true) => {
    if (!containerRef.current) return;
    const targetScroll = index * ITEM_HEIGHT;
    containerRef.current.scrollTo({
      top: targetScroll,
      behavior: smooth ? 'smooth' : 'instant'
    });
  }, []);

  // Initial scroll to selected index
  useEffect(() => {
    scrollToIndex(selectedIndex, false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When selectedIndex changes externally, scroll to it
  useEffect(() => {
    if (!isUserScrolling.current) {
      scrollToIndex(selectedIndex, true);
    }
  }, [selectedIndex, scrollToIndex]);

  const handleScroll = () => {
    isUserScrolling.current = true;
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);

    scrollTimeout.current = setTimeout(() => {
      if (!containerRef.current) return;
      const scrollTop = containerRef.current.scrollTop;
      const nearestIndex = Math.round(scrollTop / ITEM_HEIGHT);
      const clampedIndex = Math.max(0, Math.min(nearestIndex, items.length - 1));

      // Snap to center
      scrollToIndex(clampedIndex, true);
      isUserScrolling.current = false;

      if (clampedIndex !== selectedIndex) {
        onSelect(clampedIndex);
      }
    }, 80);
  };

  const handleItemClick = (index) => {
    scrollToIndex(index, true);
    onSelect(index);
  };

  const padHeight = Math.floor(VISIBLE_ITEMS / 2) * ITEM_HEIGHT;

  return (
    <div className="relative" style={{ height: VISIBLE_ITEMS * ITEM_HEIGHT }}>
      {/* Selection highlight bar */}
      <div
        className="absolute left-0 right-0 bg-blue-50 border-y border-blue-200 pointer-events-none z-0"
        style={{ top: padHeight, height: ITEM_HEIGHT }}
      />
      {/* Fade overlays */}
      <div className="absolute top-0 left-0 right-0 pointer-events-none z-10"
        style={{ height: padHeight, background: 'linear-gradient(to bottom, rgba(255,255,255,0.9), rgba(255,255,255,0))' }} />
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none z-10"
        style={{ height: padHeight, background: 'linear-gradient(to top, rgba(255,255,255,0.9), rgba(255,255,255,0))' }} />

      <div
        ref={containerRef}
        className="h-full overflow-y-auto scrollbar-hide relative z-0"
        onScroll={handleScroll}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {/* Top padding to allow first item to be centered */}
        <div style={{ height: padHeight }} />
        {items.map((item, index) => (
          <div
            key={index}
            onClick={() => handleItemClick(index)}
            className={`flex items-center justify-center cursor-pointer select-none transition-all duration-150 ${
              index === selectedIndex
                ? 'text-blue-700 font-semibold text-lg'
                : 'text-gray-400 text-base hover:text-gray-600'
            }`}
            style={{ height: ITEM_HEIGHT }}
          >
            {formatItem ? formatItem(item) : item}
          </div>
        ))}
        {/* Bottom padding to allow last item to be centered */}
        <div style={{ height: padHeight }} />
      </div>
    </div>
  );
};

const DateTimePicker = ({ value, onChange, label, helpText, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dateStr, setDateStr] = useState('');
  const [hourIndex, setHourIndex] = useState(11); // 12 o'clock
  const [minuteIndex, setMinuteIndex] = useState(0);
  const [periodIndex, setPeriodIndex] = useState(0);
  const [openAbove, setOpenAbove] = useState(false);
  const popoverRef = useRef(null);
  const triggerRef = useRef(null);

  // Parse value into component state when it changes
  useEffect(() => {
    if (value) {
      const dt = new Date(value);
      if (!isNaN(dt.getTime())) {
        const pad = (n) => String(n).padStart(2, '0');
        setDateStr(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`);

        let hours = dt.getHours();
        const minutes = dt.getMinutes();
        const isPM = hours >= 12;
        setPeriodIndex(isPM ? 1 : 0);
        hours = hours % 12 || 12; // Convert 0->12, 13->1, etc.
        setHourIndex(HOURS.indexOf(hours));
        // Snap to nearest 5-minute increment
        const nearestMinute = Math.round(minutes / 5) * 5;
        setMinuteIndex(MINUTES.indexOf(nearestMinute >= 60 ? 55 : nearestMinute));
      }
    }
  }, [value]);

  // Close popover on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const buildDatetimeString = (d, h, m, p) => {
    if (!d) return '';
    let hour24 = HOURS[h];
    if (PERIODS[p] === 'AM' && hour24 === 12) hour24 = 0;
    if (PERIODS[p] === 'PM' && hour24 !== 12) hour24 += 12;
    const pad = (n) => String(n).padStart(2, '0');
    return `${d}T${pad(hour24)}:${pad(MINUTES[m])}`;
  };

  const handleConfirm = () => {
    const result = buildDatetimeString(dateStr, hourIndex, minuteIndex, periodIndex);
    if (result) {
      onChange(result);
    }
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setIsOpen(false);
  };

  // Format display value
  const displayValue = value
    ? new Date(value).toLocaleString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true
      })
    : '';

  return (
    <div className={`relative ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      )}
      <div
        ref={triggerRef}
        onClick={() => {
          if (!isOpen && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const popoverHeight = 420; // approximate height of the popover
            setOpenAbove(spaceBelow < popoverHeight && rect.top > spaceBelow);
          }
          setIsOpen(!isOpen);
        }}
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm cursor-pointer flex items-center justify-between hover:border-gray-400 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 bg-white"
      >
        <span className={displayValue ? 'text-gray-900' : 'text-gray-400'}>
          {displayValue || 'Select date & time...'}
        </span>
        <i className="fas fa-calendar-clock text-gray-400 text-xs ml-2"></i>
      </div>
      {helpText && (
        <p className="text-xs text-gray-500 mt-1">{helpText}</p>
      )}

      {isOpen && (
        <div
          ref={popoverRef}
          className={`absolute z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-4 ${openAbove ? 'mb-1' : 'mt-1'}`}
          style={{ width: '320px', ...(openAbove ? { bottom: '100%' } : {}) }}
        >
          {/* Date input */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Time wheels */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Time</label>
            <div className="flex items-center gap-1 border border-gray-200 rounded-lg overflow-hidden bg-gray-50 px-2">
              <div className="flex-1">
                <WheelColumn
                  items={HOURS}
                  selectedIndex={hourIndex}
                  onSelect={setHourIndex}
                />
              </div>
              <div className="text-xl font-bold text-gray-400 pb-0.5">:</div>
              <div className="flex-1">
                <WheelColumn
                  items={MINUTES}
                  selectedIndex={minuteIndex}
                  onSelect={setMinuteIndex}
                  formatItem={(m) => String(m).padStart(2, '0')}
                />
              </div>
              <div className="w-px bg-gray-200 self-stretch mx-1" />
              <div style={{ width: '50px' }}>
                <WheelColumn
                  items={PERIODS}
                  selectedIndex={periodIndex}
                  onSelect={setPeriodIndex}
                />
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-gray-500 hover:text-red-600"
            >
              Clear
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="px-4 py-1.5 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 font-medium"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateTimePicker;
