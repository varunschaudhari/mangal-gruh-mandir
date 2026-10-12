import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Camera, CameraOff, ChevronRight, Loader2, MonitorPlay, ScanLine } from 'lucide-react';
import { checkInByCode, getBookingOptions, getCheckInSummary, undoCheckIn } from '../../api/booking.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Arrivals, CheckInResult, RecentCheckIns } from '../../components/booking/checkin/CheckInPanels.jsx';
import { cleanCode, isLetIn, savedHall, saveHall, verdictOf } from '../../components/booking/checkin/checkInUtils.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { useBackHandler } from '../../hooks/useBackHandler.js';
import { useLanguage, useT } from '../../i18n/index.jsx';
import { scanQrCode } from '../../utils/nativeScanner.js';
import { hallTitle } from '../../utils/halls.js';
import { isNative } from '../../utils/platform.js';
import redeemFeedback from '../../utils/redeemFeedback.js';
import haptics from '../../utils/haptics.js';

// A mouse and a physical keyboard (counter PC with a handheld scanner): keep the code box focused.
const hasKeyboard = () => !isNative && Boolean(window.matchMedia?.('(hover: hover) and (pointer: fine)').matches);

// html5-qrcode's stop() throws when the camera never started (permission denied) — see MahaprasadRedeem.
const stopScanner = (inst) => {
  try { return inst.stop().catch(() => {}); } catch { return Promise.resolve(); }
};

const CAMERA_KEY = 'mgm-checkin-camera';
const cameraPref = () => {
  try { const v = localStorage.getItem(CAMERA_KEY); if (v) return v === 'on'; } catch { /* private window */ }
  return !hasKeyboard(); // phones and tablets: camera; counter PCs usually have a handheld scanner
};

const FEEDBACK = { success: () => redeemFeedback.success(), warning: () => redeemFeedback.alreadyRedeemed(), error: () => redeemFeedback.error() };

/**
 * Hall entrance: scan the QR on the devotee's slip (camera, phone scanner or a handheld USB
 * scanner) or type the receipt number. Valid slips are checked in once; the screen says where
 * to send the devotee, or why not to let them in.
 */
