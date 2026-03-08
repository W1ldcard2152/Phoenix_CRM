import { useState, useCallback } from 'react';

const KEY_PREFIX = 'phoenix-crm-ui:';

function usePersistedState(key, defaultValue) {
  const storageKey = KEY_PREFIX + key;

  const [state, setState] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setPersistedState = useCallback((valueOrUpdater) => {
    setState((prev) => {
      const next = typeof valueOrUpdater === 'function' ? valueOrUpdater(prev) : valueOrUpdater;
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch { /* storage full — degrade gracefully */ }
      return next;
    });
  }, [storageKey]);

  return [state, setPersistedState];
}

export default usePersistedState;
