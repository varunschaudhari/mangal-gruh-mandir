import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart2, RefreshCw, Download, CalendarDays, Users, AlertTriangle, BarChart3, MessageCircle } from 'lucide-react';
import { getReport, getMonthlyReport, getStaffReport, getWastageReport, getMahaprasadWhatsApp } from '../../api/mahaprasad.api.js';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { exportToExcel } from '../../utils/exportToExcel.js';

// ── Shared helpers ─────────────────────────────────────────────────────────────

const fmt    = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' }) : '—';
const pct    = (n, d) => d > 0 ? `${Math.round((n / d) * 100)}%` : '—';
const fmtRs  = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
function isoDate(d) { return d.toISOString().split('T')[0]; }

const fmtMonth = (ym) => {
  const [y, m] = ym.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

const SHORTCUTS = [
  { label: 'Today',      range: () => { const t = isoDate(new Date()); return { from: t, to: t }; } },
  { label: 'Last 7 days',  range: () => { const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 6); return { from: isoDate(from), to: isoDate(to) }; } },
  { label: 'This month', range: () => { const now = new Date(); return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDate(now) }; } },
  { label: 'Last month', range: () => { const now = new Date(); return { from: isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: isoDate(new Date(now.getFullYear(), now.getMonth(), 0)) }; } },
];

