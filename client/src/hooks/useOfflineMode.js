import { useState, useEffect, useCallback, useRef } from 'react';
import * as offlineStore from '../utils/offlineStore.js';
import { reserveOffline, syncOfflineCoupons, getTodayForOffline } from '../api/mahaprasad.api.js';
import toast from 'react-hot-toast';

const SETTINGS_KEY = 'mgm-offline-settings';
const USER_KEY     = 'mgm-offline-user';

export function useOfflineMode() {
  const [isOnline,      setIsOnline]      = useState(navigator.onLine);
  const [poolCount,     setPoolCount]     = useState(0);
  const [offlineIssued, setOfflineIssued] = useState(0);
  const [syncPending,   setSyncPending]   = useState(0);
  const [isSyncing,     setIsSyncing]     = useState(false);
  const [isPrefetching, setIsPrefetching] = useState(false);

  const todayDateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const syncingRef   = useRef(false);

  const refreshCounts = useCallback(async () => {
    const [pool, pending] = await Promise.all([
      offlineStore.getPoolCount(todayDateStr),
      offlineStore.getPendingSync(),
    ]);
    setPoolCount(pool.available);
    setOfflineIssued(pool.offlineIssued);
    setSyncPending(pending.length);
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

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && syncPending > 0 && !syncingRef.current) {
      sync();
    }
  }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fetch: reserve a block of coupon numbers + cache today's data
  const prefetch = useCallback(async (qty = 200) => {
    setIsPrefetching(true);
    try {
      const res  = await reserveOffline({ qty, date: new Date().toISOString().split('T')[0] });
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
      toast.success(`${coupons.length} coupons ready for offline use`);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Pre-fetch failed');
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
      if (!pending.length) { toast('Nothing to sync'); return; }

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
      toast.success(`Synced ${total} record${total !== 1 ? 's' : ''}${skipped ? ` (${skipped} skipped)` : ''}`);
    } catch (err) {
      toast.error('Sync failed — ' + (err.response?.data?.message || err.message));
    } finally {
      setIsSyncing(false);
      syncingRef.current = false;
    }
  }, [refreshCounts]);

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
