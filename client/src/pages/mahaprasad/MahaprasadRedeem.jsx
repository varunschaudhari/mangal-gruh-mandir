import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  ScanLine, KeyboardIcon, CheckCircle2, XCircle, RotateCcw,
  Clock, AlertTriangle, Info, ChevronRight, CloudOff, CloudUpload,
  Maximize2, Minimize2, Users,
} from 'lucide-react';
import { lookupCoupon, redeemCoupon, getDailySummary } from '../../api/mahaprasad.api.js';
import { CONFLICTS_KEY, readCopyMeta, serverDown, useRedeemOffline } from '../../hooks/useRedeemOffline.js';
import { useAuth } from '../../context/AuthContext.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import * as offlineStore from '../../utils/offlineStore.js';
import toast from 'react-hot-toast';
import redeemFeedback from '../../utils/redeemFeedback.js';
import { isNative } from '../../utils/platform.js';
import { scanQrCode } from '../../utils/nativeScanner.js';
import { useBackHandler } from '../../hooks/useBackHandler.js';
import { localDateStr } from '../../utils/formatters.js';
import { useT } from '../../i18n/index.jsx';

const fmt     = (d) => d ? new Date(d).toLocaleString('en-IN',  { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const todayStr = () => localDateStr();

// Full coupon number pattern: MP-YYYYMMDD-NNN (or more digits)
const FULL_COUPON_RE = /^MP-\d{8}-\d{3,}$/;

// html5-qrcode's stop() throws synchronously (not a rejected promise) when the camera never
// started, e.g. permission denied — which would otherwise crash the page from an effect cleanup.
const stopScanner = (inst) => {
  try { return inst.stop().catch(() => {}); } catch { return Promise.resolve(); }
};

// ── Stats bar with progress ────────────────────────────────────────────────────

function StatsBar({ summary }) {
  const t = useT();
  if (!summary) return null;
  const { total = 0, redeemed = 0, pending = 0, cap = 0 } = summary;
  const pct = total > 0 ? Math.round((redeemed / total) * 100) : 0;
  const capUsedPct = cap > 0 ? Math.round((total / cap) * 100) : 0;

  return (
    <div className="card p-4 space-y-2.5">
      <div className="flex items-center justify-between text-xs font-medium text-gray-500">
        <span className="uppercase tracking-wide">{t("Today's Progress")}</span>
        <span className="text-gray-700 font-semibold">{t('{redeemed}/{total} redeemed ({pct}%)', { redeemed, total, pct })}</span>
      </div>

      {/* Redemption progress bar */}
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <span className="text-gray-600"><span className="font-black text-gray-800">{total}</span> {t('issued')}</span>
        <span className="text-green-600"><span className="font-black">{redeemed}</span> {t('redeemed')}</span>
        <span className="text-yellow-600"><span className="font-black">{pending}</span> {t('pending')}</span>
        {cap > 0 && (
          <span className={total >= cap ? 'text-red-600 font-semibold' : 'text-gray-400'}>
            {t('cap {used}/{cap}', { used: total, cap })}
            {total >= cap && ` — ${t('FULL')}`}
          </span>
        )}
      </div>

      {/* Cap usage bar (only when cap is set) */}
      {cap > 0 && (
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${capUsedPct >= 100 ? 'bg-red-500' : capUsedPct >= 80 ? 'bg-orange-400' : 'bg-blue-400'}`}
            style={{ width: `${Math.min(capUsedPct, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ── Error banner ─────────────────────────────────────────────────────────────

const ERROR_CONFIG = {
  notfound:  { bg: 'bg-gray-50  border-gray-200',  icon: XCircle,       iconCls: 'text-gray-400',  title: 'Not Found' },
  expired:   { bg: 'bg-amber-50 border-amber-200', icon: Clock,         iconCls: 'text-amber-500', title: 'Coupon Expired' },
  redeemed:  { bg: 'bg-blue-50  border-blue-200',  icon: Info,          iconCls: 'text-blue-500',  title: 'Already Redeemed' },
  // cancelled, or a number that was never sold
  blocked:   { bg: 'bg-red-50   border-red-300',   icon: XCircle,       iconCls: 'text-red-600',   title: 'Do not serve' },
  error:     { bg: 'bg-red-50   border-red-200',   icon: AlertTriangle, iconCls: 'text-red-500',   title: 'Error' },
};

function ErrorBanner({ message, type, onRetry }) {
  const t = useT();
  const cfg = ERROR_CONFIG[type] || ERROR_CONFIG.error;
  const Icon = cfg.icon;
  return (
    <div className={`card p-4 border ${cfg.bg} flex items-start gap-3`}>
      <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${cfg.iconCls}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">{t(cfg.title)}</p>
        <p className="text-xs text-gray-600 mt-0.5">{message}</p>
      </div>
      <button onClick={onRetry}
        className="shrink-0 text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1 whitespace-nowrap max-sm:-my-2 max-sm:py-2.5 max-sm:text-sm max-sm:text-gray-500">
        <RotateCcw className="h-3.5 w-3.5" /> {t('Try again')}
      </button>
    </div>
  );
}

// ── Coupon result card ────────────────────────────────────────────────────────

function CouponCard({ coupon, onRedeem, redeeming, justRedeemed, countdown }) {
  const t = useT();
  const isRedeemed = coupon.status === 'redeemed';

  const isGroupCoupon = coupon.isGroup && (coupon.groupSize || 1) > 1;
  const groupSize     = coupon.groupSize || 1;

  if (justRedeemed) {
    return (
      <div className="card p-6 border-2 border-green-300 bg-green-50 text-center space-y-3">
        <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto" />
        <div>
          <p className="text-lg font-black text-green-800">{t('Redeemed!')}</p>
          <p className="font-mono text-sm text-green-700 mt-0.5">{coupon.couponNumber}</p>
          {isGroupCoupon && (
            <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-sm font-semibold">
              <Users className="h-3.5 w-3.5" /> {t('{n} persons', { n: groupSize })}
            </div>
          )}
          {coupon.type === 'free' && coupon.occasion && (
            <p className="text-xs text-green-600 mt-1">{coupon.occasion}</p>
          )}
        </div>
        {countdown !== null && (
          <p className="text-sm text-green-600">
            {t('Next scan in')} <span className="font-bold">{t('{n}s', { n: countdown })}</span>…
          </p>
        )}
        <div className="h-1.5 bg-green-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-1000"
            style={{ width: `${((2 - (countdown ?? 0)) / 2) * 100}%` }}
          />
        </div>
      </div>
    );
  }

  if (isRedeemed) {
    return (
      <div className="card p-5 border-2 border-red-300 bg-red-50 space-y-3">
        <div className="flex items-center gap-3">
          <XCircle className="h-9 w-9 text-red-500 shrink-0" />
          <div>
            <p className="text-sm font-black text-red-700 uppercase tracking-wide">{t('Already Redeemed')}</p>
            <p className="font-mono text-sm font-bold text-red-800 mt-0.5">{coupon.couponNumber}</p>
          </div>
          <span className="ml-auto text-xs font-bold bg-red-200 text-red-700 px-2.5 py-1 rounded-full shrink-0">{t('Used')}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm pt-2 border-t border-red-200">
          <div>
            <p className="text-xs text-red-400 font-medium">{t('Redeemed at')}</p>
            <p className="font-semibold text-red-800">{fmt(coupon.redeemedAt)}</p>
          </div>
          <div>
            <p className="text-xs text-red-400 font-medium">{t('Redeemed by')}</p>
            <p className="font-semibold text-red-800">{coupon.redeemedBy?.name || '—'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5 border-2 border-green-300 bg-green-50 space-y-4">
      {/* Coupon identity */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-lg font-black text-gray-900 tracking-wide">{coupon.couponNumber}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {new Date(coupon.date).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${coupon.type === 'free' ? 'bg-green-200 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
            {coupon.type === 'free' ? (coupon.occasion || t('Free Seva')) : `${t('Paid|coupon')} · ₹${coupon.amount}`}
          </span>
          {isGroupCoupon && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-100 text-purple-700">
              <Users className="h-3 w-3" /> {t('{n} persons', { n: groupSize })}
            </span>
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-xs text-gray-400">{t('Issued by')}</p>
          <p className="font-medium text-gray-800">{coupon.issuedBy?.name || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">{t('Issued at')}</p>
          <p className="font-medium text-gray-800">{fmt(coupon.issuedAt)}</p>
        </div>
      </div>

      {/* Redeem button */}
      <button
        onClick={onRedeem}
        disabled={redeeming}
        className="w-full py-3.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-base flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
        <CheckCircle2 className="h-5 w-5" />
        {redeeming ? t('Redeeming…') : t('Mark as Redeemed')}
        {!redeeming && !isNative && <span className="hidden sm:inline text-xs font-normal opacity-60 ml-1">(Enter ↵)</span>}
      </button>
    </div>
  );
}

// ── Recent redemptions ────────────────────────────────────────────────────────

function RecentList({ items }) {
  const t = useT();
  if (!items.length) return null;
  return (
    <div className="card p-4 space-y-2">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('This session')}</p>
      <div className="space-y-2">
        {items.map((c) => (
          <div key={c._id} className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
            <span className="font-mono text-gray-700 flex-1 min-w-0 truncate">{c.couponNumber}</span>
            <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${c.type === 'free' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
              {c.type === 'free' ? t('Free') : `₹${c.amount}`}
            </span>
            <span className="shrink-0 text-xs text-gray-400">{fmt(c.redeemedAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MahaprasadRedeem() {
  const t = useT();
  // ?code=MP-… — a coupon scanned from the app bar scanner: show it for confirmation.
  const [searchParams, setSearchParams] = useSearchParams();
  const scannedCode = useRef(searchParams.get('code')).current;
  const qc          = useQueryClient();
  const [mode,       setMode]      = useState('scan');   // 'scan' | 'manual'
  const [manualNum,  setManualNum] = useState('');
  const [coupon,     setCoupon]    = useState(null);
  const [error,      setError]     = useState('');
  const [errorType,  setErrorType] = useState('error');
  const [looking,    setLooking]   = useState(false);
  const [justRedeemed, setJustRedeemed] = useState(false);
  const [countdown,  setCountdown] = useState(null);
  const [recent,     setRecent]    = useState([]);
  const [syncConflicts, setSyncConflicts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CONFLICTS_KEY) || '[]'); } catch { return []; }
  });
  const dismissConflicts = useCallback(() => {
    localStorage.removeItem(CONFLICTS_KEY);
    setSyncConflicts([]);
  }, []);
  // Offline mode of its own: a copy of the coupons, and redemptions sent when the server is back
  const offline = useRedeemOffline({ onConflicts: setSyncConflicts });
  const { user } = useAuth();

  const [scanKey, setScanKey] = useState(0);

  const scannerInst    = useRef(null);
  const stopPromiseRef = useRef(null); // tracks in-flight stop so new start() always awaits it
  const inputRef       = useRef(null);
  const decodedRef     = useRef(false); // guard against double-scan callback
  const resetRef       = useRef(null);  // always-current reset so countdown closure is never stale
  const wakeLockRef = useRef(null);
  const backStateRef = useRef({ coupon: null, justRedeemed: false });

  // Mobile apps: ML Kit full-screen scanner instead of the in-page html5-qrcode camera.
  const [nativeScanning, setNativeScanning] = useState(false);
  // user closed the scanner — don't reopen it on their behalf (nor when a coupon arrived via ?code)
  const nativeDismissedRef = useRef(Boolean(scannedCode));

  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  // Keep screen awake while the redeem counter is open
  useEffect(() => {
    const acquire = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        }
      } catch {}
    };
    acquire();
    const onVisible = () => { if (!document.hidden) acquire(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      wakeLockRef.current?.release().catch(() => {});
    };
  }, []);

  // Track fullscreen state for the toggle button
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const { data: summaryRes, refetch: refetchSummary } = useQuery({
    queryKey: ['mahaprasad-summary', todayStr()],
    queryFn:  () => getDailySummary(todayStr()),
    staleTime:      30 * 1000,
    refetchInterval: 60 * 1000, // keep live while screen is open (multi-device)
  });
  const summary = summaryRes?.data?.data || null;

  // ── Lookup handler (stable ref) ──────────────────────────────────────────
  const handleLookup = useCallback(async (number, { autoRedeem = false } = {}) => {
    if (!number) return;
    setLooking(true);
    setError('');
    setCoupon(null);

    // Offline: check the coupon against this phone's copy (kept up to date by useRedeemOffline)
    const lookupOffline = async () => {
      const local = await offlineStore.lookupCoupon(number);
      if (!local) {
        setError(readCopyMeta()
          ? t('Coupon "{number}" not found in offline cache', { number })
          : t('No offline copy on this phone yet — it downloads the coupons once it’s connected'));
        setErrorType('notfound');
        redeemFeedback.notFound();
        return;
      }
      const status = local.status;
      if (status === 'available') {
        setError(t('Coupon "{number}" has not been issued yet', { number }));
        setErrorType('notfound');
        redeemFeedback.notFound();
        return;
      }
      if (status === 'redeemed' || status === 'redeemed-offline') {
        setCoupon(offlineStore.normalizeForUi(local));
        redeemFeedback.alreadyRedeemed();
        return;
      }
      if (status === 'voided') {
        setError(t('Coupon {number} was cancelled — do not serve', { number }));
        setErrorType('blocked');
        redeemFeedback.error();
        return;
      }
      // Same validity rule as the server
      const validityDays = readCopyMeta()?.validityDays ?? 1;
      if (validityDays > 0) {
        const day = new Date(local.date); day.setHours(0, 0, 0, 0);
        const expires = new Date(day); expires.setDate(expires.getDate() + validityDays);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (today >= expires) {
          setError(t('Coupon expired — was valid for {n} day(s) from {date}', {
            n: validityDays, date: day.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
          }));
          setErrorType('expired');
          redeemFeedback.expired();
          return;
        }
      }
      const normalizedLocal = offlineStore.normalizeForUi(local);
      if (autoRedeem) {
        redeemMut.mutate(normalizedLocal);
      } else {
        setCoupon(normalizedLocal);
      }
    };

    const tryOffline = () => lookupOffline().catch(() => {
      setError(t('This phone’s offline copy could not be read'));
      setErrorType('error');
      redeemFeedback.error();
    });

    if (!offline.onlineRef.current) {
      await tryOffline();
      setLooking(false);
      return;
    }
    try {
      const res = await lookupCoupon(number);
      const couponData = res.data.data;
      if (couponData.status === 'redeemed') {
        setCoupon(couponData);
        redeemFeedback.alreadyRedeemed();
        return;
      }
      if (couponData.status === 'voided' || couponData.status === 'reserved') {
        setError(couponData.status === 'voided'
          ? t('Coupon {number} was cancelled — do not serve', { number })
          : t('Coupon {number} has not been sold — if it was issued offline, sync that counter first', { number }));
        setErrorType('blocked');
        redeemFeedback.error();
        return;
      }
      if (autoRedeem) {
        redeemMut.mutate(couponData);
      } else {
        setCoupon(couponData);
      }
    } catch (e) {
      // The server isn't answering: switch to offline mode and use this phone's copy right away
      if (serverDown(e)) {
        offline.markServerDown();
        await tryOffline();
        return;
      }
      const status  = e.response?.status;
      const message = e.response?.data?.message || t('Coupon "{number}" not found', { number });
      setError(message);
      setErrorType(status === 404 ? 'notfound' : status === 410 ? 'expired' : 'error');
      if (status === 404)      redeemFeedback.notFound();
      else if (status === 410) redeemFeedback.expired();
      else                     redeemFeedback.error();
    } finally {
      setLooking(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]); // redeemMut.mutate is stable and only called after all hooks have run

  const launchNativeScan = useCallback(async () => {
    nativeDismissedRef.current = false;
    setNativeScanning(true);
    try {
      const text = await scanQrCode();
      if (text) handleLookup(text, { autoRedeem: true });
      else nativeDismissedRef.current = true;
    } catch (e) {
      nativeDismissedRef.current = true;
      toast.error(e?.message || t('Scanner not available — use manual entry'));
    } finally {
      setNativeScanning(false);
    }
  }, [handleLookup, t]);

  useEffect(() => {
    if (!scannedCode) return;
    setSearchParams({}, { replace: true });
    handleLookup(scannedCode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Camera scanner ───────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'scan') return;
    decodedRef.current = false;
    let active = true;

    if (isNative) {
      // Open the scanner straight away (and again after each redemption) unless the
      // user just closed it — then they tap the big scan button when ready.
      if (!nativeDismissedRef.current) launchNativeScan();
      return () => { active = false; };
    }

    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (!active) return;

        // Wait for any in-flight stop to finish before requesting the camera again.
        // Without this, getUserMedia can fail on some devices because the old stream
        // hasn't been released yet when we try to open a new one.
        if (stopPromiseRef.current) {
          await stopPromiseRef.current.catch(() => {});
          stopPromiseRef.current = null;
        }
        if (!active) return;

        // Manually wipe the container so Html5Qrcode never sees leftover
        // video/canvas elements from a previous session.
        const container = document.getElementById('qr-reader');
        if (container) container.innerHTML = '';
        if (!active) return;

        const qrCode = new Html5Qrcode('qr-reader');
        scannerInst.current = qrCode;

        await qrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decoded) => {
            if (decodedRef.current) return;
            decodedRef.current = true;
            // Track the stop promise so the next start() can wait for it.
            stopPromiseRef.current = stopScanner(qrCode);
            scannerInst.current = null;
            handleLookup(decoded.trim(), { autoRedeem: true });
          },
          () => {}
        );
      } catch {
        if (active) {
          setMode('manual');
          toast.error(t('Camera not available — use manual entry'));
        }
      }
    })();

    return () => {
      active = false;
      const inst = scannerInst.current;
      if (inst) {
        scannerInst.current = null;
        stopPromiseRef.current = stopScanner(inst);
      }
    };
  }, [mode, scanKey, handleLookup, launchNativeScan, t]);

  useEffect(() => {
    if (mode === 'manual') inputRef.current?.focus();
  }, [mode]);

  // ── Auto-reset countdown after successful redemption ─────────────────────
  useEffect(() => {
    if (!justRedeemed) return;
    let c = 2;
    setCountdown(c);
    const t = setInterval(() => {
      c -= 1;
      setCountdown(c);
      if (c === 0) { clearInterval(t); resetRef.current?.(); }
    }, 1000);
    return () => clearInterval(t);
  }, [justRedeemed]);

  // ── Redeem mutation ───────────────────────────────────────────────────────
  const redeemMut = useMutation({
    // Run even when the browser says it's offline: this mutation itself chooses the server or the
    // phone. (React Query's default pauses it while offline, which left "Redeeming…" spinning.)
    networkMode: 'always',
    mutationFn: async (couponArg) => {
      const target = couponArg ?? coupon;
      if (!target) throw new Error(t('No coupon to redeem'));
      if (!offline.onlineRef.current) {
        // Saved on this phone; useRedeemOffline sends it when the server is back
        const updated = await offlineStore.markRedeemed(target.couponNumber, {
          redeemedAt:     new Date().toISOString(),
          redeemedById:   user?._id || user?.id || '',
          redeemedByName: user?.name || 'Staff',
        });
        if (!updated) throw new Error(t('Coupon not found in offline store'));
        return { wasOffline: true, coupon: offlineStore.normalizeForUi(updated) };
      }
      const res = await redeemCoupon(target.couponNumber);
      return { wasOffline: false, coupon: res.data.data };
    },
    onSuccess: ({ wasOffline, coupon: redeemed }) => {
      redeemFeedback.success();
      setCoupon(redeemed);
      setJustRedeemed(true);
      setRecent((prev) => [redeemed, ...prev].slice(0, 5));
      if (wasOffline) {
        offline.refreshPending();
      } else {
        refetchSummary();
        qc.invalidateQueries({ queryKey: ['mahaprasad-coupons'] });
      }
      toast.success(wasOffline ? t('Redeemed offline — will sync later') : t('Coupon redeemed!'));
    },
    onError: (e) => {
      // No answer from the server: it may or may not have recorded this one, so don't save it
      // offline as well. Switch to offline mode; the next scan is checked on this phone.
      if (e.isAxiosError && serverDown(e)) {
        offline.markServerDown();
        const message = t('The server isn’t answering — switched to offline mode. Scan the coupon again.');
        setError(message);
        setErrorType('error');
        setCoupon(null);
        redeemFeedback.error();
        toast.error(message);
        return;
      }
      const status  = e.response?.status;
      const message = e.response?.data?.message || e.message || t('Failed to redeem');
      const code    = e.response?.data?.errors?.[0]?.code; // voided / not_sold / redeemed
      setError(message);
      if (code === 'voided' || code === 'not_sold') {
        setCoupon(null);
        setErrorType('blocked');
        redeemFeedback.error();
        toast.error(message);
        return;
      }
      setErrorType(status === 409 ? 'redeemed' : status === 410 ? 'expired' : 'error');
      if (status === 409)      redeemFeedback.alreadyRedeemed();
      else if (status === 410) redeemFeedback.expired();
      else                     redeemFeedback.error();
      toast.error(message);
    },
  });

  // ── Reset helper ──────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setCoupon(null);
    setError('');
    setErrorType('error');
    setManualNum('');
    setJustRedeemed(false);
    setCountdown(null);
    decodedRef.current = false;
    if (mode === 'manual') {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      // Bump scanKey — mode stays 'scan' but the effect re-runs, restarting the camera
      setScanKey((k) => k + 1);
    }
  }, [mode]);
  // Keep the ref current every render so the countdown interval closure
  // always calls the latest reset (avoids stale-mode bug without useEffect timing).
  resetRef.current = reset;

  // Android hardware back button: clear coupon card if one is showing, otherwise swallow the press
  // Uses a ref so the popstate handler never goes stale without re-registering
  useEffect(() => { backStateRef.current = { coupon, justRedeemed }; }, [coupon, justRedeemed]);
  // Mobile apps: the native back button clears the coupon card first, then navigates normally.
  useBackHandler(isNative && Boolean(coupon) && !justRedeemed, reset);
  useEffect(() => {
    if (isNative) return undefined;
    window.history.pushState(null, '', window.location.pathname);
    const handler = () => {
      window.history.pushState(null, '', window.location.pathname);
      const { coupon: c, justRedeemed: jr } = backStateRef.current;
      if (c && !jr) reset();
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [reset]);

  // Enter key confirms redeem in manual mode when a valid coupon card is showing
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Enter') return;
      if (mode !== 'manual') return;
      if (!coupon || coupon.status === 'redeemed' || justRedeemed || redeemMut.isPending) return;
      redeemMut.mutate();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [coupon, justRedeemed, redeemMut, mode]);

  // ── Manual input: auto-submit on full coupon number ───────────────────────
  const handleManualChange = (val) => {
    const upper = val.toUpperCase();
    setManualNum(upper);
    if (FULL_COUPON_RE.test(upper.trim())) {
      handleLookup(upper.trim());
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)
        ?.call(document.documentElement);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-md mx-auto space-y-4 pb-6">
      {/* Phones: keep the subtitle clear of the fullscreen toggle */}
      <div className={`relative ${isNative ? '' : 'max-lg:pr-10'}`}>
        <PageHeader
          title="Redeem Coupon"
          subtitle="Scan QR code or type the coupon number"
          breadcrumbs={[{ label: 'Mahaprasad', to: '/mahaprasad' }, { label: 'Redeem' }]}
        />
        {!isNative && <button
          onClick={toggleFullscreen}
          title={isFullscreen ? t('Exit fullscreen') : t('Fullscreen')}
          aria-label={isFullscreen ? t('Exit fullscreen') : t('Fullscreen')}
          className="absolute top-0 right-0 p-1.5 max-lg:p-2.5 max-lg:-mt-2 max-lg:-mr-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>}
      </div>

      {!offline.online && (
        <div className={`card p-3 border flex items-start gap-2 text-sm ${offline.copy ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
          <CloudOff className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p>{t('Offline mode — looking up coupons from local cache. Redemptions will sync automatically when back online.')}</p>
            <p className="text-xs mt-0.5 opacity-80">
              {offline.copy
                ? t('Copy on this phone: {n} coupons, updated {time}', { n: offline.copy.count, time: fmt(offline.copy.at) })
                : t('No offline copy on this phone yet — it downloads the coupons once it’s connected')}
            </p>
          </div>
        </div>
      )}

      {offline.pending > 0 && (
        <div className="card p-3 border border-blue-200 bg-blue-50 flex items-center gap-2 text-sm text-blue-800">
          <CloudUpload className="h-4 w-4 shrink-0" />
          <span className="flex-1 min-w-0">
            {t(offline.pending !== 1 ? '{n} redemptions waiting to sync' : '{n} redemption waiting to sync', { n: offline.pending })}
          </span>
          {offline.online && (
            <button type="button" onClick={offline.sendNow} disabled={offline.sending}
              className="shrink-0 btn btn-ghost border border-blue-200 bg-white text-xs px-2.5 py-1 max-sm:py-2 disabled:opacity-50">
              {offline.sending ? t('Syncing…') : t('Sync now')}
            </button>
          )}
        </div>
      )}

      {syncConflicts.length > 0 && (
        <div className="card p-3 border border-red-200 bg-red-50 text-sm text-red-800">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{t(syncConflicts.length > 1 ? 'Sync conflict — {n} coupons could not be redeemed' : 'Sync conflict — {n} coupon could not be redeemed', { n: syncConflicts.length })}</p>
                <p className="text-xs text-red-600 mt-0.5">{t('These were already redeemed on another device, cancelled, or never sold.')}</p>
                <p className="text-xs font-mono mt-1 text-red-700">{syncConflicts.map((c) => c.couponNumber).join(', ')}</p>
              </div>
            </div>
            <button onClick={dismissConflicts} aria-label={t('Dismiss')}
              className="text-red-400 hover:text-red-600 shrink-0 text-xl leading-none max-sm:-m-2 max-sm:p-2.5">&times;</button>
          </div>
        </div>
      )}

      <StatsBar summary={summary} />

      {/* Mode toggle */}
      <div className="card p-1 flex gap-1">
        {[
          { key: 'scan',   label: 'Scan QR',     icon: ScanLine     },
          { key: 'manual', label: 'Manual Entry', icon: KeyboardIcon },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key}
            onClick={() => {
              setCoupon(null); setError(''); setJustRedeemed(false); setCountdown(null);
              setManualNum('');
              setMode(key);
              if (key === 'scan') { nativeDismissedRef.current = false; setScanKey((k) => k + 1); }
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
              mode === key ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'
            }`}>
            <Icon className="h-4 w-4" /> {t(label)}
          </button>
        ))}
      </div>

      {/* Input area — hidden once a coupon is loaded */}
      {!coupon && !justRedeemed && (
        <>
          {mode === 'scan' && isNative && (
            <div className="card overflow-hidden relative">
              <button
                onClick={launchNativeScan}
                disabled={nativeScanning || looking || redeemMut.isPending}
                className="w-full flex flex-col items-center gap-3 px-6 py-10 active:bg-gray-50"
              >
                <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary-600 text-white shadow-lg shadow-primary-600/30">
                  <ScanLine className="h-10 w-10" />
                </span>
                <span className="text-base font-semibold text-gray-800">
                  {nativeScanning ? t('Scanner open…') : t('Tap to scan coupon')}
                </span>
                <span className="text-xs text-gray-400">{t('Point the camera at the QR code on the coupon')}</span>
              </button>
              {(looking || redeemMut.isPending) && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <div className="bg-white rounded-xl px-5 py-4 text-sm font-semibold text-gray-700 flex items-center gap-2.5">
                    <div className={`h-4 w-4 border-2 border-t-transparent rounded-full animate-spin ${redeemMut.isPending ? 'border-green-500' : 'border-primary-500'}`} />
                    {redeemMut.isPending ? t('Redeeming…') : t('Looking up coupon…')}
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === 'scan' && !isNative && (
            <div className="card overflow-hidden relative">
              <div id="qr-reader" className="w-full" style={{ minHeight: 280 }} />
              {(looking || redeemMut.isPending) && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <div className="bg-white rounded-xl px-5 py-4 text-sm font-semibold text-gray-700 flex items-center gap-2.5">
                    <div className={`h-4 w-4 border-2 border-t-transparent rounded-full animate-spin ${redeemMut.isPending ? 'border-green-500' : 'border-primary-500'}`} />
                    {redeemMut.isPending ? t('Redeeming…') : t('Looking up coupon…')}
                  </div>
                </div>
              )}
              <p className="text-xs text-center text-gray-400 py-2 px-4">
                {t('Point the camera at the QR code on the coupon')}
              </p>
            </div>
          )}

          {mode === 'manual' && (
            <div className="card p-5 space-y-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {t('Coupon Number')}
              </label>
              <input
                ref={inputRef}
                value={manualNum}
                onChange={(e) => handleManualChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLookup(manualNum.trim())}
                className="input font-mono text-lg tracking-widest text-center"
                placeholder="MP-20260611-001"
                autoComplete="off"
              />
              <button
                onClick={() => handleLookup(manualNum.trim())}
                disabled={!manualNum.trim() || looking}
                className="w-full btn-primary py-3 font-semibold flex items-center justify-center gap-2">
                {looking
                  ? <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> {t('Looking up…')}</>
                  : <><ChevronRight className="h-4 w-4" /> {t('Look Up')}</>
                }
              </button>
              <p className="text-xs text-center text-gray-400">{t('Tip: submits automatically on a full coupon number')}</p>
            </div>
          )}
        </>
      )}

      {/* Error banner */}
      {error && !coupon && (
        <ErrorBanner message={error} type={errorType} onRetry={reset} />
      )}

      {/* Coupon result */}
      {coupon && (
        <div className="space-y-3">
          <CouponCard
            coupon={coupon}
            onRedeem={() => { redeemMut.reset(); redeemMut.mutate(); }}
            redeeming={redeemMut.isPending}
            justRedeemed={justRedeemed}
            countdown={countdown}
          />
          {/* Inline redeem error — the toast vanishes after 4s so staff can miss it */}
          {redeemMut.isError && !justRedeemed && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {redeemMut.error?.response?.data?.message || redeemMut.error?.message || t('Redemption failed — try again')}
            </div>
          )}
          {!justRedeemed && (
            <button onClick={reset}
              className="w-full btn btn-ghost border text-sm flex items-center justify-center gap-1.5 py-2.5">
              <RotateCcw className="h-4 w-4" /> {t('Scan Next Coupon')}
            </button>
          )}
          {justRedeemed && (
            <button onClick={reset}
              className="w-full text-sm text-gray-400 hover:text-gray-600 py-1">
              {t('Skip countdown and scan next →')}
            </button>
          )}
        </div>
      )}

      {/* Recent redemptions (this session) */}
      {!coupon && !justRedeemed && <RecentList items={recent} />}
    </div>
  );
}
