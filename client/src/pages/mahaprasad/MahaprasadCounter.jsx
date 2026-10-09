import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UtensilsCrossed, Printer, RefreshCw, IndianRupee,
  Gift, ChevronDown, ChevronUp, Zap, AlertTriangle, Wifi, WifiOff,
  CloudOff, CloudUpload, Download, Banknote, Smartphone, CheckCircle2,
  Minus, Plus, X, ClipboardList, Keyboard, Vault, Loader2, MessageCircle, Share2,
} from 'lucide-react';
import { issueCoupons, getDailySummary, printCoupons, getBatches, getCashDrawer, voidBatch as voidBatchApi } from '../../api/mahaprasad.api.js';
import CashDrawer from './CashDrawer.jsx';
import { getOccasions } from '../../api/mahaprasadOccasion.api.js';
import { getSettings } from '../../api/settings.api.js';
import { printThermalCoupon, printShiftSummary, isConnected, connectToQzTray } from '../../utils/thermalPrint.js';
import { useAuth } from '../../context/AuthContext.jsx';
import * as offlineStore from '../../utils/offlineStore.js';
import { useOfflineMode } from '../../hooks/useOfflineMode.js';
import Badge from '../../components/ui/Badge.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import { useSetAppBarTitle } from '../../components/Layout/AppBarContext.jsx';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import toast from 'react-hot-toast';
import { openFile, shareText } from '../../utils/fileSaver.js';
import { isNative } from '../../utils/platform.js';
import haptics from '../../utils/haptics.js';
import { localDateStr } from '../../utils/formatters.js';
import { useT } from '../../i18n/index.jsx';

// Touch screens: focusing the quantity field would pop the on-screen keyboard on open and after every issue.
const canAutoFocus = () => !isNative && Boolean(window.matchMedia?.('(hover: hover) and (pointer: fine)').matches);

// The mobile apps can't reach a thermal printer (QZ Tray / Electron bridge), so they
// print through the coupon PDF and the system share sheet instead.
const PdfIcon  = isNative ? Share2 : Printer;
const pdfLabel = isNative ? 'Share / Print PDF' : 'PDF';

const todayStr  = () => localDateStr();
const fmtTime   = (d) => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtMoney  = (n) => Number(n || 0).toLocaleString('en-IN');

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function getDayPrice(dayPricing, date) {
  const d = date ? new Date(date) : new Date();
  return dayPricing?.[DAYS[d.getDay()]] ?? 0;
}

// Keyboard shortcut → note denomination mapping
const KEY_TO_NOTE = { 'q': 10, 'w': 20, 'h': 50, '1': 100, '2': 200, '5': 500 };
const NOTE_KEY    = { 10: 'Q', 20: 'W', 50: 'H', 100: '1', 200: '2', 500: '5' };

function playBeep() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.value = 1046; // C6
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.28);
  } catch { /* audio API unavailable — silent */ }
}

// Note denominations available for cash payment
const NOTES = [10, 20, 50, 100, 200, 500];

function computeChange(amount, counts) {
  const DENOMS = [500, 200, 100, 50, 20, 10, 5, 2, 1];
  const breakdown = {};
  let remaining = Math.round(amount);
  for (const d of DENOMS) {
    const available = Math.max(0, counts?.[String(d)] || 0);
    const use = Math.min(available, Math.floor(remaining / d));
    if (use > 0) { breakdown[String(d)] = use; remaining -= use * d; }
  }
  return { canMakeExact: remaining === 0, shortBy: remaining };
}

