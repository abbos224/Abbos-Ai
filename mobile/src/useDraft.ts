import { useEffect, useRef, useState } from 'react';
import { getDraft, setDraft, type DraftKey } from './draftStorage';

/**
 * A text-input value transparently persisted to a local draft file, so an unsent entry survives
 * leaving the screen or restarting the app. `seed`, when non-empty, wins over any saved draft
 * (used when the field is pre-filled from elsewhere). Call the returned `clear()` once the value
 * has been consumed — e.g. a generation was started — so a stale draft isn't restored later.
 *
 * Saves are debounced (~400ms) while typing, with a flush on unmount so a value typed just before
 * navigating away isn't lost.
 */
export function useDraft(key: DraftKey, seed = ''): [string, (v: string) => void, () => void] {
  const [value, setValue] = useState(() => seed || getDraft(key));
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => {
    const id = setTimeout(() => setDraft(key, latest.current), 400);
    return () => clearTimeout(id);
  }, [key, value]);

  useEffect(() => {
    return () => setDraft(key, latest.current);
  }, [key]);

  function clear() {
    latest.current = '';
    setValue('');
    setDraft(key, '');
  }

  return [value, setValue, clear];
}
