import { useState, useEffect, useCallback, useRef } from 'react';
import * as offlineStore from '../utils/offlineStore.js';
import { reserveOffline, syncOfflineCoupons, getTodayForOffline } from '../api/mahaprasad.api.js';
import toast from 'react-hot-toast';
import { localDateStr } from '../utils/formatters.js';
import { tNow } from '../i18n/index.jsx';

const SETTINGS_KEY = 'mgm-offline-settings';
const USER_KEY     = 'mgm-offline-user';

export function useOfflineMode() {
  const [isOnline,      setIsOnline]      = useState(navigator.onLine);
  const [poolCount,     setPoolCount]     = useState(0);
  const [offlineIssued, setOfflineIssued] = useState(0);
  const [syncPending,   setSyncPending]   = useState(0);
  const [isSyncing,     setIsSyncing]     = useState(false);
  const [isPrefetching, setIsPrefetching] = useState(false);
  const [countsLoaded,  setCountsLoaded]  = useState(false); // true after first IndexedDB read

  const todayDateStr      = localDateStr().replace(/-/g, '');
  const syncingRef        = useRef(false);
  const prevOnlineRef     = useRef(null); // null = first mount, then true/false
  const lastAutoFetchRef  = useRef(0);    // timestamp of last auto-prefetch

  const refreshCounts = useCallback(async () => {
    const [pool, pending] = await Promise.all([
      offlineStore.getPoolCount(todayDateStr),
      offlineStore.getPendingSync(),
    ]);
    setPoolCount(pool.available);
    setOfflineIssued(pool.offlineIssued);
    setSyncPending(pending.length);
    setCountsLoaded(true);
  }, [todayDateStr]);

  // Listen to browser online/offline events
  useEffect(() => {
    const go  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online',  go);
    window.addEventListener('offline', off);
    refreshCounts();
    return () => { window.removeEventListener('online', go); window.removeEventListener('offline', off); };
  }, [refreshCounts]);

  // In Electron, also track the heartbeat — it pings the actual VPS so it's
  // more reliable than the browser's network-adapter-level online/offline events.
  useEffect(() => {
    if (!window.electronAPI?.isElectron) return;
    return window.electronAPI.onOnlineStatus(({ online: on }) => setIsOnline(on));
  }, []);

  // Pre-fetch: reserve a block of coupon numbers + cache today's data
  const prefetch = useCallback(async (qty = 200) => {
    setIsPrefetching(true);
    try {
      const res  = await reserveOffline({ qty, date: localDateStr() });
      const { coupons, user, settings } = res.data.data;

      await offlineStore.storePrefetched(coupons);

      // Cache user and settings so they're available when offline
      localStorage.setItem(USER_KEY,     JSON.stringify(user));
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

      // Also snapshot today's issued coupons so the redeem counter can look them up
      try {
        const todayRes = await getTodayForOffline();
        const issued   = todayRes?.data?.data || [];
        if (issued.length) await offlineStore.storeOnlineIssued(issued);
      } catch { /* not critical — redeem will fall back to online */ }

      await offlineStore.clearOldData();
      await refreshCounts();
      toast.success(tNow('{n} coupons ready for offline use', { n: coupons.length }));
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || tNow('Pre-fetch failed'));
    } finally {
      setIsPrefetching(false);
    }
  }, [refreshCounts]);

  // Sync all pending offline events to the server
  const sync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);
    try {
      const pending = await offlineStore.getPendingSync();
      if (!pending.length) { toast(tNow('Nothing to sync')); return; }

      const issued   = pending.filter((p) => p.type === 'issue').map((p) => p.data);
      const redeemed = pending.filter((p) => p.type === 'redeem').map((p) => ({
        couponNumber: p.couponNumber,
        ...p.data,
      }));

      const res     = await syncOfflineCoupons({ issued, redeemed });
      const results = res.data.data.results;

      await offlineStore.markSynced(pending.map((p) => p.id));
      await refreshCounts();

      const total = results.issued.ok + results.redeemed.ok;
      const skipped = results.issued.skipped + results.redeemed.skipped;
      const conflicts = results.redeemed?.conflicts || [];
      if (conflicts.length) {
        try { localStorage.setItem('mgm-redeem-conflicts', JSON.stringify(conflicts)); } catch {}
      }
      toast.success(`${tNow(total !== 1 ? 'Synced {n} records' : 'Synced {n} record', { n: total })}`
        + `${skipped ? ` ${tNow('({n} skipped)', { n: skipped })}` : ''}`);
    } catch (err) {
      toast.error(tNow('Sync failed — {reason}', { reason: err.response?.data?.message || err.message }));
    } finally {
      setIsSyncing(false);
      syncingRef.current = false;
    }
  }, [refreshCounts]);

  // Auto-sync on reconnect — detect offline→online transition, wait 2 s for
  // the connection to stabilise, then read pending count directly from IndexedDB
  // (avoids stale-state issues) and sync if there's anything waiting.
  // NOTE: declared after `sync`/`prefetch` so their consts are initialised
  // before these effects reference them in their dependency arrays.
  useEffect(() => {
    const prev = prevOnlineRef.current;
    prevOnlineRef.current = isOnline;

    // Only act on the offline→online edge (skip first mount and online→offline)
    if (prev !== false || !isOnline) return;

    const t = setTimeout(async () => {
      const pending = await offlineStore.getPendingSync();
      if (!pending.length || syncingRef.current) return;
      toast(tNow('Back online — syncing…'), { icon: '🔄', duration: 2500 });
      sync();
    }, 2000);

    return () => clearTimeout(t);
  }, [isOnline, sync]);

  // Auto-prefetch when the offline pool runs low (< 50 coupons remaining).
  // Waits until counts are loaded from IndexedDB and at least 5 min between
  // attempts so a repeated failure doesn't spam the VPS.
  useEffect(() => {
    if (!isOnline || !countsLoaded || poolCount >= 50 || isPrefetching) return;
    const now = Date.now();
    if (now - lastAutoFetchRef.current < 5 * 60 * 1000) return; // 5-min cooldown
    lastAutoFetchRef.current = now;
    if (poolCount > 0) {
      toast(tNow('Offline pool low ({n} left) — refilling…', { n: poolCount }), { icon: '📦', duration: 3000 });
    }
    prefetch(200);
  }, [isOnline, countsLoaded, poolCount, isPrefetching, prefetch]);

  // Read helpers for offline-cached data
  const getOfflineUser     = () => { try { return JSON.parse(localStorage.getItem(USER_KEY)     || '{}'); } catch { return {}; } };
  const getOfflineSettings = () => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; } };

  return {
    isOnline,
    poolCount,
    offlineIssued,
    syncPending,
    isSyncing,
    isPrefetching,
    prefetch,
    sync,
    refreshCounts,
    getOfflineUser,
    getOfflineSettings,
  };
}