export default function BookingCheckIn() {
  const t = useT();
  const { lang } = useLanguage();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const startCode = useRef(searchParams.get('code')).current; // from the app-bar scanner

  const [hall, setHall] = useState(savedHall);
  const [view, setView] = useState(null);    // { data, code } | { error, code }
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');
  const [camera, setCamera] = useState(cameraPref);
  const [cameraError, setCameraError] = useState(false);
  const [nativeOpen, setNativeOpen] = useState(false);

  const inputRef = useRef(null);
  const busyRef = useRef(false);
  const lastSeen = useRef({ code: '', at: 0 });
  const nativeDismissed = useRef(Boolean(startCode));
  const stopPromise = useRef(null);

  // ── Data ────────────────────────────────────────────────────────────────────
  const summaryQ = useQuery({
    queryKey: ['booking-checkin-summary', hall],
    queryFn: () => getCheckInSummary({ hall: hall || undefined }).then((r) => r.data.data),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
  // Marathi seva names need the seva list, which hall-only staff can't read — English then.
  const optionsQ = useQuery({
    queryKey: ['booking-options'],
    queryFn: getBookingOptions,
    select: (r) => r.data.data,
    staleTime: 5 * 60_000,
    enabled: can('bookings:read'),
  });
  const sevaNameOf = useCallback((id, fallback) => {
    const s = (optionsQ.data?.allSevaTypes || []).find((x) => String(x._id) === String(id));
    return (lang === 'mr' && s?.nameMr) || fallback;
  }, [optionsQ.data, lang]);

  const refresh = useCallback((id) => {
    qc.invalidateQueries({ queryKey: ['booking-checkin-summary'] });
    qc.invalidateQueries({ queryKey: ['booking-day-sheet'] });
    if (id) qc.invalidateQueries({ queryKey: ['booking', id] });
  }, [qc]);

  const focusInput = useCallback(() => {
    if (hasKeyboard()) setTimeout(() => inputRef.current?.focus(), 30);
  }, []);

  // ── Check in ────────────────────────────────────────────────────────────────
  const submit = useCallback(async (raw, { override = false, fromCamera = false } = {}) => {
    const code = cleanCode(raw);
    if (!code || busyRef.current) return;
    // The camera sees the same slip many times a second while it is held up.
    if (fromCamera && code === lastSeen.current.code && Date.now() - lastSeen.current.at < 4000) return;
    lastSeen.current = { code, at: Date.now() };
    busyRef.current = true;
    setBusy(true);
    try {
      const { data } = await checkInByCode({ code, hall: hall || undefined, override });
      const r = data.data;
      setView({ data: r, code });
      FEEDBACK[verdictOf(r.result).sound]();
      if (r.checkedIn) refresh(r.booking._id);
    } catch (err) {
      const res = err?.response;
      setView({ code, error: res ? (res.data?.message || 'Could not check in') : 'No connection — check the internet and scan again' });
      redeemFeedback.notFound();
    } finally {
      busyRef.current = false;
      setBusy(false);
      setTyped('');
      focusInput();
    }
  }, [hall, refresh, focusInput]);
  const submitRef = useRef(submit);
  submitRef.current = submit;

  const undoMut = useMutation({
    mutationFn: (id) => undoCheckIn(id),
    onSuccess: (_, id) => {
      haptics.success();
      toast.success(t('Check-in undone'));
      setView((v) => (v?.data?.booking?._id === id ? null : v));
      lastSeen.current = { code: '', at: 0 };
      refresh(id);
    },
    onError: (e) => { haptics.error(); toast.error(t(e.response?.data?.message || 'Failed')); },
  });

  // ── Phone app: ML Kit's full-screen scanner ─────────────────────────────────
  const launchNative = useCallback(async () => {
    nativeDismissed.current = false;
    setNativeOpen(true);
    try {
      const text = await scanQrCode();
      if (text) await submitRef.current(text);
      else nativeDismissed.current = true; // closed by the user: wait for a tap
    } catch (e) {
      nativeDismissed.current = true;
      toast.error(t(e?.message || 'Scanner not available — type the receipt number'));
    } finally {
      setNativeOpen(false);
    }
  }, [t]);

  // ── Browser / desktop: the camera keeps scanning in the page ───────────────
  const cameraOn = !isNative && camera;
  useEffect(() => {
    if (!cameraOn) return undefined;
    let active = true;
    let inst = null;
    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (stopPromise.current) { await stopPromise.current.catch(() => {}); stopPromise.current = null; }
        if (!active) return;
        const box = document.getElementById('checkin-reader');
        if (box) box.innerHTML = '';
        inst = new Html5Qrcode('checkin-reader');
        await inst.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decoded) => submitRef.current(decoded, { fromCamera: true }),
          () => {},
        );
        if (active) setCameraError(false);
      } catch {
        if (active) setCameraError(true);
      }
    })();
    return () => {
      active = false;
      if (inst) stopPromise.current = stopScanner(inst);
    };
  }, [cameraOn]);

  const toggleCamera = () => {
    const next = !camera;
    setCamera(next);
    setCameraError(false);
    try { localStorage.setItem(CAMERA_KEY, next ? 'on' : 'off'); } catch { /* private window */ }
    if (!next) focusInput();
  };

  // A devotee let in: the green answer stays a moment, then the next scan (phone: reopen the scanner).
  useEffect(() => {
    if (!view?.data || !isLetIn(view.data.result)) return undefined;
    const timer = setTimeout(() => {
      setView((v) => (v === view ? null : v));
      if (isNative && !nativeDismissed.current) launchNative();
    }, isNative ? 2500 : 4000);
    return () => clearTimeout(timer);
  }, [view, launchNative]);

  // Opening the page: a code from the app-bar scanner, or straight into the phone scanner.
  useEffect(() => {
    if (startCode) {
      setSearchParams({}, { replace: true });
      submitRef.current(startCode);
    } else if (isNative) {
      launchNative();
    }
    focusInput();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the screen awake at the entrance.
  useEffect(() => {
    let lock = null;
    const acquire = async () => { try { if ('wakeLock' in navigator) lock = await navigator.wakeLock.request('screen'); } catch { /* not allowed */ } };
    acquire();
    const onVisible = () => { if (!document.hidden) acquire(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); lock?.release().catch(() => {}); };
  }, []);

  const dismiss = useCallback(() => { setView(null); focusInput(); }, [focusInput]);
  useBackHandler(isNative && Boolean(view), dismiss);

  const chooseHall = (h) => { haptics.select(); setHall(h); saveHall(h); lastSeen.current = { code: '', at: 0 }; };
  const halls = summaryQ.data?.halls || [];
  const next = () => { setView(null); launchNative(); };

  return (
    <>
      <PageHeader
        title="Hall Check-in"
        subtitle="Scan the QR code on the devotee’s slip"
        breadcrumbs={can('bookings:read') ? [{ label: 'Pooja Booking', to: '/bookings' }, { label: 'Hall Check-in' }] : undefined}
        actions={(
          <Link to={`/hall-screen${hall ? `?hall=${encodeURIComponent(hall)}` : ''}`} className="btn-secondary whitespace-nowrap">
            <MonitorPlay className="h-4 w-4" /> {t('Hall screen')}
          </Link>
        )}
      />

      <div className="space-y-3 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-5 lg:space-y-0">
        <div className="min-w-0 space-y-3">
          {/* Which hall this scanner stands at */}
          {halls.length > 1 && (
            <div className="card flex flex-wrap items-center gap-1.5 p-2" role="radiogroup" aria-label={t('Hall')}>
              <span className="w-full px-2 pb-0.5 text-xs font-semibold uppercase tracking-wider text-gray-500 sm:w-auto sm:pb-0">{t('This entrance')}</span>
              {['', ...halls].map((h) => (
                <button key={h || 'all'} type="button" role="radio" aria-checked={hall === h} onClick={() => chooseHall(h)}
                  className={`min-h-[40px] rounded-full px-4 text-sm font-semibold transition-colors ${hall === h ? 'bg-primary-600 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {h ? hallTitle(h, summaryQ.data?.hallNames, lang) : t('All halls')}
                </button>
              ))}
            </div>
          )}

          {view && (
            <CheckInResult
              view={view} sevaNameOf={sevaNameOf} hallNames={summaryQ.data?.hallNames} busy={busy}
              onOverride={() => submit(view.code, { override: true })}
              onUndo={() => undoMut.mutate(view.data.booking._id)} undoing={undoMut.isPending}
              onDismiss={dismiss}
            />
          )}

          {/* Scanner */}
          {isNative ? (
            <button type="button" onClick={view ? next : launchNative} disabled={nativeOpen || busy}
              className="card flex w-full flex-col items-center gap-3 px-6 py-8 active:bg-gray-50">
              <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary-600 text-white shadow-lg shadow-primary-600/30">
                {busy ? <Loader2 className="h-10 w-10 animate-spin" /> : <ScanLine className="h-10 w-10" />}
              </span>
              <span className="text-base font-semibold text-gray-800">
                {nativeOpen ? t('Scanner open…') : view ? t('Scan the next slip') : t('Tap to scan a slip')}
              </span>
              <span className="text-xs text-gray-400">{t('Point the camera at the QR code on the booking slip')}</span>
            </button>
          ) : (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('Camera')}</span>
                <button type="button" onClick={toggleCamera} className="btn-ghost min-h-[40px] px-2 text-sm">
                  {camera ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />} {camera ? t('Turn camera off') : t('Use the camera')}
                </button>
              </div>
              {camera && (
                <div className="relative">
                  <div id="checkin-reader" className="w-full" style={{ minHeight: cameraError ? 0 : 260 }} />
                  {busy && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <Loader2 className="h-8 w-8 animate-spin text-white" />
                    </div>
                  )}
                  {cameraError
                    ? <p className="px-4 py-3 text-sm text-amber-700">{t('Camera not available — use a handheld scanner or type the receipt number below.')}</p>
                    : <p className="px-4 py-2 text-center text-xs text-gray-400">{t('Hold the slip’s QR code in front of the camera')}</p>}
                </div>
              )}
              {!camera && <p className="px-4 py-3 text-sm text-gray-500">{t('Handheld scanner: scan the slip — it fills the box below and checks in.')}</p>}
            </div>
          )}

          {/* Handheld scanner / typed receipt number */}
          <form className="card flex gap-2 p-3" onSubmit={(e) => { e.preventDefault(); submit(typed); }}>
            <label htmlFor="checkin-code" className="sr-only">{t('Receipt number or slip code')}</label>
            <input
              id="checkin-code" ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)}
              autoComplete="off" autoCapitalize="characters" spellCheck={false} enterKeyHint="go"
              placeholder={t('Receipt no. or scan')}
              className="input h-12 min-w-0 flex-1 font-mono text-lg"
            />
            <button type="submit" disabled={!typed.trim() || busy} className="btn-primary h-12 shrink-0 px-4">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ChevronRight className="h-5 w-5" />}
              <span className="max-sm:sr-only">{t('Check in')}</span>
            </button>
          </form>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-0">
          <Arrivals query={summaryQ} hall={hall} />
          <RecentCheckIns list={summaryQ.data?.recent} onUndo={(id) => undoMut.mutate(id)} undoingId={undoMut.isPending ? undoMut.variables : null} />
        </aside>
      </div>
    </>
  );
}