function DateRangeFilter({ from, to, setFrom, setTo, onApply, active, setActive, shortcuts = true }) {
  return (
    <div className="card p-4 space-y-3">
      {shortcuts && (
        <div className="flex flex-wrap gap-2">
          {SHORTCUTS.map(({ label, range }) => (
            <button key={label} onClick={() => { const r = range(); setFrom(r.from); setTo(r.to); onApply(r); setActive(label); }}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${active === label ? 'bg-primary-600 text-white border-primary-600' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">From</label>
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setActive?.(''); }} className="input text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">To</label>
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setActive?.(''); }} className="input text-sm" />
        </div>
        <button onClick={() => onApply({ from, to })} className="btn-primary text-sm">Generate</button>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card p-10 text-center">
      <BarChart2 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
      <p className="text-gray-500 font-medium">No data for selected period</p>
    </div>
  );
}

// ── Tab 1: Daily ──────────────────────────────────────────────────────────────

function DailyTab() {
  const def = (() => { const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 29); return { from: isoDate(from), to: isoDate(to) }; })();
  const [from,       setFrom]      = useState(def.from);
  const [to,         setTo]        = useState(def.to);
  const [params,     setParams]    = useState(def);
  const [active,     setActive]    = useState('');
  const [waLoading,  setWaLoading] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['mahaprasad-report', params],
    queryFn:  () => getReport(params),
    staleTime: 60 * 1000,
  });

  const res           = data?.data?.data || {};
  const rows          = res.rows         || [];
  const totals        = res.totals       || {};
  const pricePerPlate = res.pricePerPlate || 0;

  const handleExport = () => {
    exportToExcel(
      rows.map((r) => ({ Date: r._id, 'Total Issued': r.total, Redeemed: r.redeemed, 'Redemption %': pct(r.redeemed, r.total), Pending: r.total - r.redeemed, Paid: r.paid, Free: r.free, 'Collected (₹)': r.collected })),
      `Mahaprasad-Daily-${params.from}-to-${params.to}`, 'Daily Report'
    );
  };

  const handleWhatsApp = async () => {
    const shareDate = from === to ? from : isoDate(new Date());
    setWaLoading(true);
    try {
      const res = await getMahaprasadWhatsApp(shareDate);
      const text = res?.data?.data?.text;
      if (!text) throw new Error('No data');
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    } catch {
      toast.error('Failed to generate WhatsApp summary');
    } finally {
      setWaLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <button onClick={refetch} disabled={isFetching} className="btn btn-ghost border text-sm flex items-center gap-1.5">
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </button>
        <button onClick={handleWhatsApp} disabled={waLoading}
          className="btn btn-ghost border text-sm flex items-center gap-1.5 text-green-700 border-green-200 hover:bg-green-50 disabled:opacity-50">
          <MessageCircle className="h-4 w-4" />
          {waLoading ? 'Loading…' : from === to ? 'WhatsApp' : "Today's WhatsApp"}
        </button>
        {rows.length > 0 && (
          <button onClick={handleExport} className="btn btn-ghost border text-sm flex items-center gap-1.5">
            <Download className="h-4 w-4 text-green-600" /> Excel
          </button>
        )}
      </div>

      <DateRangeFilter from={from} to={to} setFrom={setFrom} setTo={setTo} active={active} setActive={setActive}
        onApply={(r) => setParams(r)} />

      {!isLoading && rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total Issued', value: totals.total,                                       color: 'border-orange-400 text-orange-600' },
            { label: 'Redeemed',     value: totals.redeemed,                                    color: 'border-green-400 text-green-600'   },
            { label: 'Pending',      value: (totals.total || 0) - (totals.redeemed || 0),       color: 'border-yellow-400 text-yellow-600' },
            { label: 'Paid',         value: totals.paid,                                        color: 'border-blue-400 text-blue-600'     },
            { label: 'Free',         value: totals.free,                                        color: 'border-purple-400 text-purple-600' },
            { label: 'Collected',    value: fmtRs(totals.collected),                            color: 'border-primary-400 text-primary-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className={`card px-4 py-3 border-l-4 ${color}`}>
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-xl font-black ${color.split(' ')[1]}`}>{value ?? 0}</p>
            </div>
          ))}
        </div>
      )}

      {!isLoading && res.occasionBreakdown?.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b bg-purple-50">
            <p className="text-sm font-semibold text-purple-800">Free Coupons by Occasion</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead><tr className="bg-gray-50 border-b">
                <th className="table-th">Occasion</th>
                <th className="table-th text-right">Issued</th>
                <th className="table-th text-right">Redeemed</th>
                <th className="table-th text-right">Redemption %</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {res.occasionBreakdown.map((o) => (
                  <tr key={o._id} className="hover:bg-gray-50 text-sm">
                    <td className="table-td font-medium text-gray-800">{o._id}</td>
                    <td className="table-td text-right text-purple-700 font-bold">{o.count}</td>
                    <td className="table-td text-right text-green-700">{o.redeemed}</td>
                    <td className="table-td text-right text-gray-500">{pct(o.redeemed, o.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isLoading ? <PageLoader /> : rows.length === 0 ? <EmptyState /> : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead><tr className="bg-gray-50 border-b">
                <th className="table-th">Date</th>
                <th className="table-th text-right">Issued</th>
                <th className="table-th text-right">Redeemed</th>
                <th className="table-th text-right">Redemption %</th>
                <th className="table-th text-right">Pending</th>
                <th className="table-th text-right">Paid</th>
                <th className="table-th text-right">Free</th>
                <th className="table-th text-right">Collected</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r) => {
                  const pending = r.total - r.redeemed;
                  return (
                    <tr key={r._id} className="hover:bg-gray-50 text-sm">
                      <td className="table-td font-medium text-gray-800">{fmt(r._id)}</td>
                      <td className="table-td text-right font-bold text-gray-700">{r.total}</td>
                      <td className="table-td text-right text-green-700 font-medium">{r.redeemed}</td>
                      <td className="table-td text-right text-gray-500">{pct(r.redeemed, r.total)}</td>
                      <td className={`table-td text-right font-medium ${pending > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>{pending}</td>
                      <td className="table-td text-right text-blue-700">{r.paid}</td>
                      <td className="table-td text-right text-purple-700">{r.free}</td>
                      <td className="table-td text-right font-semibold text-primary-700">{fmtRs(r.collected)}</td>
                    </tr>
                  );
                })}
                <tr className="bg-orange-50 font-bold border-t-2 border-orange-200">
                  <td className="table-td text-gray-700">Totals</td>
                  <td className="table-td text-right text-gray-800">{totals.total}</td>
                  <td className="table-td text-right text-green-700">{totals.redeemed}</td>
                  <td className="table-td text-right text-gray-500">{pct(totals.redeemed, totals.total)}</td>
                  <td className="table-td text-right text-yellow-700">{(totals.total || 0) - (totals.redeemed || 0)}</td>
                  <td className="table-td text-right text-blue-700">{totals.paid}</td>
                  <td className="table-td text-right text-purple-700">{totals.free}</td>
                  <td className="table-td text-right text-primary-700">{fmtRs(totals.collected)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 2: Monthly ────────────────────────────────────────────────────────────

function MonthlyTab() {
  const now = new Date();
  const def = { from: isoDate(new Date(now.getFullYear(), 0, 1)), to: isoDate(now) };
  const [from,   setFrom]   = useState(def.from);
  const [to,     setTo]     = useState(def.to);
  const [params, setParams] = useState(def);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['mahaprasad-report-monthly', params],
    queryFn:  () => getMonthlyReport(params),
    staleTime: 60 * 1000,
  });

  const rows   = data?.data?.data?.rows   || [];
  const totals = data?.data?.data?.totals || {};
  const maxTotal = Math.max(...rows.map((r) => r.total), 1);

  const handleExport = () => {
    exportToExcel(
      rows.map((r) => ({ Month: fmtMonth(r._id), 'Total Issued': r.total, Redeemed: r.redeemed, 'Redemption %': pct(r.redeemed, r.total), Pending: r.total - r.redeemed, Paid: r.paid, Free: r.free, 'Collected (₹)': r.collected })),
      `Mahaprasad-Monthly-${params.from}-to-${params.to}`, 'Monthly Report'
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <button onClick={refetch} disabled={isFetching} className="btn btn-ghost border text-sm flex items-center gap-1.5">
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </button>
        {rows.length > 0 && (
          <button onClick={handleExport} className="btn btn-ghost border text-sm flex items-center gap-1.5">
            <Download className="h-4 w-4 text-green-600" /> Excel
          </button>
        )}
      </div>

      <DateRangeFilter from={from} to={to} setFrom={setFrom} setTo={setTo} shortcuts={false}
        onApply={(r) => setParams(r)} />

      {!isLoading && rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: 'Total Issued', value: totals.total,            color: 'border-orange-400 text-orange-600' },
            { label: 'Redeemed',     value: totals.redeemed,         color: 'border-green-400 text-green-600'   },
            { label: 'Paid',         value: totals.paid,             color: 'border-blue-400 text-blue-600'     },
            { label: 'Free',         value: totals.free,             color: 'border-purple-400 text-purple-600' },
            { label: 'Collected',    value: fmtRs(totals.collected), color: 'border-primary-400 text-primary-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className={`card px-4 py-3 border-l-4 ${color}`}>
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-xl font-black ${color.split(' ')[1]}`}>{value ?? 0}</p>
            </div>
          ))}
        </div>
      )}

      {isLoading ? <PageLoader /> : rows.length === 0 ? <EmptyState /> : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead><tr className="bg-gray-50 border-b">
                <th className="table-th">Month</th>
                <th className="table-th">Volume</th>
                <th className="table-th text-right">Issued</th>
                <th className="table-th text-right">Redeemed</th>
                <th className="table-th text-right">Redemption %</th>
                <th className="table-th text-right">Pending</th>
                <th className="table-th text-right">Paid</th>
                <th className="table-th text-right">Free</th>
                <th className="table-th text-right">Collected</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r) => {
                  const pending = r.total - r.redeemed;
                  return (
                    <tr key={r._id} className="hover:bg-gray-50 text-sm">
                      <td className="table-td font-semibold text-gray-800 whitespace-nowrap">{fmtMonth(r._id)}</td>
                      <td className="table-td w-32">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-orange-400 rounded-full transition-all" style={{ width: `${Math.round((r.total / maxTotal) * 100)}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="table-td text-right font-bold text-gray-700">{r.total}</td>
                      <td className="table-td text-right text-green-700 font-medium">{r.redeemed}</td>
                      <td className="table-td text-right text-gray-500">{pct(r.redeemed, r.total)}</td>
                      <td className={`table-td text-right font-medium ${pending > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>{pending}</td>
                      <td className="table-td text-right text-blue-700">{r.paid}</td>
                      <td className="table-td text-right text-purple-700">{r.free}</td>
                      <td className="table-td text-right font-semibold text-primary-700">{fmtRs(r.collected)}</td>
                    </tr>
                  );
                })}
                <tr className="bg-orange-50 font-bold border-t-2 border-orange-200">
                  <td className="table-td text-gray-700">Totals</td>
                  <td className="table-td" />
                  <td className="table-td text-right text-gray-800">{totals.total}</td>
                  <td className="table-td text-right text-green-700">{totals.redeemed}</td>
                  <td className="table-td text-right text-gray-500">{pct(totals.redeemed, totals.total)}</td>
                  <td className="table-td text-right text-yellow-700">{(totals.total || 0) - (totals.redeemed || 0)}</td>
                  <td className="table-td text-right text-blue-700">{totals.paid}</td>
                  <td className="table-td text-right text-purple-700">{totals.free}</td>
                  <td className="table-td text-right text-primary-700">{fmtRs(totals.collected)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Staff ──────────────────────────────────────────────────────────────

function StaffTab() {
  const now = new Date();
  const def = { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDate(now) };
  const [from,   setFrom]   = useState(def.from);
  const [to,     setTo]     = useState(def.to);
  const [params, setParams] = useState(def);
  const [active, setActive] = useState('This month');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['mahaprasad-report-staff', params],
    queryFn:  () => getStaffReport(params),
    staleTime: 60 * 1000,
  });

  const rows = data?.data?.data?.rows || [];
  const totals = rows.reduce((a, r) => ({ issued: a.issued + r.issued, redeemed: a.redeemed + r.redeemed, freeSeva: a.freeSeva + r.freeSeva, collected: a.collected + r.collected }), { issued: 0, redeemed: 0, freeSeva: 0, collected: 0 });

  const handleExport = () => {
    exportToExcel(
      rows.map((r) => ({ Staff: r.name, Issued: r.issued, Redeemed: r.redeemed, 'Free Seva Issued': r.freeSeva, 'Collected (₹)': r.collected })),
      `Mahaprasad-Staff-${params.from}-to-${params.to}`, 'Staff Activity'
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <button onClick={refetch} disabled={isFetching} className="btn btn-ghost border text-sm flex items-center gap-1.5">
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </button>
        {rows.length > 0 && (
          <button onClick={handleExport} className="btn btn-ghost border text-sm flex items-center gap-1.5">
            <Download className="h-4 w-4 text-green-600" /> Excel
          </button>
        )}
      </div>

      <DateRangeFilter from={from} to={to} setFrom={setFrom} setTo={setTo} active={active} setActive={setActive}
        onApply={(r) => setParams(r)} />

      {isLoading ? <PageLoader /> : rows.length === 0 ? <EmptyState /> : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead><tr className="bg-gray-50 border-b">
                <th className="table-th">Staff</th>
                <th className="table-th text-right">Coupons Issued</th>
                <th className="table-th text-right">Free Seva Issued</th>
                <th className="table-th text-right">Coupons Redeemed</th>
                <th className="table-th text-right">Amount Collected</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r) => (
                  <tr key={r.userId} className="hover:bg-gray-50 text-sm">
                    <td className="table-td">
                      <span className="font-medium text-gray-900">{r.name}</span>
                    </td>
                    <td className="table-td text-right font-bold text-orange-700">{r.issued}</td>
                    <td className="table-td text-right text-purple-700">{r.freeSeva}</td>
                    <td className="table-td text-right text-green-700">{r.redeemed}</td>
                    <td className="table-td text-right font-semibold text-primary-700">{fmtRs(r.collected)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold border-t-2 border-gray-200">
                  <td className="table-td text-gray-700">Totals</td>
                  <td className="table-td text-right text-orange-700">{totals.issued}</td>
                  <td className="table-td text-right text-purple-700">{totals.freeSeva}</td>
                  <td className="table-td text-right text-green-700">{totals.redeemed}</td>
                  <td className="table-td text-right text-primary-700">{fmtRs(totals.collected)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 4: Wastage ────────────────────────────────────────────────────────────

function WastageTab() {
  const [from,   setFrom]   = useState('');
  const [params, setParams] = useState({});

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['mahaprasad-report-wastage', params],
    queryFn:  () => getWastageReport(params),
    staleTime: 60 * 1000,
  });

  const res          = data?.data?.data || {};
  const rows         = res.rows         || [];
  const totals       = res.totals       || {};
  const validityDays = res.validityDays;

  const handleExport = () => {
    exportToExcel(
      rows.map((r) => ({ Date: r._id, 'Expired (Total)': r.count, 'Paid (Expired)': r.paid, 'Free (Expired)': r.free, 'Amount Lost (₹)': r.wasted })),
      `Mahaprasad-Wastage`, 'Wastage Report'
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <button onClick={refetch} disabled={isFetching} className="btn btn-ghost border text-sm flex items-center gap-1.5">
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </button>
        {rows.length > 0 && (
          <button onClick={handleExport} className="btn btn-ghost border text-sm flex items-center gap-1.5">
            <Download className="h-4 w-4 text-green-600" /> Excel
          </button>
        )}
      </div>

      {/* Filter — only from date, upper bound is always (today - validity) */}
      <div className="card p-4 space-y-2">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">From date (optional)</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input text-sm" />
          </div>
          <button onClick={() => setParams(from ? { from } : {})} className="btn-primary text-sm">Refresh</button>
          {from && <button onClick={() => { setFrom(''); setParams({}); }} className="btn-secondary text-sm">Clear</button>}
        </div>
        {validityDays !== undefined && (
          <p className="text-xs text-gray-400">
            {validityDays === 0
              ? 'Coupon expiry is disabled — no coupons can expire'
              : `Showing coupons issued more than ${validityDays} day${validityDays > 1 ? 's' : ''} ago that were never redeemed`}
          </p>
        )}
      </div>

      {validityDays === 0 ? (
        <div className="card p-8 text-center">
          <AlertTriangle className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Coupon expiry is disabled</p>
          <p className="text-sm text-gray-400 mt-1">Set "Coupon Validity (days)" in Settings to a value &gt; 0 to track expiry.</p>
        </div>
      ) : (
        <>
          {!isLoading && rows.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total Expired',  value: totals.count,           color: 'border-red-400 text-red-600'     },
                { label: 'Paid (Expired)', value: totals.paid,            color: 'border-orange-400 text-orange-600' },
                { label: 'Free (Expired)', value: totals.free,            color: 'border-purple-400 text-purple-600' },
                { label: 'Amount Lost',    value: fmtRs(totals.wasted),   color: 'border-gray-400 text-gray-700'   },
              ].map(({ label, value, color }) => (
                <div key={label} className={`card px-4 py-3 border-l-4 ${color}`}>
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className={`text-xl font-black ${color.split(' ')[1]}`}>{value ?? 0}</p>
                </div>
              ))}
            </div>
          )}

          {isLoading ? <PageLoader /> : rows.length === 0 ? (
            <div className="card p-8 text-center">
              <AlertTriangle className="h-10 w-10 text-green-300 mx-auto mb-3" />
              <p className="text-green-600 font-medium">No expired coupons found</p>
              <p className="text-sm text-gray-400 mt-1">All issued coupons have been redeemed.</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead><tr className="bg-gray-50 border-b">
                    <th className="table-th">Date</th>
                    <th className="table-th text-right">Expired (Total)</th>
                    <th className="table-th text-right">Paid</th>
                    <th className="table-th text-right">Free</th>
                    <th className="table-th text-right">Amount Lost</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map((r) => (
                      <tr key={r._id} className="hover:bg-gray-50 text-sm">
                        <td className="table-td font-medium text-gray-800">{fmt(r._id)}</td>
                        <td className="table-td text-right font-bold text-red-700">{r.count}</td>
                        <td className="table-td text-right text-orange-700">{r.paid}</td>
                        <td className="table-td text-right text-purple-700">{r.free}</td>
                        <td className="table-td text-right font-semibold text-gray-700">{r.wasted > 0 ? fmtRs(r.wasted) : '—'}</td>
                      </tr>
                    ))}
                    <tr className="bg-red-50 font-bold border-t-2 border-red-200">
                      <td className="table-td text-gray-700">Totals</td>
                      <td className="table-td text-right text-red-700">{totals.count}</td>
                      <td className="table-td text-right text-orange-700">{totals.paid}</td>
                      <td className="table-td text-right text-purple-700">{totals.free}</td>
                      <td className="table-td text-right text-gray-700">{fmtRs(totals.wasted)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'daily',   label: 'Daily',   icon: CalendarDays  },
  { key: 'monthly', label: 'Monthly', icon: BarChart3      },
  { key: 'staff',   label: 'Staff',   icon: Users         },
  { key: 'wastage', label: 'Wastage', icon: AlertTriangle  },
];

export default function MahaprasadReport() {
  const [tab, setTab] = useState('daily');

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mahaprasad Reports"
        subtitle="Coupon issuance, collection, staff activity, and wastage analysis"
        breadcrumbs={[{ label: 'Mahaprasad', to: '/mahaprasad' }, { label: 'Report' }]}
      />

      {/* Tab bar */}
      <div className="card p-1 flex gap-1 flex-wrap">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
              tab === key ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'
            }`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'daily'   && <DailyTab />}
      {tab === 'monthly' && <MonthlyTab />}
      {tab === 'staff'   && <StaffTab />}
      {tab === 'wastage' && <WastageTab />}
    </div>
  );
}