// ── Batches section ───────────────────────────────────────────────────────────
function BatchesSection({ date, onPdfPrint, printing, onVoid }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['mahaprasad-batches', date],
    queryFn:  () => getBatches(date),
    staleTime: 30 * 1000,
  });
  const batches = data?.data?.data || [];
  if (batches.length === 0) return null;

  return (
    <div className="card overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 sm:px-5 py-3 max-sm:min-h-[48px] text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
        <span className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-blue-500" />
          {t("Today's Batches")}
          <span className="text-xs font-normal text-gray-400">{t(batches.length !== 1 ? '({n} batches)' : '({n} batch)', { n: batches.length })}</span>
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>
      {open && (
        <div className="divide-y divide-gray-50">
          {batches.map((b) => (
            <div key={b._id} className={`flex items-center gap-2 sm:gap-3 px-4 sm:px-5 py-2.5 ${b.statuses?.includes('voided') ? 'opacity-50' : ''}`}>
              <span className="hidden sm:block shrink-0 text-xs text-gray-400 w-12 font-mono">{fmtTime(b.issuedAt)}</span>
              <div className="flex-1 min-w-0 flex items-center gap-x-2 gap-y-1 flex-wrap">
                <span className="sm:hidden text-xs text-gray-400 font-mono">{fmtTime(b.issuedAt)}</span>
                <Badge variant={b.type === 'paid' ? 'blue' : 'purple'} size="sm">
                  {b.type === 'free' ? `${t('Free')}${b.occasion ? ` · ${b.occasion}` : ''}` : t('Paid|coupon')}
                </Badge>
                <span className="text-xs font-semibold text-gray-700">
                  {b.isGroup ? t('Group · {n} persons', { n: b.groupSize || b.count }) : t(b.count !== 1 ? '{n} coupons' : '{n} coupon', { n: b.count })}
                </span>
                <span className="text-xs text-gray-400 font-mono break-words">
                  {b.couponFrom === b.couponTo ? b.couponFrom : `${b.couponFrom} → ${b.couponTo}`}
                </span>
                {b.issuedBy?.name && <span className="text-xs text-gray-400">· {b.issuedBy.name}</span>}
              </div>
              <button onClick={() => onPdfPrint(b.numbers)} disabled={printing}
                aria-label={isNative ? t('Share or print PDF') : 'PDF'}
                className="shrink-0 btn btn-ghost border text-xs flex items-center gap-1 py-1 px-2 max-sm:h-10 max-sm:px-3">
                <PdfIcon className="h-3 w-3 max-sm:h-4 max-sm:w-4" /> {isNative ? t('Share') : 'PDF'}
              </button>
              {b.statuses?.includes('voided') ? (
                <span className="shrink-0 text-xs text-red-500 font-semibold">{t('Voided')}</span>
              ) : (
                <button onClick={() => onVoid(b._id)} title={t('Void batch')} aria-label={t('Void batch')}
                  className="shrink-0 text-gray-300 hover:text-red-500 transition-colors max-sm:p-3 max-sm:-mr-3 max-sm:text-gray-400">
                  <X className="h-3.5 w-3.5 max-sm:h-4 max-sm:w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MahaprasadCounter() {
  const t = useT();
  const qc             = useQueryClient();
  const qtyInputRef    = useRef(null);
  const cashDrawerRef  = useRef(null);   // imperative handle on CashDrawer
  const cashDrawerElRef = useRef(null);  // DOM node for scroll-into-view

  const [date,           setDate]           = useState(todayStr());
  const [qty,            setQty]            = useState(1);
  const [isGroup,        setIsGroup]        = useState(false);
  const [type,           setType]           = useState('paid');
  const [occasionPreset, setOccasionPreset] = useState('');
  const [occasionCustom, setOccasionCustom] = useState('');
  const [autoPrint,      setAutoPrint]      = useState(false);
  const [lastBatch,      setLastBatch]      = useState(null);
  const [printing,       setPrinting]       = useState(false);
  const [qzReady,        setQzReady]        = useState(false);
  const [offlineIssuing, setOfflineIssuing] = useState(false);
  const [paymentMode,    setPaymentMode]    = useState('cash');
  const [receivedNotes,  setReceivedNotes]  = useState([]); // accumulator: list of note tiles clicked
  const [customCash,     setCustomCash]     = useState(''); // typed override (mutually exclusive with tiles)
  const [autoResetIn,    setAutoResetIn]    = useState(null); // countdown seconds after issue
  const [shortageWarning,  setShortageWarning]  = useState(null);  // { shortBy }
  const [shakePayment,     setShakePayment]     = useState(false);
  const [voidConfirm,      setVoidConfirm]      = useState(null);  // batchId string
  const [showShortcuts,    setShowShortcuts]    = useState(false);
  const [lastIssuedBatch,  setLastIssuedBatch]  = useState(null);  // persists after auto-reset
  const [showShiftSummary, setShowShiftSummary] = useState(false);
  const [printQueue,       setPrintQueue]       = useState([]);    // coupons that failed to print, awaiting retry
  const [floatSkipped,     setFloatSkipped]     = useState(false); // user dismissed the float reminder for this session
  const [printerStatus,       setPrinterStatus]       = useState(null);  // null | 'checking' | 'ok' | string
  const [electronPrinterName, setElectronPrinterName] = useState('');
  const [shiftCopied,         setShiftCopied]         = useState(false);

  const { user } = useAuth();

  // No PageHeader here, so name the mobile app bar ourselves. Below lg the action bar is
  // pinned above the tab bar and the "issued" card rides inside it, next to the thumb.
  useSetAppBarTitle(t('Mahaprasad Counter'));
  const isTouchLayout = useMediaQuery('(max-width: 1023px)');

  const {
    isOnline, poolCount, offlineIssued: offlineIssuedCount, syncPending,
    isSyncing, isPrefetching, prefetch, sync, refreshCounts, getOfflineUser, getOfflineSettings,
  } = useOfflineMode();

  const occasionValue   = occasionPreset === '__other__' ? occasionCustom : occasionPreset;
  const isToday         = date === todayStr();
  const isTuesdayToday  = new Date().getDay() === 2;  // Tuesday surge day
  const resetDuration   = isTuesdayToday ? 1 : 3;     // faster auto-reset on high-traffic days

  const { data: settingsRes } = useQuery({
    queryKey: ['settings'],
    queryFn:  getSettings,
    staleTime: 5 * 60 * 1000,
  });
  const settings = settingsRes?.data?.data || {};

  const { data: summaryRes, isLoading: summaryLoading, refetch } = useQuery({
    queryKey: ['mahaprasad-summary', date],
    queryFn:  () => getDailySummary(date),
    staleTime: 30 * 1000,
  });
  const summary = summaryRes?.data?.data || {};

  const { data: occasionsRes } = useQuery({
    queryKey: ['mahaprasad-occasions'],
    queryFn:  () => getOccasions({ active: 'true' }),
    staleTime: 5 * 60 * 1000,
  });
  const occasions = occasionsRes?.data?.data || [];

  const { data: drawerData } = useQuery({
    queryKey: ['mahaprasad-cash-drawer', date],
    queryFn:  () => getCashDrawer(date),
    staleTime: 15 * 1000,
    enabled:   isToday,
  });
  const drawerCounts = drawerData?.data?.data?.counts || {};
  const isFloatSet   = drawerData?.data?.data?.isFloatSet ?? true; // default true to avoid false flash before data loads
  const myCount      = summary.myCount ?? 0;
  const myCash       = summary.myCash  ?? 0;
  const myUpi        = summary.myUpi   ?? 0;

  // Reset float-skipped state when the date changes (new day = new reminder)
  useEffect(() => { setFloatSkipped(false); }, [date]);

  // In Electron, printing is always "ready" (no QZ Tray required)
  useEffect(() => { setQzReady(window.electronAPI?.isElectron || isConnected()); }, []);

  const checkPrinterStatus = useCallback(async (printerName) => {
    if (!window.electronAPI?.isElectron || !printerName) return;
    setPrinterStatus('checking');
    try {
      const result = await window.electronAPI.checkPrinterStatus(printerName);
      setPrinterStatus(result?.ok ? 'ok' : (result?.error || 'Not found'));
    } catch {
      setPrinterStatus('Error checking printer');
    }
  }, []);

  // Restore autoPrint preference + printer name from electron-store
  useEffect(() => {
    if (!window.electronAPI?.isElectron) return;
    window.electronAPI.getSettings().then((s) => {
      if (s?.autoPrint !== undefined) setAutoPrint(s.autoPrint);
      if (s?.printerName) {
        setElectronPrinterName(s.printerName);
        if (s.autoPrint) checkPrinterStatus(s.printerName);
      }
    });
  }, [checkPrinterStatus]);

  // ── Auto-reset countdown after issue ────────────────────────────────────────
  useEffect(() => {
    if (!lastBatch) return;
    let s = resetDuration;
    setAutoResetIn(s);
    const t = setInterval(() => {
      s -= 1;
      setAutoResetIn(s);
      if (s <= 0) {
        clearInterval(t);
        setLastBatch(null);
        setAutoResetIn(null);
        setQty(1); setIsGroup(false);
        setReceivedNotes([]); setCustomCash('');
        if (canAutoFocus()) setTimeout(() => qtyInputRef.current?.focus(), 50);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [lastBatch]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Global keyboard shortcuts (only when not typing in an input) ─────────────
  useEffect(() => {
    const onKey = (e) => {
      // Don't steal keystrokes from any input/select/textarea
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      // Escape cancels auto-reset and keeps the success card
      if (e.key === 'Escape' && autoResetIn !== null) {
        setAutoResetIn(null);
        return;
      }
      // Note shortcuts — only relevant for paid cash
      if (e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setCustomCash(String(totalDueRef.current));
        setReceivedNotes([]);
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        setReceivedNotes((prev) => prev.slice(0, -1));
        return;
      }
      const noteFromKey = KEY_TO_NOTE[e.key.toLowerCase()];
      if (noteFromKey) {
        e.preventDefault();
        setCustomCash('');
        setReceivedNotes((prev) => [...prev, noteFromKey]);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [autoResetIn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep a ref so the keyboard handler above always reads the current totalDue
  const totalDueRef = useRef(0);

  // ── Derived values ──────────────────────────────────────────────────────────
  const pricePerPlate = summary.pricePerPlate ?? getDayPrice(settings.mahaprasadDayPricing, new Date(date));

  // Auto-switch to free type when today has no price set
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!summaryLoading && pricePerPlate === 0 && type === 'paid') setType('free');
  }, [summaryLoading, pricePerPlate]);

  const totalDue      = type === 'paid' ? pricePerPlate * qty : 0;
  const notesTotal    = receivedNotes.reduce((s, n) => s + n, 0);
  const cashReceived  = customCash !== '' ? (Number(customCash) || 0) : notesTotal;
  const changeDue     = paymentMode === 'cash' && cashReceived > 0 ? cashReceived - totalDue : null;
  totalDueRef.current = totalDue;

  const cap          = summary.cap || 0;
  const totalIssued  = summary.total || 0;
  const capRemaining = cap > 0 ? Math.max(0, cap - totalIssued) : Infinity;
  const atCap        = cap > 0 && totalIssued >= cap;
  const wouldExceed  = cap > 0 && qty > capRemaining;
  const capPct       = cap > 0 ? Math.round((totalIssued / cap) * 100) : null;

  // ── Handlers ────────────────────────────────────────────────────────────────
  function addNote(note) {
    setCustomCash('');
    setReceivedNotes((prev) => [...prev, note]);
  }
  function clearPayment() {
    setReceivedNotes([]);
    setCustomCash('');
  }
  function triggerShake() {
    haptics.warning();
    setShakePayment(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setShakePayment(true)));
    setTimeout(() => setShakePayment(false), 500);
  }

  const handlePdfPrint = async (numbers) => {
    setPrinting(true);
    try {
      const res = await printCoupons(numbers);
      await openFile(res.data, `Coupons-${numbers.length === 1 ? numbers[0] : `${numbers.length}`}.pdf`);
    } catch { toast.error(t('Failed to generate PDF')); }
    finally   { setPrinting(false); }
  };

  const handleThermalPrint = async (coupon) => {
    try {
      await printThermalCoupon(coupon, settings);
      setQzReady(true);
    } catch (err) {
      setQzReady(isConnected());
      const msg = err.message || 'Thermal print failed';
      if (msg.includes('not set') || msg.includes('not configured')) toast.error(t('Set printer name in Settings → Mahaprasad'));
      else if (!isConnected()) toast.error(t('QZ Tray not running — install from qz.io'));
      else toast.error(t(msg));
      throw err;
    }
  };

  const handleIssueOffline = async () => {
    if (offlineIssuing) return;
    setOfflineIssuing(true);
    try {
      const ds     = date.replace(/-/g, '');
      const coupon = await offlineStore.popNextCoupon(ds);
      if (!coupon) { toast.error(t('No offline coupons left. Go online and pre-fetch more.')); return; }

      const user        = getOfflineUser();
      const offSettings = getOfflineSettings();
      const pricing     = offSettings.mahaprasadDayPricing ?? settings.mahaprasadDayPricing;
      const price       = type === 'paid' ? getDayPrice(pricing, new Date(date)) : 0;
      const batchId     = Math.random().toString(36).slice(2, 10);

      const issued = await offlineStore.confirmIssue(coupon.couponNumber, {
        type, amount: price, occasion: type === 'free' ? occasionValue : '',
        issuedAt: new Date().toISOString(), issuedById: user._id || '', issuedByName: user.name || 'Staff', batchId,
      });

      haptics.success();
      setLastBatch({ numbers: [issued.couponNumber], coupons: [issued] });
      setQty(1); clearPayment();
      await refreshCounts();
      qc.invalidateQueries({ queryKey: ['mahaprasad-summary'] });

      if (autoPrint) {
        const ps = Object.keys(offSettings).length ? offSettings : settings;
        try { await printThermalCoupon({ ...issued, date: coupon.date, status: 'issued' }, ps); }
        catch { /* non-fatal */ }
      }
      toast.success(t('Issued offline · {n} remaining', { n: poolCount - 1 }));
    } finally { setOfflineIssuing(false); }
  };

  const handleAutoPrintToggle = async () => {
    const next = !autoPrint;
    setAutoPrint(next);
    if (window.electronAPI?.isElectron) {
      window.electronAPI.saveSettings({ autoPrint: next });
      if (next && electronPrinterName) checkPrinterStatus(electronPrinterName);
      else if (!next) setPrinterStatus(null);
    } else if (next && !isConnected()) {
      try { await connectToQzTray(); setQzReady(true); toast.success(t('QZ Tray connected')); }
      catch { toast.error(t('QZ Tray not reachable — install & start from qz.io')); }
    }
  };

  const issueMut = useMutation({
    mutationFn: (vars) => issueCoupons({
      quantity:       vars.qty,
      type:           vars.type,
      occasion:       vars.occasion,
      date:           vars.date,
      isGroup:        vars.isGroup,
      paymentMode:    vars.paymentMode,
      amountReceived: vars.amountReceived,
      receivedNotes:  vars.receivedNotes,
    }),
    onSuccess: async (res, vars) => {
      const { coupons, drawerChange } = res.data.data;
      const batchTotalDue = coupons.reduce((s, c) => s + (c.amount || 0), 0);
      playBeep();
      haptics.success();
      const batchState = {
        numbers: coupons.map((c) => c.couponNumber),
        coupons,
        isGroup:  vars.isGroup,
        groupQty: vars.qty,
        issuedAt: new Date(),
        payment: vars.type === 'paid' && batchTotalDue > 0 ? {
          mode:           vars.paymentMode || 'cash',
          totalDue:       batchTotalDue,
          amountReceived: vars.amountReceived || 0,
          change:         vars.paymentMode === 'cash' ? Math.max(0, (vars.amountReceived || 0) - batchTotalDue) : 0,
          drawerChange,
        } : null,
      };
      setLastBatch(batchState);
      setLastIssuedBatch(batchState);
      setQty(1); setIsGroup(false); clearPayment();
      qc.invalidateQueries({ queryKey: ['mahaprasad-summary'] });
      qc.invalidateQueries({ queryKey: ['mahaprasad-coupons'] });
      qc.invalidateQueries({ queryKey: ['mahaprasad-batches', date] });
      qc.invalidateQueries({ queryKey: ['mahaprasad-cash-drawer', date] });

      if (autoPrint) {
        const failed = [];
        for (const coupon of coupons) {
          try { await handleThermalPrint(coupon); }
          catch { failed.push(coupon); }
        }
        if (failed.length === 0) {
          toast.success(vars.isGroup
            ? t('Group ({n}) issued & printed', { n: vars.qty })
            : t(coupons.length > 1 ? '{n} coupons issued & printed' : '{n} coupon issued & printed', { n: coupons.length }));
        } else {
          setPrintQueue((q) => [...q, ...failed]);
          toast.error(t('{printed} printed, {queued} queued — fix printer then retry', { printed: coupons.length - failed.length, queued: failed.length }));
        }
      } else {
        toast.success(vars.isGroup
          ? t('Group coupon ({n} persons) issued', { n: vars.qty })
          : t(coupons.length > 1 ? '{n} coupons issued' : '{n} coupon issued', { n: coupons.length }));
      }
    },
    onError: (e) => { haptics.error(); toast.error(e.response?.data?.message || t('Failed to issue')); },
  });

  const voidMut = useMutation({
    mutationFn: (batchId) => voidBatchApi(batchId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mahaprasad-batches', date] });
      qc.invalidateQueries({ queryKey: ['mahaprasad-summary', date] });
      qc.invalidateQueries({ queryKey: ['mahaprasad-cash-drawer', date] });
      setVoidConfirm(null);
      toast.success(t('Batch voided'));
    },
    onError: (e) => toast.error(e.response?.data?.message || t('Failed to void batch')),
  });

  const handleRetryPrintQueue = async () => {
    const toRetry = [...printQueue];
    setPrintQueue([]);
    const stillFailed = [];
    for (const coupon of toRetry) {
      try { await handleThermalPrint(coupon); }
      catch { stillFailed.push(coupon); }
    }
    if (stillFailed.length > 0) {
      setPrintQueue(stillFailed);
      toast.error(t('{n} still failed — check printer', { n: stillFailed.length }));
    } else {
      toast.success(t('All queued coupons printed'));
    }
  };

  const handleIssue = () => {
    if (!isOnline) { handleIssueOffline(); return; }

    // Block if customer hasn't paid enough
    if (paymentMode === 'cash' && cashReceived > 0 && changeDue < 0) {
      triggerShake();
      return;
    }

    // Check if drawer can make change before issuing
    if (paymentMode === 'cash' && cashReceived > 0 && changeDue > 0) {
      const { canMakeExact, shortBy } = computeChange(changeDue, drawerCounts);
      if (!canMakeExact) {
        haptics.warning();
        setShortageWarning({ shortBy });
        return;
      }
    }

    issueMut.mutate({
      qty, isGroup, type, date,
      occasion:       type === 'free' ? occasionValue : '',
      paymentMode:    type === 'paid' && pricePerPlate > 0 ? paymentMode : undefined,
      amountReceived: type === 'paid' && pricePerPlate > 0 && paymentMode === 'cash' ? cashReceived : undefined,
      receivedNotes:  type === 'paid' && pricePerPlate > 0 && paymentMode === 'cash' && receivedNotes.length > 0 ? receivedNotes : undefined,
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !issueMut.isPending && !offlineIssuing) {
      if (!isOnline && (atCap || poolCount === 0)) return;
      if (isOnline && !canIssue) return;
      handleIssue();
    }
  };

  useEffect(() => { if (canAutoFocus()) qtyInputRef.current?.focus(); }, []);

  const canIssue           = !issueMut.isPending && !atCap && !wouldExceed && qty >= 1;
  const canIssueOffline    = !offlineIssuing && poolCount > 0 && isToday;
  const isPending          = issueMut.isPending || offlineIssuing;
  const thermalPrinterName = isNative ? '' : window.electronAPI?.isElectron ? electronPrinterName : settings?.mahaprasadPrinterName;

  // All notes always visible in accumulator mode
  const noteTiles  = NOTES; // [50, 100, 200, 500]
  const noteCounts = receivedNotes.reduce((acc, n) => ({ ...acc, [n]: (acc[n] || 0) + 1 }), {});

  const shiftSummaryText = () => {
    const shortDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    return [
      `📿 Mangal Grah Mandir — ${shortDate}`,
      `Staff: ${user?.name || 'Staff'}`,
      `Coupons: ${myCount} issued`,
      `Cash: ₹${fmtMoney(myCash)} | UPI: ₹${fmtMoney(myUpi)}`,
      `Total: ₹${fmtMoney(myCash + myUpi)}`,
      `— Sent via MGM Counter`,
    ].join('\n');
  };

  const handleShareShift = async () => {
    // Mobile apps: the system share sheet lists WhatsApp directly.
    if (isNative) { await shareText(shiftSummaryText()); return; }
    try {
      await navigator.clipboard.writeText(shiftSummaryText());
      setShiftCopied(true);
      toast.success(t('Copied — paste in any WhatsApp chat'));
      setTimeout(() => setShiftCopied(false), 3000);
    } catch {
      toast.error(t('Could not copy — try manually'));
    }
  };

  // ── Last batch success card ─────────────────────────────────────────────────
  // Rendered in the page flow on desktop; below lg it sits inside the pinned action bar
  // so the change to return and the coupon numbers show up right where the thumb is.
  const successCard = lastBatch && (
    <div className="card p-4 lg:p-5 space-y-3 border-green-200 bg-green-50 animate-in slide-in-from-bottom-2">
      {/* Auto-reset countdown bar */}
      {autoResetIn !== null && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-green-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${(autoResetIn / resetDuration) * 100}%` }}
            />
          </div>
          <span className="text-xs text-green-600 tabular-nums shrink-0">{t('Resetting in {n}s', { n: autoResetIn })}</span>
          <button type="button"
            onClick={() => { setAutoResetIn(null); }}
            className="text-xs font-semibold text-green-700 hover:text-green-900 border border-green-300 rounded px-2 py-0.5 hover:bg-green-100 transition-colors shrink-0 max-lg:px-3 max-lg:py-2">
            {t('Keep')}
          </button>
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-green-800">
              {lastBatch.isGroup
                ? t('Group coupon issued — {n} persons', { n: lastBatch.groupQty })
                : t(lastBatch.numbers.length > 1 ? '{n} coupons issued' : '{n} coupon issued', { n: lastBatch.numbers.length })}
            </p>
            {/* Payment summary */}
            {lastBatch.payment && (
              <p className="text-xs text-green-700 mt-0.5">
                {t('₹{total} · paid ₹{received} ({mode})', { total: fmtMoney(lastBatch.payment.totalDue), received: fmtMoney(lastBatch.payment.amountReceived), mode: t(lastBatch.payment.mode) })}
                {lastBatch.payment.mode === 'cash' && lastBatch.payment.change > 0 && (
                  <span className="font-bold text-amber-700 ml-1 max-lg:text-sm">{t('· return ₹{amount}', { amount: fmtMoney(lastBatch.payment.change) })}</span>
                )}
              </p>
            )}
          </div>
        </div>
        <button onClick={() => setLastBatch(null)} aria-label={t('Dismiss')}
          className="text-gray-400 hover:text-gray-600 shrink-0 mt-0.5 max-lg:p-3 max-lg:-m-3">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Drawer change breakdown */}
      {lastBatch.payment?.drawerChange?.breakdown && Object.keys(lastBatch.payment.drawerChange.breakdown).length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <span className="text-xs font-semibold text-amber-700">{t('Give change:')}</span>
          {Object.entries(lastBatch.payment.drawerChange.breakdown)
            .sort(([a], [b]) => Number(b) - Number(a))
            .map(([d, c]) => (
              <span key={d} className="text-xs bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">{c}×₹{d}</span>
            ))}
          {!lastBatch.payment.drawerChange.canMakeExact && (
            <span className="text-xs text-red-600 font-medium">{t('(short ₹{amount} — check drawer)', { amount: lastBatch.payment.drawerChange.shortBy })}</span>
          )}
        </div>
      )}

      {/* Coupon numbers + print */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="contents max-lg:flex max-lg:w-full max-lg:flex-wrap max-lg:gap-1.5 max-lg:max-h-20 max-lg:overflow-y-auto">
          {lastBatch.numbers.map((n) => (
            <span key={n} className="font-mono text-xs bg-white border border-green-200 rounded-md px-2 py-1 text-green-700 font-semibold">{n}</span>
          ))}
        </div>
        <div className="ml-auto flex gap-2 max-lg:ml-0 max-lg:w-full">
          {!isNative && (
            <button
              onClick={async () => { for (const c of lastBatch.coupons) { try { await handleThermalPrint(c); } catch { break; } } }}
              className="btn text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 max-lg:flex-1 max-lg:py-2.5">
              <Printer className="h-3.5 w-3.5" /> {t('Print')}
            </button>
          )}
          {isNative ? (
            <button onClick={() => handlePdfPrint(lastBatch.numbers)} disabled={printing}
              className="btn flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-semibold disabled:opacity-50">
              {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} {t(pdfLabel)}
            </button>
          ) : (
            <button onClick={() => handlePdfPrint(lastBatch.numbers)} disabled={printing}
              className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2 py-1 disabled:opacity-40 max-lg:flex-1 max-lg:py-2.5 max-lg:rounded-lg max-lg:bg-white max-lg:font-semibold max-lg:text-gray-600">
              PDF
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // ── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <>
    <div className="space-y-2 pb-24 lg:pb-20" onKeyDown={handleKeyDown}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      {/* Below lg the title lives in the app bar, so the controls get the whole row. */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="hidden lg:block text-base font-bold text-gray-900 leading-tight">{t('Mahaprasad Counter')}</h1>
        <div className="flex items-center gap-1.5 max-lg:w-full">
          <input
            type="date"
            value={date}
            min={todayStr()}
            onChange={(e) => {
              const val = e.target.value;
              if (val && val < todayStr()) return;
              setDate(val || todayStr()); setLastBatch(null);
            }}
            className="input text-sm h-8 py-1 max-lg:flex-1 max-lg:min-w-0"
          />
          {!isToday && (
            <button onClick={() => setDate(todayStr())} className="text-xs text-primary-600 hover:underline whitespace-nowrap max-sm:px-2 max-sm:py-3 max-sm:text-sm max-sm:font-medium">{t('Today')}</button>
          )}
          <button onClick={() => refetch()} title={t('Refresh')} aria-label={t('Refresh')}
            className="btn btn-ghost border h-8 w-8 p-0 shrink-0 flex items-center justify-center max-sm:h-11 max-sm:w-11">
            <RefreshCw className="h-3.5 w-3.5 max-sm:h-4 max-sm:w-4" />
          </button>
          {/* Shortcuts only matter with a physical keyboard */}
          {!isNative && (
            <button onClick={() => setShowShortcuts((v) => !v)} title={t('Keyboard shortcuts')} aria-label={t('Keyboard shortcuts')}
              className={`btn btn-ghost border h-8 w-8 p-0 shrink-0 hidden sm:flex items-center justify-center transition-colors ${showShortcuts ? 'bg-gray-100 border-gray-300' : ''}`}>
              <Keyboard className="h-3.5 w-3.5" />
            </button>
          )}
          {isToday && (
            <button onClick={() => setShowShiftSummary(true)} title={t('My shift summary')}
              className="btn btn-ghost border h-8 px-2.5 shrink-0 whitespace-nowrap flex items-center gap-1 text-xs font-semibold text-gray-600 hover:bg-gray-50 max-sm:h-11 max-sm:px-3 max-sm:text-sm">
              <UtensilsCrossed className="h-3 w-3 max-sm:h-4 max-sm:w-4" />
              {t('My Shift')}
            </button>
          )}
        </div>
      </div>

      {/* ── Keyboard shortcut legend ────────────────────────────────────────── */}
      {showShortcuts && (
        <div className="card px-5 py-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">{t('Keyboard Shortcuts')}</p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
            {[
              { key: 'Enter ↵', action: t('Issue coupon') },
              { key: 'E',       action: t('Exact payment (no change)') },
              { key: 'Q',       action: t('₹{n} note', { n: 10 }) },
              { key: 'W',       action: t('₹{n} note', { n: 20 }) },
              { key: 'H',       action: t('₹{n} note (Half)', { n: 50 }) },
              { key: '1',       action: t('₹{n} note', { n: 100 }) },
              { key: '2',       action: t('₹{n} note', { n: 200 }) },
              { key: '5',       action: t('₹{n} note', { n: 500 }) },
              { key: '⌫',       action: t('Remove last note') },
              { key: 'Esc',     action: t('Cancel auto-reset') },
            ].map(({ key, action }) => (
              <div key={key} className="flex items-center gap-2.5">
                <kbd className="min-w-[2rem] text-center text-xs font-bold bg-gray-100 border border-gray-300 text-gray-700 rounded px-1.5 py-0.5 font-mono">{key}</kbd>
                <span className="text-xs text-gray-500">{action}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-3">{t('Note shortcuts only work when focus is not inside a text input.')}</p>
        </div>
      )}

      {/* ── Offline banner ──────────────────────────────────────────────────── */}
      {!isOnline ? (
        <div className={`card px-3 py-2 border flex items-center gap-2 text-xs ${
          poolCount === 0 ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'
        }`}>
          <CloudOff className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">
            <strong>{t('Offline')}</strong> — {poolCount > 0 ? t('{n} coupons available', { n: poolCount }) : t('No coupons! Pre-fetch first')}
            {offlineIssuedCount > 0 && ` · ${t('{n} unsynced', { n: offlineIssuedCount })}`}
          </span>
        </div>
      ) : (syncPending > 0 || poolCount <= 10) && (
        <div className="card px-3 py-1.5 border flex flex-wrap items-center gap-2">
          <span className="text-gray-500 flex items-center gap-1.5 text-xs">
            <span className={`w-1.5 h-1.5 rounded-full ${poolCount > 50 ? 'bg-green-400' : poolCount > 10 ? 'bg-amber-400' : 'bg-red-400'}`} />
            {t('Offline pool:')} <strong>{poolCount}</strong>
          </span>
          <div className="flex gap-1.5 ml-auto">
            {syncPending > 0 && (
              <button onClick={sync} disabled={isSyncing}
                className="flex items-center gap-1 px-2.5 py-0.5 max-sm:py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">
                <CloudUpload className="h-3 w-3" /> {isSyncing ? t('Syncing…') : t('Sync ({n})', { n: syncPending })}
              </button>
            )}
            <button onClick={() => prefetch(200)} disabled={isPrefetching}
              className="flex items-center gap-1 px-2.5 py-0.5 max-sm:py-2 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium disabled:opacity-50">
              <Download className="h-3 w-3" /> {isPrefetching ? t('Fetching…') : t('Pre-fetch {n}', { n: 200 })}
            </button>
          </div>
        </div>
      )}

      {/* ── Tuesday surge banner ────────────────────────────────────────────── */}
      {isTuesdayToday && isToday && (
        <div className="card px-4 py-3 border-2 border-yellow-300 bg-yellow-50 flex items-center gap-3">
          <span className="text-xl select-none" aria-hidden>🔔</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-yellow-900 leading-tight">{t('High Traffic Day — Tuesday')}</p>
            <p className="text-xs text-yellow-700 mt-0.5">
              {t('Expected 1500+ devotees · Auto-reset in {n}s', { n: resetDuration })}
              {` · ${!cap ? t('No daily cap set') : atCap ? t('Cap reached') : t('{left} of {cap} remaining', { left: capRemaining, cap })}`}
            </p>
          </div>
          {cap > 0 && (
            <div className="text-right shrink-0 space-y-1">
              <p className={`text-sm font-black tabular-nums ${atCap ? 'text-red-600' : 'text-yellow-800'}`}>
                {totalIssued}/{cap}
              </p>
              <div className="w-16 sm:w-20 h-1.5 bg-yellow-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${atCap ? 'bg-red-500' : 'bg-yellow-500'}`}
                  style={{ width: `${Math.min(100, capPct ?? 0)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Float reminder ──────────────────────────────────────────────────── */}
      {isToday && drawerData && !isFloatSet && !floatSkipped && (
        <div className="card border-2 border-amber-300 bg-amber-50 px-4 sm:px-5 py-4 flex items-start gap-3 sm:gap-4">
          <div className="w-10 h-10 rounded-full bg-amber-200 flex items-center justify-center shrink-0">
            <Vault className="h-5 w-5 text-amber-700" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-amber-900">{t('Opening float not set')}</p>
            <p className="text-sm text-amber-700 mt-0.5">
              {t('Set the opening cash balance now so the drawer can calculate correct change throughout the day.')}
            </p>
            <button
              onClick={() => {
                cashDrawerRef.current?.openFloatForm();
                setTimeout(() => cashDrawerElRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
              }}
              className="mt-3 inline-flex items-center gap-2 text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 max-sm:py-2.5 rounded-lg transition-colors shadow-sm"
            >
              <Vault className="h-4 w-4" /> {t('Set Opening Float')}
            </button>
          </div>
          <button onClick={() => setFloatSkipped(true)} title={t('Remind me later')} aria-label={t('Remind me later')}
            className="text-amber-400 hover:text-amber-700 shrink-0 mt-0.5 transition-colors max-sm:p-3 max-sm:-m-3">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Stats strip ─────────────────────────────────────────────────────── */}
      {/* Phones: one compact row, with a wider cell for the rupee total. */}
      {!summaryLoading && (
        <div className="grid grid-cols-[1fr_1fr_1fr_1.4fr] gap-1.5 sm:grid-cols-4 sm:gap-2">
          {[
            {
              label: 'Issued',
              value: totalIssued,
              sub: cap > 0 ? (atCap ? t('Cap reached') : t('{n} left', { n: capRemaining })) : null,
              color: atCap ? 'text-red-600' : 'text-orange-600',
              extra: capPct != null ? (
                <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${atCap ? 'bg-red-400' : 'bg-orange-400'}`} style={{ width: `${Math.min(100, capPct)}%` }} />
                </div>
              ) : null,
              mine: myCount,
            },
            { label: 'Redeemed', value: summary.redeemed || 0, color: 'text-green-600' },
            { label: 'Pending',  value: summary.pending  || 0, color: 'text-blue-600'  },
            { label: 'Collected', value: `₹${fmtMoney(summary.collected)}`, color: 'text-green-700' },
          ].map(({ label, value, sub, color, extra, mine }) => (
            <div key={label} className="card min-w-0 px-2.5 py-2 sm:px-3">
              <p className="text-[11px] text-gray-400 font-medium truncate">{t(label)}</p>
              <p className={`text-base sm:text-xl font-black tabular-nums leading-tight truncate ${color}`}>{value}</p>
              {sub && <p className="text-[10px] text-gray-400 truncate">{sub}</p>}
              {extra}
              {mine !== undefined && (
                <p className="text-[10px] text-primary-500 font-medium truncate">{t('You: {n}', { n: mine })}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Cap warning ─────────────────────────────────────────────────────── */}
      {atCap && (
        <div className="card p-3 border-red-200 bg-red-50 flex items-center gap-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {t('Daily cap of {cap} reached — no more coupons can be issued for this date.', { cap })}
        </div>
      )}

      {/* ── Issue card ──────────────────────────────────────────────────────── */}
      {/* Two columns (transaction | payment) from md up; stacked on phones. */}
      <div className="card overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1px_1fr] gap-0">

          {/* Left: Transaction ──────────────────────────────────────────────── */}
          <div className="p-4 sm:p-6 space-y-5 sm:space-y-6">

            {/* Quantity */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">{t('Persons')}</label>
              <div className="flex items-center gap-3 mb-3">
                <button
                  type="button"
                  aria-label={t('One less person')}
                  onClick={() => { haptics.tap(); const v = Math.max(1, qty - 1); setQty(v); if (v === 1) setIsGroup(false); }}
                  className="w-12 h-12 sm:w-10 sm:h-10 shrink-0 rounded-xl border-2 border-gray-200 text-gray-500 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50 active:bg-orange-50 transition-all flex items-center justify-center font-bold text-lg">
                  <Minus className="h-5 w-5 sm:h-4 sm:w-4" />
                </button>
                <input
                  ref={qtyInputRef}
                  type="number" inputMode="numeric" min={1} max={cap > 0 ? capRemaining : 200}
                  value={qty}
                  onChange={(e) => { const v = Math.max(1, parseInt(e.target.value) || 1); setQty(v); setIsGroup(v > 1); }}
                  aria-label={t('Persons')}
                  className={`min-w-0 flex-1 sm:flex-none w-20 h-12 sm:h-10 text-3xl font-black text-center border-2 rounded-xl focus:outline-none focus:border-orange-400 tabular-nums ${
                    wouldExceed ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200'
                  }`}
                />
                <button
                  type="button"
                  aria-label={t('One more person')}
                  onClick={() => { haptics.tap(); const v = qty + 1; setQty(v); setIsGroup(v > 1); }}
                  disabled={wouldExceed}
                  className="w-12 h-12 sm:w-10 sm:h-10 shrink-0 rounded-xl border-2 border-gray-200 text-gray-500 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50 active:bg-orange-50 transition-all flex items-center justify-center disabled:opacity-30">
                  <Plus className="h-5 w-5 sm:h-4 sm:w-4" />
                </button>
              </div>

              {/* Quick presets */}
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5, 10].map((n) => (
                  <button key={n} type="button"
                    onClick={() => { haptics.tap(); setQty(n); setIsGroup(n > 1); }}
                    disabled={cap > 0 && n > capRemaining}
                    className={`flex-1 h-10 sm:h-8 rounded-lg border text-sm font-semibold transition-all disabled:opacity-30 ${
                      qty === n
                        ? 'border-orange-400 bg-orange-50 text-orange-700'
                        : 'border-gray-200 text-gray-500 hover:border-orange-300 hover:bg-orange-50/50'
                    }`}>
                    {n}
                  </button>
                ))}
              </div>

              {wouldExceed && (
                <p className="text-xs text-red-500 flex items-center gap-1 mt-2">
                  <AlertTriangle className="h-3 w-3" /> {t("Only {n} left under today's cap", { n: capRemaining })}
                </p>
              )}

              {/* Group coupon toggle */}
              {qty > 1 && (
                <label className="inline-flex items-center gap-2 cursor-pointer select-none mt-3 max-sm:py-1.5">
                  <div onClick={() => setIsGroup((v) => !v)}
                    className={`relative w-9 h-5 shrink-0 rounded-full transition-colors ${isGroup ? 'bg-purple-500' : 'bg-gray-200'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isGroup ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                  <span className="text-sm text-gray-600">
                    {t('Group coupon')} <span className="text-gray-400">{t('(one QR for all {n})', { n: qty })}</span>
                  </span>
                </label>
              )}
            </div>

            {/* Type */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">{t('Type')}</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setType('paid')}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                    type === 'paid' ? 'border-blue-400 bg-blue-50' : 'border-gray-100 text-gray-400 hover:border-gray-300'
                  }`}>
                  <IndianRupee className={`h-5 w-5 shrink-0 ${type === 'paid' ? 'text-blue-600' : ''}`} />
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${type === 'paid' ? 'text-blue-700' : 'text-gray-600'}`}>{t('Paid|coupon')}</p>
                    <p className={`text-xs ${type === 'paid' ? 'text-blue-500' : 'text-gray-400'}`}>
                      {t('₹{price} / person', { price: pricePerPlate || '—' })}
                    </p>
                  </div>
                </button>
                <button type="button" onClick={() => setType('free')}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                    type === 'free' ? 'border-green-400 bg-green-50' : 'border-gray-100 text-gray-400 hover:border-gray-300'
                  }`}>
                  <Gift className={`h-5 w-5 shrink-0 ${type === 'free' ? 'text-green-600' : ''}`} />
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${type === 'free' ? 'text-green-700' : 'text-gray-600'}`}>{t('Free Seva')}</p>
                    <p className={`text-xs ${type === 'free' ? 'text-green-500' : 'text-gray-400'}`}>{t('Complimentary')}</p>
                  </div>
                </button>
              </div>

              {/* Occasion selector — free only */}
              {type === 'free' && (
                <div className="mt-3 space-y-2">
                  {occasions.length > 0 ? (
                    <>
                      <select value={occasionPreset}
                        onChange={(e) => { setOccasionPreset(e.target.value); setOccasionCustom(''); }}
                        className="input text-sm">
                        <option value="">{t('Occasion (optional)…')}</option>
                        {occasions.map((o) => <option key={o._id} value={o.name}>{o.name}</option>)}
                        <option value="__other__">{t('Other…')}</option>
                      </select>
                      {occasionPreset === '__other__' && (
                        <input value={occasionCustom} onChange={(e) => setOccasionCustom(e.target.value)}
                          className="input text-sm" placeholder={t('Describe the occasion…')} />
                      )}
                    </>
                  ) : (
                    <input value={occasionCustom} onChange={(e) => setOccasionCustom(e.target.value)}
                      className="input text-sm" placeholder={t('Occasion (optional)…')} />
                  )}
                </div>
              )}
            </div>

            {/* Auto-print — thermal printing isn't available in the mobile apps */}
            {!isNative && (
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-50">
                <button type="button" onClick={handleAutoPrintToggle}
                  className="flex items-center gap-2 text-sm text-gray-500 select-none cursor-pointer max-sm:py-2">
                  <div className={`relative w-9 h-5 rounded-full transition-colors ${autoPrint ? 'bg-orange-500' : 'bg-gray-200'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${autoPrint ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                  <Zap className={`h-3.5 w-3.5 ${autoPrint ? 'text-orange-500' : 'text-gray-400'}`} />
                  {t('Auto-print')}
                </button>
                {autoPrint && (
                  window.electronAPI?.isElectron ? (
                    printerStatus === 'checking'
                      ? <span className="text-xs text-gray-400 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> {t('Checking…')}</span>
                      : printerStatus === 'ok'
                      ? <span className="text-xs text-green-600 flex items-center gap-1"><Wifi className="h-3 w-3" /> {t('Printer ready')}</span>
                      : printerStatus
                      ? <span className="text-xs text-red-500 flex items-center gap-1"><WifiOff className="h-3 w-3" /> {t(printerStatus)}</span>
                      : null
                  ) : (
                    qzReady
                      ? <span className="text-xs text-green-600 flex items-center gap-1"><Wifi className="h-3 w-3" /> {t('Connected')}</span>
                      : <span className="text-xs text-red-500 flex items-center gap-1"><WifiOff className="h-3 w-3" /> {t('QZ Tray offline')}</span>
                  )
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="hidden md:block bg-gray-100" />

          {/* Right: Payment ─────────────────────────────────────────────────── */}
          <div className="p-4 sm:p-6 flex flex-col max-md:border-t max-md:border-gray-100">
            {type === 'paid' && pricePerPlate > 0 ? (
              <div className="flex flex-col h-full space-y-4">

                {/* Total due */}
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">{t('Total Due')}</label>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black text-gray-900 tabular-nums">₹{fmtMoney(totalDue)}</span>
                    {qty > 1 && <span className="text-sm text-gray-400">{qty} × ₹{pricePerPlate}</span>}
                  </div>
                </div>

                {/* Cash / UPI toggle */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { val: 'cash', label: 'Cash', Icon: Banknote },
                    { val: 'upi',  label: 'UPI',  Icon: Smartphone },
                  ].map(({ val, label, Icon }) => (
                    <button key={val} type="button"
                      onClick={() => setPaymentMode(val)}
                      className={`flex items-center justify-center gap-2 py-2 max-sm:py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                        paymentMode === val ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-400 hover:border-gray-300'
                      }`}>
                      <Icon className="h-4 w-4" /> {t(label)}
                    </button>
                  ))}
                </div>

                {paymentMode === 'upi' ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center py-6 max-md:py-3 text-gray-400">
                      <Smartphone className="h-8 w-8 mx-auto mb-2 text-blue-300" />
                      <p className="text-sm">{t('₹{amount} via UPI', { amount: fmtMoney(totalDue) })}</p>
                      <p className="text-xs mt-0.5">{t('Exact payment — no change')}</p>
                    </div>
                  </div>
                ) : (
                  <div className={`max-lg:space-y-2.5 ${shakePayment ? 'animate-shake' : ''}`}>
                    {/* Note tiles — each shows change inline */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">{t('Customer pays with')}</label>
                      {/* Accumulator strip */}
                      {receivedNotes.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 max-lg:mb-2">
                          {receivedNotes.map((n, i) => (
                            <span key={i} className="flex items-center gap-1">
                              {i > 0 && <span className="text-blue-300 text-xs">+</span>}
                              <button type="button"
                                onClick={() => setReceivedNotes((prev) => prev.filter((_, j) => j !== i))}
                                className="flex items-center gap-1 text-xs font-bold text-blue-800 bg-blue-100 hover:bg-red-100 hover:text-red-700 rounded px-1.5 py-0.5 max-sm:px-2 max-sm:py-1.5 max-sm:text-sm transition-colors group">
                                ₹{n}
                                <X className="h-2.5 w-2.5 opacity-40 group-hover:opacity-100" />
                              </button>
                            </span>
                          ))}
                          <span className="text-blue-600 text-xs font-semibold ml-1">= ₹{fmtMoney(notesTotal)}</span>
                          <button type="button" onClick={clearPayment} title={t('Clear all')} aria-label={t('Clear all notes')}
                            className="ml-auto text-blue-400 hover:text-blue-700 transition-colors max-sm:p-3 max-sm:-m-3">
                            <X className="h-3.5 w-3.5 max-sm:h-4 max-sm:w-4" />
                          </button>
                        </div>
                      )}

                      {/* 4-col grid: Exact spans 2 cols → row 1 = Exact+₹10+₹20, row 2 = ₹50+₹100+₹200+₹500 */}
                      <div className="grid grid-cols-4 gap-1.5">
                        {/* Exact tile — double width */}
                        <button type="button"
                          onClick={() => { haptics.tap(); setCustomCash(String(totalDue)); setReceivedNotes([]); }}
                          className={`col-span-2 relative py-2 max-sm:py-3 px-2 rounded-lg border-2 text-center transition-all ${
                            customCash !== '' && Number(customCash) === totalDue ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-green-300 hover:bg-green-50/50'
                          }`}>
                          {!isNative && (
                            <span className="hidden sm:block absolute top-0.5 right-1 text-[8px] font-bold bg-gray-100 text-gray-400 rounded px-1 leading-4">[E]</span>
                          )}
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{t('Exact')}</p>
                          <p className="text-base font-black text-gray-900 tabular-nums leading-tight">₹{fmtMoney(totalDue)}</p>
                        </button>

                        {/* Note tiles */}
                        {noteTiles.map((n) => {
                          const count   = noteCounts[n] || 0;
                          const keyHint = isNative ? null : NOTE_KEY[n];
                          return (
                            <button key={n} type="button"
                              onClick={() => { haptics.tap(); addNote(n); }}
                              className={`relative py-2 max-sm:py-3 px-1 rounded-lg border-2 text-center transition-all ${
                                count > 0 ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                              }`}>
                              {count > 0 ? (
                                <span className="absolute top-0.5 right-0.5 text-[8px] max-sm:text-[10px] font-bold bg-blue-600 text-white rounded px-1 leading-4">×{count}</span>
                              ) : keyHint ? (
                                <span className="hidden sm:block absolute top-0.5 right-0.5 text-[8px] font-bold bg-gray-100 text-gray-400 rounded px-1 leading-4">[{keyHint}]</span>
                              ) : null}
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">₹</p>
                              <p className={`text-sm max-sm:text-base font-black tabular-nums leading-tight ${count > 0 ? 'text-blue-700' : 'text-gray-900'}`}>{n}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Manual override — clears tile accumulator */}
                    <div className="flex items-center gap-2">
                      <input
                        type="number" inputMode="numeric" min={0} value={customCash}
                        onChange={(e) => { setCustomCash(e.target.value); setReceivedNotes([]); }}
                        placeholder={t('Or type any amount…')}
                        className="input text-sm flex-1"
                      />
                      {(customCash !== '' || receivedNotes.length > 0) && (
                        <button type="button" onClick={clearPayment} aria-label={t('Clear amount')}
                          className="text-gray-400 hover:text-gray-600 max-sm:p-3">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {/* Change display */}
                    {cashReceived > 0 && (
                      <div className={`rounded-lg border-2 px-4 py-2.5 flex items-center justify-between ${
                        changeDue > 0  ? 'border-amber-300 bg-amber-50' :
                        changeDue === 0 ? 'border-green-300 bg-green-50' :
                        shakePayment ? 'border-red-500 bg-red-100 ring-2 ring-red-400' : 'border-red-300 bg-red-50'
                      }`}>
                        {changeDue > 0 ? (
                          <>
                            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">{t('Return to customer')}</p>
                            <p className="text-2xl font-black text-amber-800 tabular-nums">₹{fmtMoney(changeDue)}</p>
                          </>
                        ) : changeDue === 0 ? (
                          <p className="text-sm font-bold text-green-600 w-full text-center">{t('✓ Exact — no change')}</p>
                        ) : (
                          <>
                            <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">{t('Short by')}</p>
                            <p className="text-2xl font-black text-red-700 tabular-nums">₹{fmtMoney(Math.abs(changeDue))}</p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : type === 'free' ? (
              <div className="flex-1 flex items-center justify-center">
                {pricePerPlate === 0 ? (
                  <div className="text-center py-8 max-md:py-3 space-y-2">
                    <div className="w-14 h-14 max-md:w-11 max-md:h-11 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                      <Gift className="h-7 w-7 max-md:h-5 max-md:w-5 text-green-500" />
                    </div>
                    <p className="text-base font-bold text-green-700">{t('Free Day')}</p>
                    <p className="text-xs text-gray-400">{t('No price set for today — all coupons are free')}</p>
                    <button type="button" onClick={() => setType('paid')}
                      className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 mt-1 max-sm:py-2">
                      {t('Issue as Paid anyway')}
                    </button>
                  </div>
                ) : (
                  <div className="text-center text-gray-400 py-8 max-md:py-3">
                    <Gift className="h-10 w-10 max-md:h-7 max-md:w-7 mx-auto mb-2 text-green-300" />
                    <p className="text-sm font-medium text-green-600">{t('Free Seva')}</p>
                    <p className="text-xs mt-0.5">{t('No payment required')}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center text-gray-400 py-8 max-md:py-4 text-sm">
                {t('Set price in Settings → Mahaprasad to enable payment tracking')}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── Last batch success ───────────────────────────────────────────────── */}
      {!isTouchLayout && successCard}

      {/* ── Cash drawer + batches ────────────────────────────────────────────── */}
      {isToday && (
        <div ref={cashDrawerElRef}>
          <CashDrawer ref={cashDrawerRef} date={date} />
        </div>
      )}
      <BatchesSection date={date} onPdfPrint={handlePdfPrint} printing={printing} onVoid={(batchId) => setVoidConfirm(batchId)} />
    </div>

    {/* Shortage warning dialog */}
    <Sheet open={!!shortageWarning} onClose={() => setShortageWarning(null)} size="sm">
      {shortageWarning && (
        <div className="space-y-4 sm:pt-2">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-gray-900">{t('Drawer short ₹{amount}', { amount: fmtMoney(shortageWarning.shortBy) })}</p>
              <p className="text-sm text-gray-500 mt-1">{t('The cash drawer may not have enough notes to return exact change. Proceed anyway?')}</p>
            </div>
          </div>
          <div className="flex gap-3 justify-end max-sm:[&>*]:flex-1">
            <button onClick={() => setShortageWarning(null)}
              className="btn btn-ghost border px-4 py-2 max-sm:py-3 text-sm">{t('Cancel')}</button>
            <button
              onClick={() => {
                setShortageWarning(null);
                issueMut.mutate({ qty, isGroup, type, date,
                  occasion: type === 'free' ? occasionValue : '',
                  paymentMode: type === 'paid' && pricePerPlate > 0 ? paymentMode : undefined,
                  amountReceived: type === 'paid' && pricePerPlate > 0 ? cashReceived : undefined,
                  receivedNotes:  type === 'paid' && pricePerPlate > 0 && paymentMode === 'cash' && receivedNotes.length > 0 ? receivedNotes : undefined,
                });
              }}
              className="btn bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 max-sm:py-3 text-sm font-semibold">
              {t('Proceed anyway')}
            </button>
          </div>
        </div>
      )}
    </Sheet>

    {/* Void confirm dialog */}
    <Sheet open={!!voidConfirm} onClose={() => setVoidConfirm(null)} size="sm">
      <div className="space-y-4 sm:pt-2">
        <div>
          <p className="font-semibold text-gray-900">{t('Void this batch?')}</p>
          <p className="text-sm text-gray-500 mt-1">{t('All coupons in this batch will be marked void and the payment will be reversed. This cannot be undone.')}</p>
        </div>
        <div className="flex gap-3 justify-end max-sm:[&>*]:flex-1">
          <button onClick={() => setVoidConfirm(null)} className="btn btn-ghost border px-4 py-2 max-sm:py-3 text-sm">{t('Cancel')}</button>
          <button onClick={() => voidMut.mutate(voidConfirm)} disabled={voidMut.isPending}
            className="btn bg-red-600 hover:bg-red-700 text-white px-4 py-2 max-sm:py-3 text-sm font-semibold disabled:opacity-50">
            {voidMut.isPending ? t('Voiding…') : t('Void Batch')}
          </button>
        </div>
      </div>
    </Sheet>

    {/* ── Issue bar ──────────────────────────────────────────────────────────── */}
    {/* lg+: sticky at the bottom of the page. Below lg: pinned above the tab bar (or the
        keyboard), carrying the "issued" card so it's visible without scrolling. */}
    <div className="fixed inset-x-0 bottom-tabbar z-20 bg-white border-t border-gray-200 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] px-4 pt-3 pb-5 space-y-2
      lg:sticky lg:bottom-0 lg:z-10 lg:px-6 lg:pb-3 lg:space-y-0">
      {isTouchLayout && successCard && (
        <div className="max-h-[45dvh] overflow-y-auto overscroll-contain">{successCard}</div>
      )}
      <div className="flex items-center gap-2 lg:gap-4">
        <button
          onClick={handleIssue}
          disabled={isOnline ? !canIssue : !canIssueOffline}
          className={`flex-1 min-w-0 flex items-center justify-center gap-2 py-3 max-lg:py-3.5 max-lg:leading-tight rounded-xl font-bold text-base text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm ${
            type === 'free' ? 'bg-green-600 hover:bg-green-700' :
            isPending ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
          }`}>
          {isPending ? (
            <><span className="animate-spin text-lg">⟳</span> {autoPrint ? t('Issuing & printing…') : t('Issuing…')}</>
          ) : isOnline ? (
            isGroup
              ? `${t('Issue Group — {n} persons', { n: qty })}${type === 'paid' && totalDue > 0 ? ` · ₹${fmtMoney(totalDue)}` : ''}`
              : `${t(qty > 1 ? 'Issue {n} Coupons' : 'Issue {n} Coupon', { n: qty })}${type === 'paid' && totalDue > 0 ? ` · ₹${fmtMoney(totalDue)}` : ''}`
          ) : (
            t('Issue Coupon (offline)')
          )}
        </button>
        <p className="text-xs text-gray-400 hidden lg:block">Enter ↵</p>
        {lastIssuedBatch && (
          <button
            onClick={async () => {
              if (!isNative && (window.electronAPI?.isElectron || autoPrint)) {
                const failed = [];
                for (const c of lastIssuedBatch.coupons) {
                  try { await handleThermalPrint(c); }
                  catch { failed.push(c); }
                }
                if (failed.length > 0) setPrintQueue((q) => [...q, ...failed]);
              } else {
                handlePdfPrint(lastIssuedBatch.numbers);
              }
            }}
            disabled={isNative && printing}
            title={t(isNative ? 'Share last batch · {count}' : 'Reprint last batch · {count}', {
              count: t(lastIssuedBatch.numbers.length > 1 ? '{n} coupons' : '{n} coupon', { n: lastIssuedBatch.numbers.length }),
            })}
            className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors
              max-lg:flex-col max-lg:gap-0.5 max-lg:self-stretch max-lg:justify-center max-lg:px-2.5 max-lg:text-[11px] max-lg:rounded-xl disabled:opacity-50">
            <PdfIcon className="h-3.5 w-3.5 max-lg:h-4 max-lg:w-4" />
            <span className="max-lg:hidden">{t('Reprint Last')}</span>
            <span className="lg:hidden">{isNative ? t('Last PDF') : t('Reprint')}</span>
          </button>
        )}
        {printQueue.length > 0 && (
          <button
            onClick={handleRetryPrintQueue}
            title={t(printQueue.length > 1 ? '{n} coupons waiting to print' : '{n} coupon waiting to print', { n: printQueue.length })}
            className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg px-3 py-2 transition-colors animate-pulse
              max-lg:flex-col max-lg:gap-0.5 max-lg:self-stretch max-lg:justify-center max-lg:px-2.5 max-lg:text-[11px] max-lg:rounded-xl">
            <Printer className="h-3.5 w-3.5 max-lg:h-4 max-lg:w-4" />
            {t('Retry ({n})', { n: printQueue.length })}
          </button>
        )}
      </div>
    </div>

    {/* Shift summary */}
    <Sheet
      open={showShiftSummary}
      onClose={() => setShowShiftSummary(false)}
      size="sm"
      title={<span className="flex items-center gap-2"><UtensilsCrossed className="h-5 w-5 text-orange-500" /> {t('My Shift Summary')}</span>}
    >
      <div className="space-y-5">
        <div className="text-xs text-gray-400 -mt-1">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-orange-50 border border-orange-100 px-4 py-3 col-span-2">
            <p className="text-xs text-orange-600 font-semibold uppercase tracking-wide">{t('Coupons Issued')}</p>
            <p className="text-3xl font-black text-orange-700 tabular-nums">{myCount}</p>
          </div>
          <div className="rounded-xl bg-green-50 border border-green-100 px-4 py-3">
            <p className="text-xs text-green-600 font-semibold uppercase tracking-wide mb-0.5">{t('Cash')}</p>
            <p className="text-xl font-black text-green-800 tabular-nums">₹{fmtMoney(myCash)}</p>
          </div>
          <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
            <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide mb-0.5">UPI</p>
            <p className="text-xl font-black text-blue-800 tabular-nums">₹{fmtMoney(myUpi)}</p>
          </div>
          <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 col-span-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-600">{t('Total Collected')}</p>
            <p className="text-2xl font-black text-gray-900 tabular-nums">₹{fmtMoney(myCash + myUpi)}</p>
          </div>
        </div>

        <p className="text-xs text-center text-gray-400">{t('Share your shift summary with your supervisor.')}</p>

        <button
          onClick={handleShareShift}
          className={`w-full flex items-center justify-center gap-2 py-2.5 max-sm:py-3 rounded-xl text-sm font-bold transition-colors border-2 ${
            shiftCopied
              ? 'bg-green-50 border-green-400 text-green-700'
              : 'bg-white border-green-300 text-green-700 hover:bg-green-50'
          }`}>
          <MessageCircle className="h-4 w-4" />
          {isNative ? t('Share summary') : shiftCopied ? t('Copied!') : t('Copy for WhatsApp')}
        </button>

        {thermalPrinterName && (
          <button
            onClick={async () => {
              try {
                await printShiftSummary({
                  dateStr: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                  staffName: user?.name || 'Staff',
                  count: myCount,
                  cash: myCash,
                  upi: myUpi,
                }, thermalPrinterName);
                toast.success(t('Shift slip printed'));
              } catch (err) {
                toast.error(err.message || t('Print failed'));
              }
            }}
            className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white py-2.5 rounded-xl text-sm font-bold transition-colors">
            <Printer className="h-4 w-4" /> {t('Print Shift Slip')}
          </button>
        )}

        <button onClick={() => setShowShiftSummary(false)}
          className="w-full btn btn-ghost border py-2 max-sm:py-3 text-sm font-semibold">
          {t('Close')}
        </button>
      </div>
    </Sheet>
    </>
  );
}
