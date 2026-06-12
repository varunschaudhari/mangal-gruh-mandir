import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UtensilsCrossed, Plus, Printer, RefreshCw, IndianRupee, CheckCircle2,
  Gift, ChevronDown, ChevronUp, Zap, AlertTriangle, Wifi, WifiOff,
  CloudOff, CloudUpload, Download,
} from 'lucide-react';
import { issueCoupons, getDailySummary, printCoupons, getBatches } from '../../api/mahaprasad.api.js';
import { getOccasions } from '../../api/mahaprasadOccasion.api.js';
import { getSettings } from '../../api/settings.api.js';
import { printThermalCoupon, isConnected, connectToQzTray } from '../../utils/thermalPrint.js';
import * as offlineStore from '../../utils/offlineStore.js';
import { useOfflineMode } from '../../hooks/useOfflineMode.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import toast from 'react-hot-toast';

const todayStr = () => new Date().toISOString().split('T')[0];
const fmtTime  = (d) => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function getDayPrice(dayPricing, date) {
  const d = date ? new Date(date) : new Date();
  return dayPricing?.[DAYS[d.getDay()]] ?? 0;
}

const QTY_PRESETS = [1, 5, 10, 25, 50];

// ── Stat cards ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'gray', progress }) {
  const palette = {
    saffron: { border: 'border-orange-400', text: 'text-orange-600', bar: 'bg-orange-400' },
    green:   { border: 'border-green-400',  text: 'text-green-600',  bar: 'bg-green-400'  },
    blue:    { border: 'border-blue-400',   text: 'text-blue-600',   bar: 'bg-blue-400'   },
    red:     { border: 'border-red-400',    text: 'text-red-600',    bar: 'bg-red-400'    },
    gray:    { border: 'border-gray-300',   text: 'text-gray-600',   bar: 'bg-gray-400'   },
  };
  const p = palette[color] || palette.gray;
  return (
    <div className={`card px-4 py-3 border-l-4 ${p.border}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-black ${p.text}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      {progress != null && (
        <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${p.bar}`} style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
      )}
    </div>
  );
}

// ── Today's batches section ───────────────────────────────────────────────────

