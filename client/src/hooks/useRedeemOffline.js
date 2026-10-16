import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import * as offlineStore from '../utils/offlineStore.js';
import { checkServer, getRedeemCopy, syncOfflineCoupons } from '../api/mahaprasad.api.js';
import { tNow } from '../i18n/index.jsx';

// The food counter's offline mode (MahaprasadRedeem). While the server answers, the phone keeps a
// copy of the coupons that can be served, refreshed every few minutes. When it doesn't — no
// network, or the server or its database is down — scans are checked against that copy and
// saved on the phone. As soon as the server answers again they're sent; any that were served
// elsewhere, cancelled or never sold come back as conflicts to show.
// Works on its own: the issue counter's screen (useOfflineMode) isn't needed on this phone.

export const CONFLICTS_KEY = 'mgm-redeem-conflicts';
const COPY_KEY   = 'mgm-redeem-copy';   // { at, count, validityDays } of the last download
const PROBE_MS   = 30 * 1000;
const REFRESH_MS = 5 * 60 * 1000;

export const readCopyMeta = () => { try { return JSON.parse(localStorage.getItem(COPY_KEY) || 'null'); } catch { return null; } };
// No answer at all, or the server says it can't serve (5xx) — anything else means it's up
export const serverDown = (err) => !err?.response || err.response.status >= 500;

export function useRedeemOffline({ onConflicts } = {}) {
  const [online,  setOnline]  = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [copy,    setCopy]    = useState(readCopyMeta);   // null until the first download
  const [sending, setSending] = useState(false);
  const onlineRef    = useRef(online);   // for callbacks that mustn't re-create on every change
  const sendingRef   = useRef(false);
  const conflictsRef = useRef(onConflicts);
  useEffect(() => { onlineRef.current = online; }, [online]);
  useEffect(() => { conflictsRef.current = onConflicts; }, [onConflicts]);

  const refreshPending = useCallback(async () => {
    try {
      const queued = await offlineStore.getPendingSync();
      setPending(queued.filter((p) => p.type === 'redeem').length);
    } catch { /* IndexedDB unavailable (private window) — nothing can be queued either */ }
  }, []);

  const download = useCallback(async () => {
    try {
      const { coupons = [], validityDays, at } = (await getRedeemCopy()).data.data;
      await offlineStore.clearOldData();
      await offlineStore.storeOnlineIssued(coupons);
      const meta = { at, count: coupons.length, validityDays };
      try { localStorage.setItem(COPY_KEY, JSON.stringify(meta)); } catch { /* not kept */ }
      setCopy(meta);
    } catch (err) {
      if (serverDown(err)) setOnline(false);
    }
  }, []);

  // Sends this phone's offline redemptions (only those — sales made offline belong to the issue
  // counter). Everything sent is marked done: the server records each one or says why not.
  const send = useCallback(async ({ quiet = true } = {}) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      const queued = (await offlineStore.getPendingSync()).filter((p) => p.type === 'redeem');
      if (!queued.length) { if (!quiet) toast(tNow('Nothing to sync')); return; }
      const res = await syncOfflineCoupons({
        issued: [],
        redeemed: queued.map((p) => ({ couponNumber: p.couponNumber, ...p.data })),
      });
      const results = res.data.data.results;
      await offlineStore.markSynced(queued.map((p) => p.id));
      const conflicts = results.redeemed?.conflicts || [];
      if (conflicts.length) {
        let all = conflicts;
        try {
          const earlier = JSON.parse(localStorage.getItem(CONFLICTS_KEY) || '[]');
          all = [...earlier.filter((e) => !conflicts.some((c) => c.couponNumber === e.couponNumber)), ...conflicts];
          localStorage.setItem(CONFLICTS_KEY, JSON.stringify(all));
        } catch { /* shown below anyway */ }
        conflictsRef.current?.(all);
      }
      const ok = results.redeemed?.ok || 0;
      if (ok) toast.success(tNow(ok !== 1 ? '{n} offline redemptions synced' : '{n} offline redemption synced', { n: ok }));
    } catch (err) {
      if (serverDown(err)) setOnline(false);
      if (!quiet) toast.error(tNow('Sync failed — {reason}', { reason: err.response?.data?.message || err.message }));
    } finally {
      sendingRef.current = false;
      setSending(false);
      await refreshPending();
    }
  }, [refreshPending]);

  // Send first, then download, so the copy reflects what was just sent
  const sendThenDownload = useCallback(async (opts) => { await send(opts); await download(); }, [send, download]);

  // Is the server answering? Now, every 30 s, and when the network comes or goes.
  useEffect(() => {
    let stopped = false;
    const probe = async () => {
      if (!navigator.onLine) { setOnline(false); return; }
      try { await checkServer(); if (!stopped) setOnline(true); }
      catch (err) { if (!stopped && serverDown(err)) setOnline(false); }
    };
    const goOffline = () => setOnline(false);
    probe();
    const timer = setInterval(probe, PROBE_MS);
    window.addEventListener('online', probe);
    window.addEventListener('offline', goOffline);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('online', probe);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // While online: send what's waiting, then refresh the copy — now and every few minutes
  useEffect(() => {
    refreshPending();
    if (!online) return undefined;
    sendThenDownload();
    const timer = setInterval(sendThenDownload, REFRESH_MS);
    return () => clearInterval(timer);
  }, [online, sendThenDownload, refreshPending]);

  return {
    online,
    onlineRef,
    pending,
    sending,
    copy,                                   // { at, count, validityDays } or null
    sendNow: () => sendThenDownload({ quiet: false }),
    refreshPending,
    // A request just got no answer (or a 5xx): treat the server as down until the next check passes
    markServerDown: () => setOnline(false),
  };
}
