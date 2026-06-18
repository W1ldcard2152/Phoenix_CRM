import React, { createContext, useContext, useState, useCallback } from 'react';

// Aggregates every autosave on the worksheet into ONE save state so the page can
// surface a single "saving… / saved" indicator — critical for a one-handed tool
// used split-screen next to a browser, where the user needs to know captures
// landed. Every persist closure (scratchpads, offer fields, discrete toggles)
// runs through `track`, which counts in-flight saves and stamps lastSaved.
const SaveContext = createContext(null);

export function SaveProvider({ children }) {
  const [savingCount, setSavingCount] = useState(0);
  const [lastSaved, setLastSaved] = useState(null);
  const [error, setError] = useState(null);

  const track = useCallback(async (fn) => {
    setSavingCount((c) => c + 1);
    try {
      const result = await fn();
      setLastSaved(new Date());
      setError(null);
      return result;
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setSavingCount((c) => c - 1);
    }
  }, []);

  const value = { track, isSaving: savingCount > 0, lastSaved, error };
  return <SaveContext.Provider value={value}>{children}</SaveContext.Provider>;
}

export function useSaveTracker() {
  const ctx = useContext(SaveContext);
  if (!ctx) throw new Error('useSaveTracker must be used within a SaveProvider');
  return ctx;
}

export default SaveContext;
