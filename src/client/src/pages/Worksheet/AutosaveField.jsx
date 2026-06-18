import React, { useCallback, useRef } from 'react';
import { useAutosaveScratchpad } from '../../hooks/useAutosaveScratchpad';
import { useSaveTracker } from './SaveContext';

// A text input/textarea backed by the worksheet's one autosave primitive. Used
// for the per-part scratchpad, the worksheet-level sourcingNotes scratchpad, and
// every typed offer-card field — all on the same 2000ms trailing debounce. Saves
// also flush on blur. `onPersist(value)` does the storage call; it runs through
// the page-level save tracker so the single save indicator reflects it.
//
// The initial value is captured once at mount (via ref) so a parent refetch never
// clobbers in-progress typing. To force a reset to a new server value, remount
// with a changed `key`.
export default function AutosaveField({
  initialValue = '',
  onPersist,
  onValueChange,   // optional: fires on every keystroke so a parent can mirror the live value
  multiline = false,
  className = '',
  ...rest
}) {
  const { track } = useSaveTracker();
  const initialRef = useRef(initialValue == null ? '' : String(initialValue));

  const load = useCallback(() => Promise.resolve(initialRef.current), []);
  // Swallow the rejection after track() records it: a failed autosave surfaces via the
  // worksheet's save indicator (error state) rather than as an uncaught promise — the
  // debounced timer and onBlur flush are fire-and-forget and must not crash the UI.
  const persist = useCallback((value) => track(() => onPersist(value)).catch(() => {}), [track, onPersist]);

  const { content, onChange, saveNow } = useAutosaveScratchpad(load, persist, 2000);

  const commonProps = {
    className,
    value: content,
    onChange: (e) => {
      onChange(e.target.value);
      if (onValueChange) onValueChange(e.target.value);
    },
    onBlur: () => saveNow(),
    ...rest,
  };

  return multiline ? <textarea {...commonProps} /> : <input {...commonProps} />;
}
