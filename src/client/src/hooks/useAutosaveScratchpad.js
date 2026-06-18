import { useState, useEffect, useRef, useCallback } from 'react';

// Debounced trailing-edge autosave primitive for the Parts Purchase Worksheet.
// This is the ONE source of autosave behavior on the worksheet — the per-part
// scratchpad, the worksheet-level sourcingNotes scratchpad, and the offer-card
// fields all autosave through this same pattern (2000ms trailing debounce).
//
// Storage-agnostic: point `persist` at the worksheet's update endpoint and
// `load` at the read.
//   load    () => Promise<string>
//   persist (content: string) => Promise<void>
export function useAutosaveScratchpad(
  load,
  persist,
  debounceMs = 2000,
) {
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const timer = useRef(null);

  // initial load
  useEffect(() => { load().then(setContent); }, [load]);

  const save = useCallback(async (value) => {
    setIsSaving(true);
    try {
      await persist(value);
      setLastSaved(new Date());
    } finally {
      setIsSaving(false);
    }
  }, [persist]);

  // call on every keystroke
  const onChange = useCallback((value) => {
    setContent(value);                                          // instant UI update
    if (timer.current) clearTimeout(timer.current);             // cancel pending save
    timer.current = setTimeout(() => save(value), debounceMs);  // reschedule
  }, [save, debounceMs]);

  // manual save: flush immediately, cancel the pending debounce
  const saveNow = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    return save(content);
  }, [save, content]);

  // flush/cancel on unmount
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { content, onChange, saveNow, isSaving, lastSaved };
}

export default useAutosaveScratchpad;
