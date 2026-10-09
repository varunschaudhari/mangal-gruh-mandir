import { useEffect, useRef, useState } from 'react';
import haptics from '../utils/haptics.js';

const THRESHOLD = 70;   // px of pull (after resistance) needed to trigger
const MAX_PULL  = 110;

// Touch pull-to-refresh on a scroll container. Returns the current pull distance
// and refreshing state so the caller can render an indicator.
export const usePullToRefresh = (ref, onRefresh, { enabled = true } = {}) => {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const state = useRef({ startY: 0, startX: 0, active: false, armed: false });
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return undefined;

    // Don't hijack the gesture if the touch starts inside a nested scroller that isn't at its top.
    const nestedScrolled = (target) => {
      for (let n = target; n && n !== el; n = n.parentElement) {
        if (n.scrollTop > 0) return true;
      }
      return false;
    };

    const onStart = (e) => {
      if (refreshing || el.scrollTop > 0 || e.touches.length !== 1 || nestedScrolled(e.target)) return;
      state.current = { startY: e.touches[0].clientY, startX: e.touches[0].clientX, active: true, armed: false };
    };

    const onMove = (e) => {
      const s = state.current;
      if (!s.active) return;
      const dy = e.touches[0].clientY - s.startY;
      const dx = e.touches[0].clientX - s.startX;
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || el.scrollTop > 0) {
        if (dy < 0 || Math.abs(dx) > Math.abs(dy)) s.active = false;
        setPull(0);
        return;
      }
      const distance = Math.min(MAX_PULL, dy * 0.5);
      if (distance >= THRESHOLD && !s.armed) { s.armed = true; haptics.tap(); }
      if (distance < THRESHOLD) s.armed = false;
      setPull(distance);
      if (e.cancelable) e.preventDefault();
    };

    const onEnd = async () => {
      const s = state.current;
      if (!s.active) return;
      s.active = false;
      if (s.armed) {
        setRefreshing(true);
        setPull(THRESHOLD * 0.7);
        try { await onRefreshRef.current?.(); } finally {
          setRefreshing(false);
          setPull(0);
        }
      } else {
        setPull(0);
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [ref, enabled, refreshing]);

  return { pull, refreshing, threshold: THRESHOLD };
};