function BatchesSection({ date, onPdfPrint, printing }) {
  const [open, setOpen] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ['mahaprasad-batches', date],
    queryFn:  () => getBatches(date),
    staleTime: 30 * 1000,
  });
  const batches = data?.data?.data || [];

  if (isLoading || batches.length === 0) return null;

  return (
    <div className="card overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
        <span>Today's Batches <span className="ml-1 text-xs font-normal text-gray-400">({batches.length})</span></span>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>

      {open && (
        <div className="divide-y divide-gray-50">
          {batches.map((b) => (
            <div key={b._id} className="flex items-center gap-3 px-5 py-3">
              <div className="shrink-0 text-xs text-gray-400 w-12 font-mono">{fmtTime(b.issuedAt)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={b.type === 'paid' ? 'blue' : 'purple'} size="sm">
                    {b.type === 'free' ? `Free${b.occasion ? ` · ${b.occasion}` : ''}` : 'Paid'}
                  </Badge>
                  <span className="text-xs font-semibold text-gray-700">{b.count} coupon{b.count !== 1 ? 's' : ''}</span>
                  <span className="text-xs text-gray-400 font-mono">
                    {b.couponFrom === b.couponTo ? b.couponFrom : `${b.couponFrom} → ${b.couponTo}`}
                  </span>
                </div>
                {b.issuedBy?.name && <p className="text-xs text-gray-400 mt-0.5">by {b.issuedBy.name}</p>}
              </div>
              <button onClick={() => onPdfPrint(b.numbers)} disabled={printing}
                className="shrink-0 btn btn-ghost border text-xs flex items-center gap-1.5 py-1 px-2.5">
                <Printer className="h-3.5 w-3.5" /> PDF
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MahaprasadCounter() {
  const qc = useQueryClient();
  const qtyInputRef = useRef(null);

  const [date,           setDate]           = useState(todayStr());
  const [qty,            setQty]            = useState(1);
  const [type,           setType]           = useState('paid');
  const [occasionPreset, setOccasionPreset] = useState('');
  const [occasionCustom, setOccasionCustom] = useState('');
  const [autoPrint,      setAutoPrint]      = useState(false);
  const [lastBatch,      setLastBatch]      = useState(null);
  const [printing,       setPrinting]       = useState(false);
  const [qzReady,        setQzReady]        = useState(false);
  const [offlineIssuing, setOfflineIssuing] = useState(false);

  const {
    isOnline, poolCount, offlineIssued: offlineIssuedCount, syncPending,
    isSyncing, isPrefetching, prefetch, sync, refreshCounts, getOfflineUser, getOfflineSettings,
  } = useOfflineMode();

  const occasionValue = occasionPreset === '__other__' ? occasionCustom : occasionPreset;
  const isToday = date === todayStr();

  // Settings — needed for thermal printer name + validity days
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

  // Refresh QZ Tray status
  useEffect(() => {
    setQzReady(isConnected());
  }, []);

  // Cap calculations
  const cap           = summary.cap || 0;
  const totalIssued   = summary.total || 0;
  const capRemaining  = cap > 0 ? Math.max(0, cap - totalIssued) : Infinity;
  const atCap         = cap > 0 && totalIssued >= cap;
  const wouldExceed   = cap > 0 && qty > capRemaining;
  const capPct        = cap > 0 ? Math.round((totalIssued / cap) * 100) : null;
  const redemptionPct = totalIssued > 0 ? Math.round(((summary.redeemed || 0) / totalIssued) * 100) : 0;

  // PDF fallback (reprint batch from history)
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

  // Thermal receipt — direct to USB printer via QZ Tray
  const handleThermalPrint = async (coupon) => {
    try {
      await printThermalCoupon(coupon, settings);
      setQzReady(true);
    } catch (err) {
      setQzReady(isConnected());
      const msg = err.message || 'Thermal print failed';
      if (msg.includes('not set') || msg.includes('not configured')) {
        toast.error('Set printer name in Settings → Mahaprasad');
      } else if (!isConnected()) {
        toast.error('QZ Tray not running — install from qz.io');
      } else {
        toast.error(msg);
      }
      throw err; // re-throw so caller can suppress auto-print noise
    }
  };

  // Offline issue — uses pre-fetched reserved coupons from IndexedDB
  const handleIssueOffline = async () => {
    if (offlineIssuing) return;
    setOfflineIssuing(true);
    try {
      const ds = date.replace(/-/g, '');
      const coupon = await offlineStore.popNextCoupon(ds);
      if (!coupon) {
        toast.error('No offline coupons left. Go online and pre-fetch more.');
        return;
      }

      const user     = getOfflineUser();
      const offSettings = getOfflineSettings();
      const pricing  = offSettings.mahaprasadDayPricing ?? settings.mahaprasadDayPricing;
      const price    = type === 'paid' ? getDayPrice(pricing, new Date(date)) : 0;
      const batchId  = Math.random().toString(36).slice(2, 10);
      const now      = new Date().toISOString();

      const issued = await offlineStore.confirmIssue(coupon.couponNumber, {
        type,
        amount:       price,
        occasion:     type === 'free' ? occasionValue : '',
        issuedAt:     now,
        issuedById:   user._id  || '',
        issuedByName: user.name || 'Staff',
        batchId,
      });

      setLastBatch({ numbers: [issued.couponNumber], coupons: [issued] });
      setQty(1);
      await refreshCounts();
      qc.invalidateQueries({ queryKey: ['mahaprasad-summary'] });

      if (autoPrint) {
        const printSettings = Object.keys(offSettings).length ? offSettings : settings;
        const couponForPrint = {
          ...issued,
          date:         coupon.date,
          status:       'issued',
          couponNumber: issued.couponNumber,
        };
        try { await printThermalCoupon(couponForPrint, printSettings); }
        catch { /* print failure is non-fatal */ }
      }

      toast.success(`Issued offline · ${poolCount - 1} remaining`);
    } finally {
      setOfflineIssuing(false);
    }
  };

  // Toggle auto-print — auto-connect to QZ Tray when enabled
  const handleAutoPrintToggle = async () => {
    const next = !autoPrint;
    setAutoPrint(next);
    if (next && !isConnected()) {
      try {
        await connectToQzTray();
        setQzReady(true);
        toast.success('QZ Tray connected');
      } catch {
        toast.error('QZ Tray not reachable — install & start from qz.io');
      }
    }
  };

  const issueMut = useMutation({
    mutationFn: () => issueCoupons({
      quantity: qty,
      type,
      occasion: type === 'free' ? occasionValue : '',
      date,
    }),
    onSuccess: async (res) => {
      const { coupons } = res.data.data;
      const batch = { numbers: coupons.map((c) => c.couponNumber), coupons };
      setLastBatch(batch);
      setQty(1);
      qc.invalidateQueries({ queryKey: ['mahaprasad-summary'] });
      qc.invalidateQueries({ queryKey: ['mahaprasad-coupons'] });
      qc.invalidateQueries({ queryKey: ['mahaprasad-batches', date] });

      if (autoPrint) {
        // Print each coupon directly to thermal printer — fast, no dialog
        let allOk = true;
        for (const coupon of coupons) {
          try { await handleThermalPrint(coupon); }
          catch { allOk = false; break; }
        }
        if (allOk) toast.success(`${coupons.length} coupon${coupons.length > 1 ? 's' : ''} issued & printed`);
      } else {
        toast.success(`${coupons.length} coupon${coupons.length > 1 ? 's' : ''} issued`);
      }
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to issue'),
  });

  const handleIssue = () => {
    if (!isOnline) { handleIssueOffline(); return; }
    issueMut.mutate();
  };

  // Enter key on any form input submits
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !issueMut.isPending && !offlineIssuing) {
      if (!isOnline && (atCap || poolCount === 0)) return;
      if (isOnline && (!canIssue)) return;
      handleIssue();
    }
  };

  // Focus qty on page load
  useEffect(() => { qtyInputRef.current?.focus(); }, []);

  const canIssue       = !issueMut.isPending && !atCap && !wouldExceed && qty >= 1;
  const canIssueOffline = !offlineIssuing && poolCount > 0 && isToday;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mahaprasad Counter"
        subtitle="Issue coupons for today's meal"
        breadcrumbs={[{ label: 'Mahaprasad' }]}
        actions={
          <button onClick={() => refetch()} className="btn btn-ghost border text-sm flex items-center gap-1.5">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        }
      />

      {/* Offline / sync banner */}
      {!isOnline ? (
        <div className={`card p-3 border flex items-center gap-2.5 text-sm ${
          poolCount === 0 ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'
        }`}>
          <CloudOff className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            <strong>Offline mode</strong> — {poolCount > 0 ? `${poolCount} coupons available` : 'No coupons! Go online and pre-fetch first'}
            {offlineIssuedCount > 0 && ` · ${offlineIssuedCount} pending sync`}
          </span>
        </div>
      ) : (
        <div className="card p-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-gray-500 flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${poolCount > 50 ? 'bg-green-400' : poolCount > 10 ? 'bg-amber-400' : 'bg-gray-300'}`} />
            Offline pool: <strong>{poolCount}</strong> coupons
            {offlineIssuedCount > 0 && <span className="text-amber-600 ml-1">· {offlineIssuedCount} unsynced</span>}
          </span>
          <div className="flex gap-2 ml-auto">
            {syncPending > 0 && (
              <button onClick={sync} disabled={isSyncing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50">
                <CloudUpload className="h-3.5 w-3.5" />
                {isSyncing ? 'Syncing…' : `Sync (${syncPending})`}
              </button>
            )}
            <button onClick={() => prefetch(200)} disabled={isPrefetching}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-orange-300 hover:text-orange-700 text-xs font-medium disabled:opacity-50">
              <Download className="h-3.5 w-3.5" />
              {isPrefetching ? 'Pre-fetching…' : 'Pre-fetch 200'}
            </button>
          </div>
        </div>
      )}

      {/* Date selector */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide shrink-0">Date</label>
        <input
          type="date"
          value={date}
          min={todayStr()}
          onChange={(e) => {
            const val = e.target.value;
            if (val && val < todayStr()) return;
            setDate(val || todayStr());
            setLastBatch(null);
          }}
          className="input text-sm max-w-xs"
        />
        {!isToday && (
          <button onClick={() => setDate(todayStr())} className="text-xs text-primary-600 hover:underline">
            Back to today
          </button>
        )}
      </div>

      {/* Summary stats */}
      {summaryLoading ? <PageLoader /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total Issued" value={totalIssued}
            sub={cap > 0 ? `${capRemaining === Infinity ? '∞' : capRemaining} remaining` : undefined}
            color={atCap ? 'red' : 'saffron'}
            progress={capPct} />
          <StatCard label="Redeemed"  value={summary.redeemed || 0} color="green" progress={redemptionPct} />
          <StatCard label="Pending"   value={summary.pending  || 0} color="blue" />
          <StatCard label="Paid"      value={summary.paid     || 0} color="gray" />
          <StatCard label="Free"      value={summary.free     || 0} color="gray" />
          <StatCard label="Collected" value={`₹${(summary.collected || 0).toLocaleString('en-IN')}`} color="green" />
        </div>
      )}

      {/* Cap full warning */}
      {atCap && (
        <div className="card p-3 border-red-200 bg-red-50 flex items-center gap-2.5 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Daily cap of {cap} coupons has been reached for this date. No more coupons can be issued.
        </div>
      )}

      {/* Issue form */}
      <div className="card p-5 space-y-5" onKeyDown={handleKeyDown}>
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <UtensilsCrossed className="h-4 w-4 text-orange-500" /> Issue Coupons
        </h3>

        {/* Quantity */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Quantity</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {QTY_PRESETS.map((n) => (
              <button key={n} type="button"
                onClick={() => setQty(n)}
                disabled={cap > 0 && n > capRemaining}
                className={`w-12 h-9 rounded-lg border-2 text-sm font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                  qty === n
                    ? 'border-orange-400 bg-orange-50 text-orange-700'
                    : 'border-gray-200 text-gray-600 hover:border-orange-300 hover:bg-orange-50/50'
                }`}>
                {n}
              </button>
            ))}
            <input
              ref={qtyInputRef}
              type="number" min={1} max={cap > 0 ? capRemaining : 200}
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              className={`w-20 h-9 input text-center font-bold ${wouldExceed ? 'border-red-400 bg-red-50' : ''}`}
              title="Custom quantity"
            />
          </div>
          {wouldExceed && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Only {capRemaining} coupon{capRemaining !== 1 ? 's' : ''} remaining under today's cap
            </p>
          )}
          {!wouldExceed && cap > 0 && (
            <p className="text-xs text-gray-400">{capRemaining} of {cap} cap remaining today</p>
          )}
          {!cap && <p className="text-xs text-gray-400">Max 200 per batch · No daily cap set</p>}
        </div>

        {/* Type */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Type</label>
          <div className="flex gap-3">
            {[
              { value: 'paid', label: 'Paid',     icon: IndianRupee, desc: `₹${(summary.pricePerPlate ?? getDayPrice(settings.mahaprasadDayPricing, new Date(date))) || '—'} per plate` },
              { value: 'free', label: 'Free Seva', icon: Gift,        desc: 'Complimentary' },
            ].map(({ value, label, icon: Icon, desc }) => (
              <label key={value}
                className={`flex-1 flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  type === value
                    ? value === 'paid'
                      ? 'border-blue-400 bg-blue-50 text-blue-700'
                      : 'border-green-400 bg-green-50 text-green-700'
                    : 'border-gray-100 text-gray-500 hover:border-gray-300'
                }`}>
                <input type="radio" value={value} checked={type === value} onChange={() => setType(value)} className="sr-only" />
                <Icon className="h-5 w-5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="text-xs opacity-70">{desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Occasion (free type only) */}
        {type === 'free' && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Occasion <span className="normal-case font-normal text-gray-400">(optional)</span>
            </label>
            {occasions.length > 0 ? (
              <div className="space-y-2">
                <select value={occasionPreset}
                  onChange={(e) => { setOccasionPreset(e.target.value); setOccasionCustom(''); }}
                  className="input text-sm">
                  <option value="">Select occasion…</option>
                  {occasions.map((o) => <option key={o._id} value={o.name}>{o.name}</option>)}
                  <option value="__other__">Other…</option>
                </select>
                {occasionPreset === '__other__' && (
                  <input value={occasionCustom} onChange={(e) => setOccasionCustom(e.target.value)}
                    className="input text-sm" placeholder="Describe the occasion…" />
                )}
              </div>
            ) : (
              <input value={occasionCustom} onChange={(e) => setOccasionCustom(e.target.value)}
                className="input text-sm" placeholder="e.g. Ram Navami, Ekadashi…" />
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-gray-100">
          <button
            onClick={handleIssue}
            disabled={isOnline ? !canIssue : !canIssueOffline}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              type === 'free' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}>
            <Plus className="h-4 w-4" />
            {(issueMut.isPending || offlineIssuing)
              ? (autoPrint ? 'Issuing & printing…' : 'Issuing…')
              : isOnline
                ? `Issue ${qty} Coupon${qty > 1 ? 's' : ''}`
                : `Issue Coupon (offline)`}
          </button>

          {/* Auto-print toggle */}
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleAutoPrintToggle}
              className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-600">
              <div className={`relative w-9 h-5 rounded-full transition-colors ${autoPrint ? 'bg-orange-500' : 'bg-gray-200'}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${autoPrint ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <Zap className={`h-3.5 w-3.5 ${autoPrint ? 'text-orange-500' : 'text-gray-400'}`} />
              <span>Auto-print</span>
            </button>
            {/* QZ Tray connection dot */}
            {autoPrint && (
              qzReady
                ? <span className="flex items-center gap-1 text-xs text-green-600">
                    <Wifi className="h-3 w-3" /> QZ Tray connected
                  </span>
                : <span className="flex items-center gap-1 text-xs text-red-500">
                    <WifiOff className="h-3 w-3" /> QZ Tray not running
                  </span>
            )}
          </div>

          <p className="text-xs text-gray-400 ml-auto hidden sm:block">Press Enter to issue</p>
        </div>
      </div>

      {/* Last batch result */}
      {lastBatch && (
        <div className="card p-5 space-y-3 border-green-200 bg-green-50 animate-in slide-in-from-bottom-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              <p className="text-sm font-semibold text-green-800">
                {lastBatch.numbers.length} coupon{lastBatch.numbers.length > 1 ? 's' : ''} issued
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Print Receipt — thermal direct */}
              <button
                onClick={async () => {
                  for (const c of lastBatch.coupons) {
                    try { await handleThermalPrint(c); } catch { break; }
                  }
                }}
                className="btn text-sm flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-semibold">
                <Printer className="h-4 w-4" /> Print Receipt
              </button>
              {/* PDF fallback */}
              <button onClick={() => handlePdfPrint(lastBatch.numbers)} disabled={printing}
                className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2 py-1 disabled:opacity-40">
                PDF
              </button>
              <button onClick={() => setLastBatch(null)} className="text-xs text-gray-400 hover:text-gray-600 px-2">✕</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {lastBatch.numbers.map((n) => (
              <span key={n} className="font-mono text-xs bg-white border border-green-200 rounded-md px-2 py-1 text-green-700 font-medium">
                {n}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Today's batches */}
      <BatchesSection date={date} onPdfPrint={handlePdfPrint} printing={printing} />
    </div>
  );
}
