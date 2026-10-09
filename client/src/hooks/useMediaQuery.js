import { useCallback, useSyncExternalStore } from 'react';

export const useMediaQuery = (query) => {
  const subscribe = useCallback((onChange) => {
    const mql = window.matchMedia(query);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
};

// Phones (below Tailwind's `md`): tables switch to card lists here.
export const useIsMobile = () => useMediaQuery('(max-width: 767px)');
