import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ScanLine, KeyboardIcon, CheckCircle2, XCircle, RotateCcw,
  Clock, AlertTriangle, Info, ChevronRight, CloudOff,
  Maximize2, Minimize2,
} from 'lucide-react';
import { lookupCoupon, redeemCoupon, getDailySummary } from '../../api/mahaprasad.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import * as offlineStore from '../../utils/offlineStore.js';
import toast from 'react-hot-toast';
import redeemFeedback from '../../utils/redeemFeedback.js';

const fmt     = (d) => d ? new Date(d).toLocaleString('en-IN',  { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const todayStr = () => new Date().toISOString().split('T')[0];

// Full coupon number pattern: MP-YYYYMMDD-NNN (or more digits)
const FULL_COUPON_RE = /^MP-\d{8}-\d{3,}$/;

// ── Stats bar with progress ────────────────────────────────────────────────────

function StatsBar({ summary }) {
  if (!summary) return null;
  const { total = 0, redeemed = 0, pending = 0, cap = 0 } = summary;
  const pct = total > 0 ? Math.round((redeemed / total) * 100) : 0;
  const capUsedPct = cap > 0 ? Math.round((total / cap) * 100) : 0;

  return (
    <div className="card p-4 space-y-2.5">
      <div className="flex items-center justify-between text-xs font-medium text-gray-500">
        <span className="uppercase tracking-wide">Today's Progress</span>
        <span className="text-gray-700 font-semibold">{redeemed}/{total} redeemed ({pct}%)</span>
      </div>

      {/* Redemption progress bar */}
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <span className="text-gray-600"><span className="font-black text-gray-800">{total}</span> issued</span>
        <span className="text-green-600"><span className="font-black">{redeemed}</span> redeemed</span>
        <span className="text-yellow-600"><span className="font-black">{pending}</span> pending</span>
        {cap > 0 && (
          <span className={total >= cap ? 'text-red-600 font-semibold' : 'text-gray-400'}>
            cap {total}/{cap}
            {total >= cap && ' — FULL'}
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
  error:     { bg: 'bg-red-50   border-red-200',   icon: AlertTriangle, iconCls: 'text-red-500',   title: 'Error' },
};

function ErrorBanner({ message, type, onRetry }) {
  const cfg = ERROR_CONFIG[type] || ERROR_CONFIG.error;
  const Icon = cfg.icon;
  return (
    <div className={`card p-4 border ${cfg.bg} flex items-start gap-3`}>
      <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${cfg.iconCls}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">{cfg.title}</p>
        <p className="text-xs text-gray-600 mt-0.5">{message}</p>
      </div>
      <button onClick={onRetry}
        className="shrink-0 text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1 whitespace-nowrap">
        <RotateCcw className="h-3.5 w-3.5" /> Try again
      </button>
    </div>
  );
}

// ── Coupon result card ────────────────────────────────────────────────────────

function CouponCard({ coupon, onRedeem, redeeming, justRedeemed, countdown }) {
  const isRedeemed = coupon.status === 'redeemed';

  if (justRedeemed) {
    return (
      <div className="card p-6 border-2 border-green-300 bg-green-50 text-center space-y-3">
        <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto" />
        <div>
          <p className="text-lg font-black text-green-800">Redeemed!</p>
          <p className="font-mono text-sm text-green-700 mt-0.5">{coupon.couponNumber}</p>
          {coupon.type === 'free' && coupon.occasion && (
            <p className="text-xs text-green-600 mt-1">{coupon.occasion}</p>
          )}
        </div>
        {countdown !== null && (
          <p className="text-sm text-green-600">
            Next scan in <span className="font-bold">{countdown}s</span>…
          </p>
        )}
        <div className="h-1.5 bg-green-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-1000"
            style={{ width: `${((3 - (countdown ?? 0)) / 3) * 100}%` }}
          />
        </div>
      </div>
    );
  }

  if (isRedeemed) {
    return (
      <div className="card p-5 border-2 border-gray-200 bg-gray-50 space-y-3">
        <div className="flex items-center gap-3">
          <XCircle className="h-8 w-8 text-gray-400 shrink-0" />
          <div>
            <p className="font-mono font-bold text-gray-700">{coupon.couponNumber}</p>
            <p className="text-xs text-gray-400 mt-0.5">This coupon was already used</p>
          </div>
          <span className="ml-auto text-xs font-semibold bg-gray-200 text-gray-600 px-2 py-1 rounded-full">Used</span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm pt-1 border-t border-gray-200">
          <div>
            <p className="text-xs text-gray-400">Redeemed at</p>
            <p className="font-medium text-gray-700">{fmt(coupon.redeemedAt)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Redeemed by</p>
            <p className="font-medium text-gray-700">{coupon.redeemedBy?.name || '—'}</p>
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
        <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${coupon.type === 'free' ? 'bg-green-200 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
          {coupon.type === 'free' ? (coupon.occasion || 'Free Seva') : `Paid · ₹${coupon.amount}`}
        </span>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-xs text-gray-400">Issued by</p>
          <p className="font-medium text-gray-800">{coupon.issuedBy?.name || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Issued at</p>
          <p className="font-medium text-gray-800">{fmt(coupon.issuedAt)}</p>
        </div>
      </div>

      {/* Redeem button */}
      <button
        onClick={onRedeem}
        disabled={redeeming}
        className="w-full py-3.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-base flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
        <CheckCircle2 className="h-5 w-5" />
        {redeeming ? 'Redeeming…' : 'Mark as Redeemed'}
        {!redeeming && <span className="text-xs font-normal opacity-60 ml-1">(Enter ↵)</span>}
      </button>
    </div>
  );
}

// ── Recent redemptions ────────────────────────────────────────────────────────

function RecentList({ items }) {
  if (!items.length) return null;
  return (
    <div className="card p-4 space-y-2">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">This session</p>
      <div className="space-y-2">
        {items.map((c) => (
          <div key={c._id} className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
            <span className="font-mono text-gray-700 flex-1">{c.couponNumber}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${c.type === 'free' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
              {c.type === 'free' ? 'Free' : `₹${c.amount}`}
            </span>
            <span className="text-xs text-gray-400">{fmt(c.redeemedAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MahaprasadRedeem() {
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
    try { return JSON.parse(localStorage.getItem('mgm-redeem-conflicts') || '[]'); } catch { return []; }
  });
  const dismissConflicts = useCallback(() => {
    localStorage.removeItem('mgm-redeem-conflicts');
    setSyncConflicts([]);
  }, []);

  const [scanKey, setScanKey] = useState(0);

  const scannerRef  = useRef(null);
  const scannerInst = useRef(null);
  const inputRef    = useRef(null);
  const decodedRef  = useRef(false); // guard against double-scan callback
  const wakeLockRef = useRef(null);
  const backStateRef = useRef({ coupon: null, justRedeemed: false });

  const [isOnline,     setIsOnline]     = useState(navigator.onLine);
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const go  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online',  go);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', go); window.removeEventListener('offline', off); };
  }, []);

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
    staleTime: 30 * 1000,
  });
  const summary = summaryRes?.data?.data || null;

  // ── Lookup handler (stable ref) ──────────────────────────────────────────
  const handleLookup = useCallback(async (number) => {
    if (!number) return;
    setLooking(true);
    setError('');
    setCoupon(null);
    try {
      if (!navigator.onLine) {
        // Offline: look up from IndexedDB cache
        const local = await offlineStore.lookupCoupon(number);
        if (!local) {
          setError(`Coupon "${number}" not found in offline cache`);
          setErrorType('notfound');
          redeemFeedback.notFound();
          return;
        }
        const status = local.status;
        if (status === 'available') {
          setError(`Coupon "${number}" has not been issued yet`);
          setErrorType('notfound');
          redeemFeedback.notFound();
          return;
        }
        if (status === 'redeemed' || status === 'redeemed-offline') {
          setError('This coupon was already redeemed');
          setErrorType('redeemed');
          setCoupon(offlineStore.normalizeForUi(local));
          redeemFeedback.alreadyRedeemed();
          return;
        }
        setCoupon(offlineStore.normalizeForUi(local));
        return;
      }
      const res = await lookupCoupon(number);
      setCoupon(res.data.data);
    } catch (e) {
      const status  = e.response?.status;
      const message = e.response?.data?.message || `Coupon "${number}" not found`;
      setError(message);
      setErrorType(status === 404 ? 'notfound' : status === 410 ? 'expired' : 'error');
      if (status === 404)      redeemFeedback.notFound();
      else if (status === 410) redeemFeedback.expired();
      else                     redeemFeedback.error();
    } finally {
      setLooking(false);
    }
  }, []);

  // ── Camera scanner ───────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'scan') return;
    decodedRef.current = false;
    let active = true;

    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (!active) return;

        // Stop and clear any previous instance before starting fresh.
        // clear() removes the video/canvas elements Html5Qrcode injected into
        // the container — skipping this causes start() to fail on the 2nd scan.
        const prev = scannerInst.current;
        if (prev) {
          try { await prev.stop(); } catch {}
          try { await prev.clear(); } catch {}
          scannerInst.current = null;
        }
        if (!active) return;

        const qrCode = new Html5Qrcode('qr-reader');
        scannerInst.current = qrCode;

        await qrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decoded) => {
            if (decodedRef.current) return;
            decodedRef.current = true;
            qrCode.stop().catch(() => {});
            handleLookup(decoded.trim());
          },
          () => {}
        );
      } catch {
        if (active) {
          setMode('manual');
          toast.error('Camera not available — use manual entry');
        }
      }
    })();

    return () => {
      active = false;
      scannerInst.current?.stop().catch(() => {});
    };
  }, [mode, scanKey, handleLookup]);

  useEffect(() => {
    if (mode === 'manual') inputRef.current?.focus();
  }, [mode]);

  // ── Auto-reset countdown after successful redemption ─────────────────────
  useEffect(() => {
    if (!justRedeemed) return;
    let c = 3;
    setCountdown(c);
    const t = setInterval(() => {
      c -= 1;
      setCountdown(c);
      if (c === 0) { clearInterval(t); reset(); }
    }, 1000);
    return () => clearInterval(t);
  }, [justRedeemed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Redeem mutation ───────────────────────────────────────────────────────
  const redeemMut = useMutation({
    mutationFn: async () => {
      if (!navigator.onLine) {
        const user    = JSON.parse(localStorage.getItem('mgm-offline-user') || '{}');
        const updated = await offlineStore.markRedeemed(coupon.couponNumber, {
          redeemedAt:     new Date().toISOString(),
          redeemedById:   user._id  || '',
          redeemedByName: user.name || 'Staff',
        });
        if (!updated) throw new Error('Coupon not found in offline store');
        return { offline: true, coupon: offlineStore.normalizeForUi(updated) };
      }
      const res = await redeemCoupon(coupon.couponNumber);
      return { offline: false, coupon: res.data.data };
    },
    onSuccess: ({ offline, coupon: redeemed }) => {
      redeemFeedback.success();
      setCoupon(redeemed);
      setJustRedeemed(true);
      setRecent((prev) => [redeemed, ...prev].slice(0, 5));
      if (!offline) {
        refetchSummary();
        qc.invalidateQueries({ queryKey: ['mahaprasad-coupons'] });
      }
      toast.success(offline ? 'Redeemed offline — will sync later' : 'Coupon redeemed!');
    },
    onError: (e) => {
      const status  = e.response?.status;
      const message = e.response?.data?.message || e.message || 'Failed to redeem';
      setError(message);
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

  // Android hardware back button: clear coupon card if one is showing, otherwise swallow the press
  // Uses a ref so the popstate handler never goes stale without re-registering
  useEffect(() => { backStateRef.current = { coupon, justRedeemed }; }, [coupon, justRedeemed]);
  useEffect(() => {
    window.history.pushState(null, '', window.location.pathname);
    const handler = () => {
      window.history.pushState(null, '', window.location.pathname);
      const { coupon: c, justRedeemed: jr } = backStateRef.current;
      if (c && !jr) reset();
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [reset]);

  // Enter key confirms redeem when a valid coupon card is showing (not already redeemed)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Enter') return;
      if (!coupon || coupon.status === 'redeemed' || justRedeemed || redeemMut.isPending) return;
      redeemMut.mutate();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [coupon, justRedeemed, redeemMut]);

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
      <div className="relative">
        <PageHeader
          title="Redeem Coupon"
          subtitle="Scan QR code or type the coupon number"
          breadcrumbs={[{ label: 'Mahaprasad', to: '/mahaprasad' }, { label: 'Redeem' }]}
        />
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          className="absolute top-0 right-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      {!isOnline && (
        <div className="card p-3 border border-amber-200 bg-amber-50 flex items-center gap-2 text-sm text-amber-800">
          <CloudOff className="h-4 w-4 shrink-0" />
          Offline mode — looking up coupons from local cache. Redemptions will sync automatically when back online.
        </div>
      )}

      {syncConflicts.length > 0 && (
        <div className="card p-3 border border-red-200 bg-red-50 text-sm text-red-800">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Sync conflict — {syncConflicts.length} coupon{syncConflicts.length > 1 ? 's' : ''} could not be redeemed</p>
                <p className="text-xs text-red-600 mt-0.5">These were already redeemed on another device before the sync completed.</p>
                <p className="text-xs font-mono mt-1 text-red-700">{syncConflicts.map((c) => c.couponNumber).join(', ')}</p>
              </div>
            </div>
            <button onClick={dismissConflicts} className="text-red-400 hover:text-red-600 shrink-0 text-xl leading-none">&times;</button>
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
              setMode(key);
              // Always bump scanKey when switching to (or reselecting) scan mode
              // so the camera restarts even if mode didn't change.
              if (key === 'scan') setScanKey((k) => k + 1);
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
              mode === key ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'
            }`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* Input area — hidden once a coupon is loaded */}
      {!coupon && !justRedeemed && (
        <>
          {mode === 'scan' && (
            <div className="card overflow-hidden relative">
              <div id="qr-reader" ref={scannerRef} className="w-full" style={{ minHeight: 280 }} />
              {looking && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <div className="bg-white rounded-xl px-5 py-4 text-sm font-semibold text-gray-700 flex items-center gap-2.5">
                    <div className="h-4 w-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    Looking up coupon…
                  </div>
                </div>
              )}
              <p className="text-xs text-center text-gray-400 py-2 px-4">
                Point the camera at the QR code on the coupon
              </p>
            </div>
          )}

          {mode === 'manual' && (
            <div className="card p-5 space-y-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Coupon Number
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
                  ? <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Looking up…</>
                  : <><ChevronRight className="h-4 w-4" /> Look Up</>
                }
              </button>
              <p className="text-xs text-center text-gray-400">Tip: submits automatically on a full coupon number</p>
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
            onRedeem={() => redeemMut.mutate()}
            redeeming={redeemMut.isPending}
            justRedeemed={justRedeemed}
            countdown={countdown}
          />
          {!justRedeemed && (
            <button onClick={reset}
              className="w-full btn btn-ghost border text-sm flex items-center justify-center gap-1.5 py-2.5">
              <RotateCcw className="h-4 w-4" /> Scan Next Coupon
            </button>
          )}
          {/* Skip countdown */}
          {justRedeemed && (
            <button onClick={reset}
              className="w-full text-sm text-gray-400 hover:text-gray-600 py-1">
              Skip countdown and scan next →
            </button>
          )}
        </div>
      )}

      {/* Recent redemptions (this session) */}
      {!coupon && !justRedeemed && <RecentList items={recent} />}
    </div>
  );
}
