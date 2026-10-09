import { useEffect, useRef } from 'react';
import { pushBackHandler } from '../utils/nativeShell.js';

// While `active`, the Android back button calls `handler` (e.g. to close a sheet)
// instead of navigating back.
export const useBackHandler = (active, handler) => {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!active) return undefined;
    return pushBackHandler(() => ref.current?.());
  }, [active]);
};
