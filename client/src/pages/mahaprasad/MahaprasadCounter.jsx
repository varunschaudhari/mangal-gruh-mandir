import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UtensilsCrossed, Printer, RefreshCw, IndianRupee,
  Gift, ChevronDown, ChevronUp, Zap, AlertTriangle, Wifi, WifiOff,
  CloudOff, CloudUpload, Download, Banknote, Smartphone, CheckCircle2,
  Minus, Plus, X, ClipboardList, Keyboard,
} from 'lucide-react';
import { issueCoupons, getDailySummary, printCoupons, getBatches, getCashDrawer, voidBatch as voidBatchApi } from '../../api/mahaprasad.api.js';
import CashDrawer from './CashDrawer.jsx';
import { getOccasions } from '../../api/mahaprasadOccasion.api.js';
import { getSettings } from '../../api/settings.api.js';
import { printThermalCoupon, isConnected, connectToQzTray } from '../../utils/thermalPrint.js';
import * as offlineStore from '../../utils/offlineStore.js';
import { useOfflineMode } from '../../hooks/useOfflineMode.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import toast from 'react-hot-toast';

const todayStr  = () => new Date().toISOString().split('T')[0];
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
  const DENOMS = [500, 100, 50, 20, 10, 5, 2, 1];
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
        className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
        <span className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-blue-500" />
          Today's Batches
          <span className="text-xs font-normal text-gray-400">({batches.length} batch{batches.length !== 1 ? 'es' : ''})</span>
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>
      {open && (
        <div className="divide-y divide-gray-50">
          {batches.map((b) => (
            <div key={b._id} className={`flex items-center gap-3 px-5 py-2.5 ${b.statuses?.includes('voided') ? 'opacity-50' : ''}`}>
              <span className="shrink-0 text-xs text-gray-400 w-12 font-mono">{fmtTime(b.issuedAt)}</span>
              <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                <Badge variant={b.type === 'paid' ? 'blue' : 'purple'} size="sm">
                  {b.type === 'free' ? `Free${b.occasion ? ` · ${b.occasion}` : ''}` : 'Paid'}
                </Badge>
                <span className="text-xs font-semibold text-gray-700">
                  {b.isGroup ? `Group · ${b.groupSize || b.count} persons` : `${b.count} coupon${b.count !== 1 ? 's' : ''}`}
                </span>
                <span className="text-xs text-gray-400 font-mono">
                  {b.couponFrom === b.couponTo ? b.couponFrom : `${b.couponFrom} → ${b.couponTo}`}
                </span>
                {b.issuedBy?.name && <span className="text-xs text-gray-400">· {b.issuedBy.name}</span>}
              </div>
              <button onClick={() => onPdfPrint(b.numbers)} disabled={printing}
                className="shrink-0 btn btn-ghost border text-xs flex items-center gap-1 py-1 px-2">
                <Printer className="h-3 w-3" /> PDF
              </button>
              {b.statuses?.includes('voided') ? (
                <span className="shrink-0 text-xs text-red-500 font-semibold">Voided</span>
              ) : (
                <button onClick={() => onVoid(b._id)} title="Void batch"
                  className="shrink-0 text-gray-300 hover:text-red-500 transition-colors">
                  <X className="h-3.5 w-3.5" />
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
  const qc          = useQueryClient();
  const qtyInputRef = useRef(null);

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
  const [voidConfirm,      setVoidConfirm]      = useState(null);  // batchId string
  const [showShortcuts,    setShowShortcuts]    = useState(false);
  const [lastIssuedBatch,  setLastIssuedBatch]  = useState(null);  // persists after auto-reset
  const [showShiftSummary, setShowShiftSummary] = useState(false);

  const {
    isOnline, poolCount, offlineIssued: offlineIssuedCount, syncPending,
    isSyncing, isPrefetching, prefetch, sync, refreshCounts, getOfflineUser, getOfflineSettings,
  } = useOfflineMode();

  const occasionValue = occasionPreset === '__other__' ? occasionCustom : occasionPreset;
  const isToday       = date === todayStr();

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
  const myCount      = summary.myCount ?? 0;
  const myCash       = summary.myCash  ?? 0;
  const myUpi        = summary.myUpi   ?? 0;

  useEffect(() => { setQzReady(isConnected()); }, []);

  // ── Auto-reset countdown after issue ────────────────────────────────────────
  useEffect(() => {
    if (!lastBatch) return;
    let s = 3;
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
        setTimeout(() => qtyInputRef.current?.focus(), 50);
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

  const handlePdfPrint = async (numbers) => {
    setPrinting(true);
    try {
      const res = await printCoupons(numbers);
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { toast.error('Failed to generate PDF'); }
    finally   { setPrinting(false); }
  };

  const handleThermalPrint = async (coupon) => {
    try {
      await printThermalCoupon(coupon, settings);
      setQzReady(true);
    } catch (err) {
      setQzReady(isConnected());
      const msg = err.message || 'Thermal print failed';
      if (msg.includes('not set') || msg.includes('not configured')) toast.error('Set printer name in Settings → Mahaprasad');
      else if (!isConnected()) toast.error('QZ Tray not running — install from qz.io');
      else toast.error(msg);
      throw err;
    }
  };

  const handleIssueOffline = async () => {
    if (offlineIssuing) return;
    setOfflineIssuing(true);
    try {
      const ds     = date.replace(/-/g, '');
      const coupon = await offlineStore.popNextCoupon(ds);
      if (!coupon) { toast.error('No offline coupons left. Go online and pre-fetch more.'); return; }

      const user        = getOfflineUser();
      const offSettings = getOfflineSettings();
      const pricing     = offSettings.mahaprasadDayPricing ?? settings.mahaprasadDayPricing;
      const price       = type === 'paid' ? getDayPrice(pricing, new Date(date)) : 0;
      const batchId     = Math.random().toString(36).slice(2, 10);

      const issued = await offlineStore.confirmIssue(coupon.couponNumber, {
        type, amount: price, occasion: type === 'free' ? occasionValue : '',
        issuedAt: new Date().toISOString(), issuedById: user._id || '', issuedByName: user.name || 'Staff', batchId,
      });

      setLastBatch({ numbers: [issued.couponNumber], coupons: [issued] });
      setQty(1); clearPayment();
      await refreshCounts();
      qc.invalidateQueries({ queryKey: ['mahaprasad-summary'] });

      if (autoPrint) {
        const ps = Object.keys(offSettings).length ? offSettings : settings;
        try { await printThermalCoupon({ ...issued, date: coupon.date, status: 'issued' }, ps); }
        catch { /* non-fatal */ }
      }
      toast.success(`Issued offline · ${poolCount - 1} remaining`);
    } finally { setOfflineIssuing(false); }
  };

  const handleAutoPrintToggle = async () => {
    const next = !autoPrint;
    setAutoPrint(next);
    if (next && !isConnected()) {
      try { await connectToQzTray(); setQzReady(true); toast.success('QZ Tray connected'); }
      catch { toast.error('QZ Tray not reachable — install & start from qz.io'); }
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
        let allOk = true;
        for (const coupon of coupons) {
          try { await handleThermalPrint(coupon); }
          catch { allOk = false; break; }
        }
        if (allOk) toast.success(vars.isGroup ? `Group (${vars.qty}) issued & printed` : `${coupons.length} coupon${coupons.length > 1 ? 's' : ''} issued & printed`);
      } else {
        toast.success(vars.isGroup ? `Group coupon (${vars.qty} persons) issued` : `${coupons.length} coupon${coupons.length > 1 ? 's' : ''} issued`);
      }
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to issue'),
  });

  const voidMut = useMutation({
    mutationFn: (batchId) => voidBatchApi(batchId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mahaprasad-batches', date] });
      qc.invalidateQueries({ queryKey: ['mahaprasad-summary', date] });
      qc.invalidateQueries({ queryKey: ['mahaprasad-cash-drawer', date] });
      setVoidConfirm(null);
      toast.success('Batch voided');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to void batch'),
  });

  const handleIssue = () => {
    if (!isOnline) { handleIssueOffline(); return; }

    // Check if drawer can make change before issuing
    if (paymentMode === 'cash' && cashReceived > 0 && changeDue > 0) {
      const { canMakeExact, shortBy } = computeChange(changeDue, drawerCounts);
      if (!canMakeExact) {
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

  useEffect(() => { qtyInputRef.current?.focus(); }, []);

  const canIssue        = !issueMut.isPending && !atCap && !wouldExceed && qty >= 1;
  const canIssueOffline = !offlineIssuing && poolCount > 0 && isToday;
  const isPending       = issueMut.isPending || offlineIssuing;

  // All notes always visible in accumulator mode
  const noteTiles  = NOTES; // [50, 100, 200, 500]
  const noteCounts = receivedNotes.reduce((acc, n) => ({ ...acc, [n]: (acc[n] || 0) + 1 }), {});

  // ── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <>
    <div className="space-y-4 pb-20" onKeyDown={handleKeyDown}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Mahaprasad Counter"
          subtitle="Issue coupons for today's meal"
          breadcrumbs={[{ label: 'Mahaprasad' }]}
        />
        <div className="flex items-center gap-2 mt-1">
          <input
            type="date"
            value={date}
            min={todayStr()}
            onChange={(e) => {
              const val = e.target.value;
              if (val && val < todayStr()) return;
              setDate(val || todayStr()); setLastBatch(null);
            }}
            className="input text-sm h-9"
          />
          {!isToday && (
            <button onClick={() => setDate(todayStr())} className="text-xs text-primary-600 hover:underline whitespace-nowrap">Today</button>
          )}
          <button onClick={() => refetch()} title="Refresh" className="btn btn-ghost border h-9 w-9 flex items-center justify-center">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button onClick={() => setShowShortcuts((v) => !v)} title="Keyboard shortcuts"
            className={`btn btn-ghost border h-9 w-9 flex items-center justify-center transition-colors ${showShortcuts ? 'bg-gray-100 border-gray-300' : ''}`}>
            <Keyboard className="h-4 w-4" />
          </button>
          {isToday && (
            <button onClick={() => setShowShiftSummary(true)} title="My shift summary"
              className="btn btn-ghost border h-9 px-3 flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">
              <UtensilsCrossed className="h-3.5 w-3.5" />
              My Shift
            </button>
          )}
        </div>
      </div>

      {/* ── Keyboard shortcut legend ────────────────────────────────────────── */}
      {showShortcuts && (
        <div className="card px-5 py-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Keyboard Shortcuts</p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
            {[
              { key: 'Enter ↵', action: 'Issue coupon' },
              { key: 'E',       action: 'Exact payment (no change)' },
              { key: 'Q',       action: '₹10 note' },
              { key: 'W',       action: '₹20 note' },
              { key: 'H',       action: '₹50 note (Half)' },
              { key: '1',       action: '₹100 note' },
              { key: '2',       action: '₹200 note' },
              { key: '5',       action: '₹500 note' },
              { key: '⌫',       action: 'Remove last note' },
              { key: 'Esc',     action: 'Cancel auto-reset' },
            ].map(({ key, action }) => (
              <div key={key} className="flex items-center gap-2.5">
                <kbd className="min-w-[2rem] text-center text-xs font-bold bg-gray-100 border border-gray-300 text-gray-700 rounded px-1.5 py-0.5 font-mono">{key}</kbd>
                <span className="text-xs text-gray-500">{action}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-3">Note shortcuts only work when focus is not inside a text input.</p>
        </div>
      )}

      {/* ── Offline banner ──────────────────────────────────────────────────── */}
      {!isOnline ? (
        <div className={`card p-3 border flex items-center gap-2.5 text-sm ${
          poolCount === 0 ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'
        }`}>
          <CloudOff className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            <strong>Offline</strong> — {poolCount > 0 ? `${poolCount} coupons available` : 'No coupons! Pre-fetch first'}
            {offlineIssuedCount > 0 && ` · ${offlineIssuedCount} unsynced`}
          </span>
        </div>
      ) : (syncPending > 0 || poolCount <= 10) && (
        <div className="card p-2.5 border flex flex-wrap items-center gap-3 text-sm">
          <span className="text-gray-500 flex items-center gap-1.5 text-xs">
            <span className={`w-2 h-2 rounded-full ${poolCount > 50 ? 'bg-green-400' : poolCount > 10 ? 'bg-amber-400' : 'bg-red-400'}`} />
            Offline pool: <strong>{poolCount}</strong>
          </span>
          <div className="flex gap-2 ml-auto">
            {syncPending > 0 && (
              <button onClick={sync} disabled={isSyncing}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">
                <CloudUpload className="h-3.5 w-3.5" /> {isSyncing ? 'Syncing…' : `Sync (${syncPending})`}
              </button>
            )}
            <button onClick={() => prefetch(200)} disabled={isPrefetching}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium disabled:opacity-50">
              <Download className="h-3.5 w-3.5" /> {isPrefetching ? 'Fetching…' : 'Pre-fetch 200'}
            </button>
          </div>
        </div>
      )}

      {/* ── Stats strip ─────────────────────────────────────────────────────── */}
      {!summaryLoading && (
        <div className="grid grid-cols-4 gap-3">
          {[
            {
              label: 'Issued',
              value: totalIssued,
              sub: cap > 0 ? (atCap ? 'Cap reached' : `${capRemaining} left of ${cap}`) : null,
              color: atCap ? 'text-red-600' : 'text-orange-600',
              extra: capPct != null ? (
                <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${atCap ? 'bg-red-400' : 'bg-orange-400'}`} style={{ width: `${Math.min(100, capPct)}%` }} />
                </div>
              ) : null,
              mine: myCount,
            },
            { label: 'Redeemed', value: summary.redeemed || 0, color: 'text-green-600' },
            { label: 'Pending',  value: summary.pending  || 0, color: 'text-blue-600'  },
            { label: 'Collected', value: `₹${fmtMoney(summary.collected)}`, color: 'text-green-700' },
          ].map(({ label, value, sub, color, extra, mine }) => (
            <div key={label} className="card px-4 py-3">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-2xl font-black tabular-nums ${color}`}>{value}</p>
              {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
              {extra}
              {mine !== undefined && (
                <p className="text-xs text-primary-500 font-medium mt-0.5">You: {mine}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Cap warning ─────────────────────────────────────────────────────── */}
      {atCap && (
        <div className="card p-3 border-red-200 bg-red-50 flex items-center gap-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Daily cap of {cap} reached — no more coupons can be issued for this date.
        </div>
      )}

      {/* ── Issue card ──────────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="grid grid-cols-[1fr_1px_1fr] gap-0">

          {/* Left: Transaction ──────────────────────────────────────────────── */}
          <div className="p-6 space-y-6">

            {/* Quantity */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Persons</label>
              <div className="flex items-center gap-3 mb-3">
                <button
                  type="button"
                  onClick={() => { const v = Math.max(1, qty - 1); setQty(v); if (v === 1) setIsGroup(false); }}
                  className="w-10 h-10 rounded-xl border-2 border-gray-200 text-gray-500 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50 transition-all flex items-center justify-center font-bold text-lg">
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  ref={qtyInputRef}
                  type="number" min={1} max={cap > 0 ? capRemaining : 200}
                  value={qty}
                  onChange={(e) => { const v = Math.max(1, parseInt(e.target.value) || 1); setQty(v); setIsGroup(v > 1); }}
                  className={`w-20 h-10 text-3xl font-black text-center border-2 rounded-xl focus:outline-none focus:border-orange-400 tabular-nums ${
                    wouldExceed ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => { const v = qty + 1; setQty(v); setIsGroup(v > 1); }}
                  disabled={wouldExceed}
                  className="w-10 h-10 rounded-xl border-2 border-gray-200 text-gray-500 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50 transition-all flex items-center justify-center disabled:opacity-30">
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Quick presets */}
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5, 10].map((n) => (
                  <button key={n} type="button"
                    onClick={() => { setQty(n); setIsGroup(n > 1); }}
                    disabled={cap > 0 && n > capRemaining}
                    className={`flex-1 h-8 rounded-lg border text-sm font-semibold transition-all disabled:opacity-30 ${
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
                  <AlertTriangle className="h-3 w-3" /> Only {capRemaining} left under today's cap
                </p>
              )}

              {/* Group coupon toggle */}
              {qty > 1 && (
                <label className="inline-flex items-center gap-2 cursor-pointer select-none mt-3">
                  <div onClick={() => setIsGroup((v) => !v)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${isGroup ? 'bg-purple-500' : 'bg-gray-200'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isGroup ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                  <span className="text-sm text-gray-600">
                    Group coupon <span className="text-gray-400">(one QR for all {qty})</span>
                  </span>
                </label>
              )}
            </div>

            {/* Type */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setType('paid')}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                    type === 'paid' ? 'border-blue-400 bg-blue-50' : 'border-gray-100 text-gray-400 hover:border-gray-300'
                  }`}>
                  <IndianRupee className={`h-5 w-5 shrink-0 ${type === 'paid' ? 'text-blue-600' : ''}`} />
                  <div>
                    <p className={`text-sm font-semibold ${type === 'paid' ? 'text-blue-700' : 'text-gray-600'}`}>Paid</p>
                    <p className={`text-xs ${type === 'paid' ? 'text-blue-500' : 'text-gray-400'}`}>
                      ₹{pricePerPlate || '—'} / person
                    </p>
                  </div>
                </button>
                <button type="button" onClick={() => setType('free')}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                    type === 'free' ? 'border-green-400 bg-green-50' : 'border-gray-100 text-gray-400 hover:border-gray-300'
                  }`}>
                  <Gift className={`h-5 w-5 shrink-0 ${type === 'free' ? 'text-green-600' : ''}`} />
                  <div>
                    <p className={`text-sm font-semibold ${type === 'free' ? 'text-green-700' : 'text-gray-600'}`}>Free Seva</p>
                    <p className={`text-xs ${type === 'free' ? 'text-green-500' : 'text-gray-400'}`}>Complimentary</p>
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
                        <option value="">Occasion (optional)…</option>
                        {occasions.map((o) => <option key={o._id} value={o.name}>{o.name}</option>)}
                        <option value="__other__">Other…</option>
                      </select>
                      {occasionPreset === '__other__' && (
                        <input value={occasionCustom} onChange={(e) => setOccasionCustom(e.target.value)}
                          className="input text-sm" placeholder="Describe the occasion…" />
                      )}
                    </>
                  ) : (
                    <input value={occasionCustom} onChange={(e) => setOccasionCustom(e.target.value)}
                      className="input text-sm" placeholder="Occasion (optional)…" />
                  )}
                </div>
              )}
            </div>

            {/* Auto-print */}
            <div className="flex items-center gap-2 pt-1 border-t border-gray-50">
              <button type="button" onClick={handleAutoPrintToggle}
                className="flex items-center gap-2 text-sm text-gray-500 select-none cursor-pointer">
                <div className={`relative w-9 h-5 rounded-full transition-colors ${autoPrint ? 'bg-orange-500' : 'bg-gray-200'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${autoPrint ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <Zap className={`h-3.5 w-3.5 ${autoPrint ? 'text-orange-500' : 'text-gray-400'}`} />
                Auto-print
              </button>
              {autoPrint && (
                qzReady
                  ? <span className="text-xs text-green-600 flex items-center gap-1"><Wifi className="h-3 w-3" /> Connected</span>
                  : <span className="text-xs text-red-500 flex items-center gap-1"><WifiOff className="h-3 w-3" /> QZ Tray offline</span>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="bg-gray-100" />

          {/* Right: Payment ─────────────────────────────────────────────────── */}
          <div className="p-6 flex flex-col">
            {type === 'paid' && pricePerPlate > 0 ? (
              <div className="flex flex-col h-full space-y-4">

                {/* Total due */}
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Total Due</label>
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
                      onClick={() => { setPaymentMode(val); clearPayment(); }}
                      className={`flex items-center justify-center gap-2 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
                        paymentMode === val ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-400 hover:border-gray-300'
                      }`}>
                      <Icon className="h-4 w-4" /> {label}
                    </button>
                  ))}
                </div>

                {paymentMode === 'upi' ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center py-6 text-gray-400">
                      <Smartphone className="h-8 w-8 mx-auto mb-2 text-blue-300" />
                      <p className="text-sm">₹{fmtMoney(totalDue)} via UPI</p>
                      <p className="text-xs mt-0.5">Exact payment — no change</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Note tiles — each shows change inline */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Customer pays with</label>
                      {/* Accumulator strip */}
                      {receivedNotes.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                          {receivedNotes.map((n, i) => (
                            <span key={i} className="flex items-center gap-1">
                              {i > 0 && <span className="text-blue-300 text-xs">+</span>}
                              <span className="text-xs font-bold text-blue-800 bg-blue-100 rounded px-1.5 py-0.5">₹{n}</span>
                            </span>
                          ))}
                          <span className="text-blue-600 text-xs font-semibold ml-1">= ₹{fmtMoney(notesTotal)}</span>
                          <button type="button" onClick={clearPayment}
                            className="ml-auto text-blue-400 hover:text-blue-700 transition-colors">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        {/* Exact tile */}
                        <button type="button"
                          onClick={() => { setCustomCash(String(totalDue)); setReceivedNotes([]); }}
                          className={`relative p-3 rounded-xl border-2 text-center transition-all ${
                            customCash !== '' && Number(customCash) === totalDue ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-green-300 hover:bg-green-50/50'
                          }`}>
                          <span className="absolute top-1 right-1 text-[9px] font-bold bg-gray-100 text-gray-400 rounded px-1 leading-4">[E]</span>
                          <p className="text-xs font-semibold text-gray-500">Exact</p>
                          <p className="text-lg font-black text-gray-900 tabular-nums">₹{fmtMoney(totalDue)}</p>
                          <p className="text-xs text-green-600 font-medium">No change ✓</p>
                        </button>

                        {/* Note tiles — each click adds to accumulator */}
                        {noteTiles.map((n) => {
                          const count   = noteCounts[n] || 0;
                          const keyHint = NOTE_KEY[n];
                          return (
                            <button key={n} type="button"
                              onClick={() => addNote(n)}
                              className={`relative p-3 rounded-xl border-2 text-center transition-all ${
                                count > 0 ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                              }`}>
                              {count > 0 ? (
                                <span className="absolute top-1 right-1 text-[9px] font-bold bg-blue-600 text-white rounded px-1 leading-4">×{count}</span>
                              ) : keyHint ? (
                                <span className="absolute top-1 right-1 text-[9px] font-bold bg-gray-100 text-gray-400 rounded px-1 leading-4">[{keyHint}]</span>
                              ) : null}
                              <p className="text-xs font-semibold text-gray-500">Note</p>
                              <p className={`text-lg font-black tabular-nums ${count > 0 ? 'text-blue-700' : 'text-gray-900'}`}>₹{n}</p>
                              <p className="text-xs text-blue-400 font-medium">tap to add</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Manual override — clears tile accumulator */}
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min={0} value={customCash}
                        onChange={(e) => { setCustomCash(e.target.value); setReceivedNotes([]); }}
                        placeholder="Or type any amount…"
                        className="input text-sm flex-1"
                      />
                      {(customCash !== '' || receivedNotes.length > 0) && (
                        <button type="button" onClick={clearPayment}
                          className="text-gray-400 hover:text-gray-600">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {/* Change display */}
                    {cashReceived > 0 && (
                      <div className={`rounded-xl border-2 px-5 py-4 text-center ${
                        changeDue > 0  ? 'border-amber-300 bg-amber-50' :
                        changeDue === 0 ? 'border-green-300 bg-green-50' :
                        'border-red-300 bg-red-50'
                      }`}>
                        {changeDue > 0 ? (
                          <>
                            <p className="text-xs font-semibold text-amber-600 uppercase tracking-widest mb-1">Return to customer</p>
                            <p className="text-4xl font-black text-amber-800 tabular-nums">₹{fmtMoney(changeDue)}</p>
                          </>
                        ) : changeDue === 0 ? (
                          <p className="text-lg font-bold text-green-600">✓ Exact — no change</p>
                        ) : (
                          <>
                            <p className="text-xs font-semibold text-red-600 uppercase tracking-widest mb-1">Short by</p>
                            <p className="text-3xl font-black text-red-700 tabular-nums">₹{fmtMoney(Math.abs(changeDue))}</p>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : type === 'free' ? (
              <div className="flex-1 flex items-center justify-center">
                {pricePerPlate === 0 ? (
                  <div className="text-center py-8 space-y-2">
                    <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                      <Gift className="h-7 w-7 text-green-500" />
                    </div>
                    <p className="text-base font-bold text-green-700">Free Day</p>
                    <p className="text-xs text-gray-400">No price set for today — all coupons are free</p>
                    <button type="button" onClick={() => setType('paid')}
                      className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 mt-1">
                      Issue as Paid anyway
                    </button>
                  </div>
                ) : (
                  <div className="text-center text-gray-400 py-8">
                    <Gift className="h-10 w-10 mx-auto mb-2 text-green-300" />
                    <p className="text-sm font-medium text-green-600">Free Seva</p>
                    <p className="text-xs mt-0.5">No payment required</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center text-gray-400 py-8 text-sm">
                Set price in Settings → Mahaprasad to enable payment tracking
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── Last batch success ───────────────────────────────────────────────── */}
      {lastBatch && (
        <div className="card p-5 space-y-3 border-green-200 bg-green-50 animate-in slide-in-from-bottom-2">
          {/* Auto-reset countdown bar */}
          {autoResetIn !== null && (
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-green-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-1000 ease-linear"
                  style={{ width: `${(autoResetIn / 3) * 100}%` }}
                />
              </div>
              <span className="text-xs text-green-600 tabular-nums shrink-0">Resetting in {autoResetIn}s</span>
              <button type="button"
                onClick={() => { setAutoResetIn(null); }}
                className="text-xs font-semibold text-green-700 hover:text-green-900 border border-green-300 rounded px-2 py-0.5 hover:bg-green-100 transition-colors shrink-0">
                Keep
              </button>
            </div>
          )}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-green-800">
                  {lastBatch.isGroup
                    ? `Group coupon issued — ${lastBatch.groupQty} persons`
                    : `${lastBatch.numbers.length} coupon${lastBatch.numbers.length > 1 ? 's' : ''} issued`}
                </p>
                {/* Payment summary */}
                {lastBatch.payment && (
                  <p className="text-xs text-green-700 mt-0.5">
                    ₹{fmtMoney(lastBatch.payment.totalDue)} · paid ₹{fmtMoney(lastBatch.payment.amountReceived)} ({lastBatch.payment.mode})
                    {lastBatch.payment.mode === 'cash' && lastBatch.payment.change > 0 && (
                      <span className="font-bold text-amber-700 ml-1">· return ₹{fmtMoney(lastBatch.payment.change)}</span>
                    )}
                  </p>
                )}
              </div>
            </div>
            <button onClick={() => setLastBatch(null)} className="text-gray-400 hover:text-gray-600 shrink-0 mt-0.5">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Drawer change breakdown */}
          {lastBatch.payment?.drawerChange?.breakdown && Object.keys(lastBatch.payment.drawerChange.breakdown).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
              <span className="text-xs font-semibold text-amber-700">Give change:</span>
              {Object.entries(lastBatch.payment.drawerChange.breakdown)
                .sort(([a], [b]) => Number(b) - Number(a))
                .map(([d, c]) => (
                  <span key={d} className="text-xs bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">{c}×₹{d}</span>
                ))}
              {!lastBatch.payment.drawerChange.canMakeExact && (
                <span className="text-xs text-red-600 font-medium">(short ₹{lastBatch.payment.drawerChange.shortBy} — check drawer)</span>
              )}
            </div>
          )}

          {/* Coupon numbers + print */}
          <div className="flex flex-wrap items-center gap-2">
            {lastBatch.numbers.map((n) => (
              <span key={n} className="font-mono text-xs bg-white border border-green-200 rounded-md px-2 py-1 text-green-700 font-semibold">{n}</span>
            ))}
            <div className="ml-auto flex gap-2">
              <button
                onClick={async () => { for (const c of lastBatch.coupons) { try { await handleThermalPrint(c); } catch { break; } } }}
                className="btn text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5">
                <Printer className="h-3.5 w-3.5" /> Print
              </button>
              <button onClick={() => handlePdfPrint(lastBatch.numbers)} disabled={printing}
                className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2 py-1 disabled:opacity-40">
                PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cash drawer + batches ────────────────────────────────────────────── */}
      {isToday && <CashDrawer date={date} />}
      <BatchesSection date={date} onPdfPrint={handlePdfPrint} printing={printing} onVoid={(batchId) => setVoidConfirm(batchId)} />
    </div>

    {/* Shortage warning dialog */}
    {shortageWarning && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-gray-900">Drawer short ₹{fmtMoney(shortageWarning.shortBy)}</p>
              <p className="text-sm text-gray-500 mt-1">The cash drawer may not have enough notes to return exact change. Proceed anyway?</p>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShortageWarning(null)}
              className="btn btn-ghost border px-4 py-2 text-sm">Cancel</button>
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
              className="btn bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 text-sm font-semibold">
              Proceed anyway
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Void confirm dialog */}
    {voidConfirm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
          <div>
            <p className="font-semibold text-gray-900">Void this batch?</p>
            <p className="text-sm text-gray-500 mt-1">All coupons in this batch will be marked void and the payment will be reversed. This cannot be undone.</p>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setVoidConfirm(null)} className="btn btn-ghost border px-4 py-2 text-sm">Cancel</button>
            <button onClick={() => voidMut.mutate(voidConfirm)} disabled={voidMut.isPending}
              className="btn bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50">
              {voidMut.isPending ? 'Voiding…' : 'Void Batch'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Sticky issue button ───────────────────────────────────────────────── */}
    <div className="sticky bottom-0 z-10 bg-white border-t border-gray-200 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] px-6 py-3 flex items-center gap-4">
      <button
        onClick={handleIssue}
        disabled={isOnline ? !canIssue : !canIssueOffline}
        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-base text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm ${
          type === 'free' ? 'bg-green-600 hover:bg-green-700' :
          isPending ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
        }`}>
        {isPending ? (
          <><span className="animate-spin text-lg">⟳</span> {autoPrint ? 'Issuing & printing…' : 'Issuing…'}</>
        ) : isOnline ? (
          isGroup
            ? `Issue Group — ${qty} persons${type === 'paid' && totalDue > 0 ? ` · ₹${fmtMoney(totalDue)}` : ''}`
            : `Issue ${qty} Coupon${qty > 1 ? 's' : ''}${type === 'paid' && totalDue > 0 ? ` · ₹${fmtMoney(totalDue)}` : ''}`
        ) : (
          'Issue Coupon (offline)'
        )}
      </button>
      <p className="text-xs text-gray-400 hidden sm:block">Enter ↵</p>
      {lastIssuedBatch && (
        <button
          onClick={async () => {
            if (autoPrint) {
              for (const c of lastIssuedBatch.coupons) { try { await handleThermalPrint(c); } catch { break; } }
            } else {
              handlePdfPrint(lastIssuedBatch.numbers);
            }
          }}
          title={`Reprint last batch (${lastIssuedBatch.numbers.length} coupon${lastIssuedBatch.numbers.length > 1 ? 's' : ''})`}
          className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors">
          <Printer className="h-3.5 w-3.5" />
          Reprint Last
        </button>
      )}
    </div>

    {/* Shift summary modal */}
    {showShiftSummary && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UtensilsCrossed className="h-5 w-5 text-orange-500" />
              <p className="font-bold text-gray-900">My Shift Summary</p>
            </div>
            <button onClick={() => setShowShiftSummary(false)} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="text-xs text-gray-400 -mt-2">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-orange-50 border border-orange-100 px-4 py-3 col-span-2">
              <p className="text-xs text-orange-600 font-semibold uppercase tracking-wide">Coupons Issued</p>
              <p className="text-3xl font-black text-orange-700 tabular-nums">{myCount}</p>
            </div>
            <div className="rounded-xl bg-green-50 border border-green-100 px-4 py-3">
              <p className="text-xs text-green-600 font-semibold uppercase tracking-wide mb-0.5">Cash</p>
              <p className="text-xl font-black text-green-800 tabular-nums">₹{fmtMoney(myCash)}</p>
            </div>
            <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
              <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide mb-0.5">UPI</p>
              <p className="text-xl font-black text-blue-800 tabular-nums">₹{fmtMoney(myUpi)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 col-span-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-600">Total Collected</p>
              <p className="text-2xl font-black text-gray-900 tabular-nums">₹{fmtMoney(myCash + myUpi)}</p>
            </div>
          </div>

          <p className="text-xs text-center text-gray-400">Take a screenshot to share with your supervisor.</p>

          <button onClick={() => setShowShiftSummary(false)}
            className="w-full btn btn-ghost border py-2 text-sm font-semibold">
            Close
          </button>
        </div>
      </div>
    )}
    </>
  );
}
