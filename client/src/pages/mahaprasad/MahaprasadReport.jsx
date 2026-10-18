import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart2, RefreshCw, CalendarDays, Users, AlertTriangle, BarChart3, MessageCircle } from 'lucide-react';
import { getReport, getMonthlyReport, getStaffReport, getWastageReport, getMahaprasadWhatsApp } from '../../api/mahaprasad.api.js';
import toast from 'react-hot-toast';
import PageHeader from '../../components/ui/PageHeader.jsx';
import MobileCard from '../../components/ui/MobileCard.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { exportRows as exportTable } from '../../utils/exportToPdf.js';
import ExportButtons from '../../components/ui/ExportButtons.jsx';
import { shareText } from '../../utils/fileSaver.js';
import { isNative } from '../../utils/platform.js';
import { localDateStr } from '../../utils/formatters.js';
import { useT } from '../../i18n/index.jsx';

// Header action rows: phones get equal-width, thumb-sized buttons on one line.
const ACTION_ROW = 'flex flex-wrap justify-end gap-2 max-sm:[&>*]:flex-1';
const ACTION_BTN = 'btn btn-ghost border text-sm flex items-center gap-1.5 max-sm:px-2 max-sm:py-2.5';

// ── Shared helpers ─────────────────────────────────────────────────────────────

const fmt    = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' }) : '—';
// A full date from the server (Free Seva rows), not a YYYY-MM-DD day
const fmtWhen = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const pct    = (n, d) => d > 0 ? `${Math.round((n / d) * 100)}%` : '—';
const fmtRs  = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
function isoDate(d) { return localDateStr(d); }

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
  const t = useT();
  return (
    <div className="card p-3 sm:p-4 space-y-3">
      {shortcuts && (
        <div className="flex flex-wrap gap-2">
          {SHORTCUTS.map(({ label, range }) => (
            <button key={label} onClick={() => { const r = range(); setFrom(r.from); setTo(r.to); onApply(r); setActive(label); }}
              className={`px-3 py-1 max-sm:py-2 rounded-full text-xs font-medium border transition-all ${active === label ? 'bg-primary-600 text-white border-primary-600' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
              {t(label)}
            </button>
          ))}
        </div>
      )}
      {/* Phones: From | To side by side, Generate full width underneath */}
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <div className="min-w-0">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('From')}</label>
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setActive?.(''); }} className="input text-sm" />
        </div>
        <div className="min-w-0">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('To')}</label>
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setActive?.(''); }} className="input text-sm" />
        </div>
        <button onClick={() => onApply({ from, to })} className="btn-primary text-sm col-span-2">{t('Generate')}</button>
      </div>
    </div>
  );
}

function EmptyState() {
  const t = useT();
  return (
    <div className="card p-10 text-center">
      <BarChart2 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
      <p className="text-gray-500 font-medium">{t('No data for selected period')}</p>
    </div>
  );
}

// ── Tab 1: Daily ──────────────────────────────────────────────────────────────

function DailyTab() {
  const t = useT();
  const def = (() => { const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 29); return { from: isoDate(from), to: isoDate(to) }; })();
  const [from,       setFrom]      = useState(def.from);
  const [to,         setTo]        = useState(def.to);
  const [params,     setParams]    = useState(def);
  const [active,     setActive]    = useState('');
  const [waLoading,  setWaLoading] = useState(false);
  const [waCopied,   setWaCopied]  = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['mahaprasad-report', params],
    queryFn:  () => getReport(params),
    staleTime: 60 * 1000,
  });

  const res           = data?.data?.data || {};
  const rows          = res.rows         || [];
  const totals        = res.totals       || {};
  const pricePerPlate = res.pricePerPlate || 0;

  const handleExport = (format) => {
    exportTable(format, 
      rows.map((r) => ({ Date: r._id, 'Total Issued': r.total, Redeemed: r.redeemed, 'Redemption %': pct(r.redeemed, r.total), Pending: r.total - r.redeemed, Paid: r.paid, Free: r.free, 'Collected (₹)': r.collected })),
      `Mahaprasad-Daily-${params.from}-to-${params.to}`, 'Daily Report'
    );
  };

  const handleWhatsApp = async () => {
    const shareDate = from === to ? from : isoDate(new Date());
    setWaLoading(true);
    try {
      const res  = await getMahaprasadWhatsApp(shareDate);
      const text = res?.data?.data?.text;
      if (!text) throw new Error('No data');
      // Mobile apps: hand the text to the share sheet (WhatsApp is listed there).
      if (isNative) { await shareText(text); return; }
      await navigator.clipboard.writeText(text);
      setWaCopied(true);
      toast.success(t('Copied — paste in any WhatsApp chat'));
      setTimeout(() => setWaCopied(false), 3000);
    } catch {
      toast.error(t('Failed to generate WhatsApp summary'));
    } finally {
      setWaLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className={ACTION_ROW}>
        <button onClick={refetch} disabled={isFetching} className={ACTION_BTN}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> {t('Refresh')}
        </button>
        <button onClick={handleWhatsApp} disabled={waLoading}
          className={`${ACTION_BTN} disabled:opacity-50 transition-colors ${
            waCopied
              ? 'text-green-700 border-green-400 bg-green-50'
              : 'text-green-700 border-green-200 hover:bg-green-50'
          }`}>
          <MessageCircle className="h-4 w-4 shrink-0" />
          {waLoading ? t('Loading…') : waCopied ? t('Copied!') : (
            <>
              <span className="sm:hidden">{isNative ? t('Share') : 'WhatsApp'}</span>
              <span className="hidden sm:inline">
                {isNative
                  ? (from === to ? t('Share Summary') : t("Share Today's Summary"))
                  : (from === to ? t('Copy for WhatsApp') : t("Copy Today's Summary"))}
              </span>
            </>
          )}
        </button>
        {rows.length > 0 && (
          <ExportButtons onExport={handleExport} className={ACTION_BTN} />
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
              <p className="text-xs text-gray-500">{t(label)}</p>
              <p className={`text-xl font-black ${color.split(' ')[1]}`}>{value ?? 0}</p>
            </div>
          ))}
        </div>
      )}

      {!isLoading && res.occasionBreakdown?.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b bg-purple-50">
            <p className="text-sm font-semibold text-purple-800">{t('Free Coupons by Occasion')}</p>
          </div>
          {/* Phones: compact list */}
          <div className="divide-y divide-gray-50 md:hidden">
            {res.occasionBreakdown.map((o) => (
              <div key={o._id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 font-medium text-gray-800 break-words">{o._id}</span>
                <span className="shrink-0 text-right text-xs text-gray-500">
                  <span className="font-bold text-purple-700 text-sm">{o.count}</span> {t('issued')}
                  <span className="block"><span className="text-green-700">{o.redeemed}</span> {t('redeemed')} · {pct(o.redeemed, o.count)}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full">
              <thead><tr className="bg-gray-50 border-b">
                <th className="table-th">{t('Occasion')}</th>
                <th className="table-th text-right">{t('Issued')}</th>
                <th className="table-th text-right">{t('Redeemed')}</th>
                <th className="table-th text-right">{t('Redemption %')}</th>
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

      {/* Free Seva, one row per issue: who received it and for what (the latest 500 in the period) */}
      {!isLoading && res.freeSeva?.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b bg-purple-50">
            <p className="text-sm font-semibold text-purple-800">{t('Free Seva — who received it')}</p>
            <button type="button" className="text-xs font-semibold text-purple-800 hover:underline"
              onClick={() => exportTable('excel', res.freeSeva.map((f) => ({
                Date: fmtWhen(f.date), Name: f.name || '', Mobile: f.mobile || '', Occasion: f.occasion || '',
                Persons: f.persons, Served: f.redeemed, 'Issued By': f.issuedBy || '',
              })), `Mahaprasad-Free-Seva-${params.from}-to-${params.to}`, 'Free Seva')}>
              {t('Export')}
            </button>
          </div>
          <div className="divide-y divide-gray-50 md:hidden">
            {res.freeSeva.map((f) => (
              <div key={f.batchId} className="px-4 py-2.5 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 font-semibold text-gray-900 break-words">{f.name || <span className="text-gray-400">{t('No name')}</span>}</span>
                  <span className="shrink-0 font-bold text-purple-700">{t(f.persons === 1 ? '{n} person' : '{n} persons', { n: f.persons })}</span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">{[fmtWhen(f.date), f.occasion, f.mobile, f.issuedBy].filter(Boolean).join(' · ')}</p>
              </div>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full">
              <thead><tr className="bg-gray-50 border-b">
                <th className="table-th">{t('Date')}</th>
                <th className="table-th">{t('Name')}</th>
                <th className="table-th">{t('Mobile')}</th>
                <th className="table-th">{t('Occasion')}</th>
                <th className="table-th text-right">{t('Persons')}</th>
                <th className="table-th text-right">{t('Served')}</th>
                <th className="table-th">{t('Issued By')}</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {res.freeSeva.map((f) => (
                  <tr key={f.batchId} className="hover:bg-gray-50 text-sm">
                    <td className="table-td text-gray-500 text-xs">{fmtWhen(f.date)}</td>
                    <td className="table-td font-medium text-gray-900">{f.name || <span className="text-gray-400">—</span>}</td>
                    <td className="table-td text-gray-600 text-xs tabular-nums">{f.mobile || '—'}</td>
                    <td className="table-td text-gray-700">{f.occasion || <span className="text-gray-400">—</span>}</td>
                    <td className="table-td text-right font-bold text-purple-700">{f.persons}</td>
                    <td className="table-td text-right text-green-700">{f.redeemed}</td>
                    <td className="table-td text-gray-500 text-xs">{f.issuedBy || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isLoading ? <PageLoader /> : rows.length === 0 ? <EmptyState /> : (
        <>
        {/* Phones: a card per day (period totals are in the summary tiles above) */}
        <div className="space-y-2.5 md:hidden">
          {rows.map((r) => {
            const pending = r.total - r.redeemed;
            return (
              <MobileCard
                key={r._id}
                title={fmt(r._id)}
                aside={<span className="font-semibold text-primary-700">{fmtRs(r.collected)}</span>}
                fields={[
                  { label: t('Issued'),   value: <span className="font-bold text-gray-800">{r.total}</span> },
                  { label: t('Redeemed'), value: <span className="text-green-700">{r.redeemed} <span className="text-gray-400">({pct(r.redeemed, r.total)})</span></span> },
                  { label: t('Pending'),  value: <span className={pending > 0 ? 'text-yellow-600' : 'text-gray-400'}>{pending}</span> },
                  { label: t('Paid / Free'), value: <><span className="text-blue-700">{r.paid}</span> / <span className="text-purple-700">{r.free}</span></> },
                ]}
              />
            );
          })}
        </div>
        <div className="hidden md:block card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead><tr className="bg-gray-50 border-b">
                <th className="table-th">{t('Date')}</th>
                <th className="table-th text-right">{t('Issued')}</th>
                <th className="table-th text-right">{t('Redeemed')}</th>
                <th className="table-th text-right">{t('Redemption %')}</th>
                <th className="table-th text-right">{t('Pending')}</th>
                <th className="table-th text-right">{t('Paid|coupon')}</th>
                <th className="table-th text-right">{t('Free')}</th>
                <th className="table-th text-right">{t('Collected')}</th>
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
                  <td className="table-td text-gray-700">{t('Totals')}</td>
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
        </>
      )}
    </div>
  );
}

// ── Tab 2: Monthly ────────────────────────────────────────────────────────────

function MonthlyTab() {
  const t = useT();
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

  const handleExport = (format) => {
    exportTable(format, 
      rows.map((r) => ({ Month: fmtMonth(r._id), 'Total Issued': r.total, Redeemed: r.redeemed, 'Redemption %': pct(r.redeemed, r.total), Pending: r.total - r.redeemed, Paid: r.paid, Free: r.free, 'Collected (₹)': r.collected })),
      `Mahaprasad-Monthly-${params.from}-to-${params.to}`, 'Monthly Report'
    );
  };

  return (
    <div className="space-y-4">
      <div className={ACTION_ROW}>
        <button onClick={refetch} disabled={isFetching} className={ACTION_BTN}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> {t('Refresh')}
        </button>
        {rows.length > 0 && (
          <ExportButtons onExport={handleExport} className={ACTION_BTN} />
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
              <p className="text-xs text-gray-500">{t(label)}</p>
              <p className={`text-xl font-black ${color.split(' ')[1]}`}>{value ?? 0}</p>
            </div>
          ))}
        </div>
      )}

      {isLoading ? <PageLoader /> : rows.length === 0 ? <EmptyState /> : (
        <>
        <div className="space-y-2.5 md:hidden">
          {rows.map((r) => {
            const pending = r.total - r.redeemed;
            return (
              <MobileCard
                key={r._id}
                title={fmtMonth(r._id)}
                aside={<span className="font-semibold text-primary-700">{fmtRs(r.collected)}</span>}
                fields={[
                  {
                    label: t('Volume'), full: true,
                    value: (
                      <div className="mt-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-400 rounded-full" style={{ width: `${Math.round((r.total / maxTotal) * 100)}%` }} />
                      </div>
                    ),
                  },
                  { label: t('Issued'),   value: <span className="font-bold text-gray-800">{r.total}</span> },
                  { label: t('Redeemed'), value: <span className="text-green-700">{r.redeemed} <span className="text-gray-400">({pct(r.redeemed, r.total)})</span></span> },
                  { label: t('Pending'),  value: <span className={pending > 0 ? 'text-yellow-600' : 'text-gray-400'}>{pending}</span> },
                  { label: t('Paid / Free'), value: <><span className="text-blue-700">{r.paid}</span> / <span className="text-purple-700">{r.free}</span></> },
                ]}
              />
            );
          })}
        </div>
        <div className="hidden md:block card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead><tr className="bg-gray-50 border-b">
                <th className="table-th">{t('Month')}</th>
                <th className="table-th">{t('Volume')}</th>
                <th className="table-th text-right">{t('Issued')}</th>
                <th className="table-th text-right">{t('Redeemed')}</th>
                <th className="table-th text-right">{t('Redemption %')}</th>
                <th className="table-th text-right">{t('Pending')}</th>
                <th className="table-th text-right">{t('Paid|coupon')}</th>
                <th className="table-th text-right">{t('Free')}</th>
                <th className="table-th text-right">{t('Collected')}</th>
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
                  <td className="table-td text-gray-700">{t('Totals')}</td>
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
        </>
      )}
    </div>
  );
}

// ── Tab 3: Staff ──────────────────────────────────────────────────────────────

function StaffTab() {
  const t = useT();
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
  // Persons on paid coupons (a group of 5 is 5, like Issued and Free Seva); the money split by how it was paid
  const SUMS = ['issued', 'paid', 'freeSeva', 'redeemed', 'cash', 'upi', 'online', 'collected'];
  const totals = rows.reduce((a, r) => Object.fromEntries(SUMS.map((k) => [k, a[k] + (r[k] || 0)])), Object.fromEntries(SUMS.map((k) => [k, 0])));

  const handleExport = (format) => {
    exportTable(format,
      rows.map((r) => ({
        Staff: r.name, Issued: r.issued, 'Paid Coupons': r.paid || 0, 'Free Seva Issued': r.freeSeva, Redeemed: r.redeemed,
        'Cash (₹)': r.cash || 0, 'UPI (₹)': r.upi || 0, 'Online (₹)': r.online || 0, 'Collected (₹)': r.collected,
      })),
      `Mahaprasad-Staff-${params.from}-to-${params.to}`, 'Staff Activity'
    );
  };

  return (
    <div className="space-y-4">
      <div className={ACTION_ROW}>
        <button onClick={refetch} disabled={isFetching} className={ACTION_BTN}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> {t('Refresh')}
        </button>
        {rows.length > 0 && (
          <ExportButtons onExport={handleExport} className={ACTION_BTN} />
        )}
      </div>

      <DateRangeFilter from={from} to={to} setFrom={setFrom} setTo={setTo} active={active} setActive={setActive}
        onApply={(r) => setParams(r)} />

      {isLoading ? <PageLoader /> : rows.length === 0 ? <EmptyState /> : (
        <>
        <div className="space-y-2.5 md:hidden">
          {[...rows, { userId: '__totals', name: t('Totals'), ...totals }].map((r) => (
            <MobileCard
              key={r.userId}
              className={r.userId === '__totals' ? 'bg-gray-50 border-gray-200' : ''}
              title={<span className={r.userId === '__totals' ? 'font-bold' : ''}>{r.name}</span>}
              aside={<span className="font-semibold text-primary-700">{fmtRs(r.collected)}</span>}
              fields={[
                { label: t('Issued'),    value: <span className="font-bold text-orange-700">{r.issued}</span> },
                { label: t('Paid Coupons'), value: <span className="text-blue-700">{r.paid || 0}</span> },
                { label: t('Free Seva'), value: <span className="text-purple-700">{r.freeSeva}</span> },
                { label: t('Redeemed'),  value: <span className="text-green-700">{r.redeemed}</span> },
                { label: t('Cash'),      value: fmtRs(r.cash) },
                { label: t('UPI'),       value: fmtRs(r.upi) },
                (r.online > 0) && { label: t('Online'), value: fmtRs(r.online) },
              ]}
            />
          ))}
        </div>
        <div className="hidden md:block card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead><tr className="bg-gray-50 border-b">
                <th className="table-th">{t('Staff')}</th>
                <th className="table-th text-right">{t('Coupons Issued')}</th>
                <th className="table-th text-right">{t('Paid Coupons')}</th>
                <th className="table-th text-right">{t('Free Seva Issued')}</th>
                <th className="table-th text-right">{t('Coupons Redeemed')}</th>
                <th className="table-th text-right">{t('Cash')}</th>
                <th className="table-th text-right">{t('UPI')}</th>
                <th className="table-th text-right">{t('Online')}</th>
                <th className="table-th text-right">{t('Amount Collected')}</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r) => (
                  <tr key={r.userId} className="hover:bg-gray-50 text-sm">
                    <td className="table-td">
                      <span className="font-medium text-gray-900">{r.name}</span>
                    </td>
                    <td className="table-td text-right font-bold text-orange-700">{r.issued}</td>
                    <td className="table-td text-right text-blue-700">{r.paid || 0}</td>
                    <td className="table-td text-right text-purple-700">{r.freeSeva}</td>
                    <td className="table-td text-right text-green-700">{r.redeemed}</td>
                    <td className="table-td text-right text-gray-700 tabular-nums">{fmtRs(r.cash)}</td>
                    <td className="table-td text-right text-gray-700 tabular-nums">{fmtRs(r.upi)}</td>
                    <td className="table-td text-right text-gray-700 tabular-nums">{fmtRs(r.online)}</td>
                    <td className="table-td text-right font-semibold text-primary-700">{fmtRs(r.collected)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold border-t-2 border-gray-200">
                  <td className="table-td text-gray-700">{t('Totals')}</td>
                  <td className="table-td text-right text-orange-700">{totals.issued}</td>
                  <td className="table-td text-right text-blue-700">{totals.paid}</td>
                  <td className="table-td text-right text-purple-700">{totals.freeSeva}</td>
                  <td className="table-td text-right text-green-700">{totals.redeemed}</td>
                  <td className="table-td text-right text-gray-700 tabular-nums">{fmtRs(totals.cash)}</td>
                  <td className="table-td text-right text-gray-700 tabular-nums">{fmtRs(totals.upi)}</td>
                  <td className="table-td text-right text-gray-700 tabular-nums">{fmtRs(totals.online)}</td>
                  <td className="table-td text-right text-primary-700">{fmtRs(totals.collected)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}
    </div>
  );
}

// ── Tab 4: Wastage ────────────────────────────────────────────────────────────

function WastageTab() {
  const t = useT();
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

  const handleExport = (format) => {
    exportTable(format, 
      rows.map((r) => ({ Date: r._id, 'Expired (Total)': r.count, 'Paid (Expired)': r.paid, 'Free (Expired)': r.free, 'Amount Lost (₹)': r.wasted })),
      `Mahaprasad-Wastage`, 'Wastage Report'
    );
  };

  return (
    <div className="space-y-4">
      <div className={ACTION_ROW}>
        <button onClick={refetch} disabled={isFetching} className={ACTION_BTN}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> {t('Refresh')}
        </button>
        {rows.length > 0 && (
          <ExportButtons onExport={handleExport} className={ACTION_BTN} />
        )}
      </div>

      {/* Filter — only from date, upper bound is always (today - validity) */}
      <div className="card p-3 sm:p-4 space-y-2">
        <div className="flex flex-wrap items-end gap-3">
          <div className="max-sm:w-full">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('From date (optional)')}</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input text-sm" />
          </div>
          <button onClick={() => setParams(from ? { from } : {})} className="btn-primary text-sm max-sm:flex-1">{t('Refresh')}</button>
          {from && <button onClick={() => { setFrom(''); setParams({}); }} className="btn-secondary text-sm max-sm:flex-1">{t('Clear')}</button>}
        </div>
        {validityDays !== undefined && (
          <p className="text-xs text-gray-400">
            {validityDays === 0
              ? t('Coupon expiry is disabled — no coupons can expire')
              : t(validityDays > 1 ? 'Showing coupons issued more than {n} days ago that were never redeemed' : 'Showing coupons issued more than {n} day ago that were never redeemed', { n: validityDays })}
          </p>
        )}
      </div>

      {validityDays === 0 ? (
        <div className="card p-8 text-center">
          <AlertTriangle className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">{t('Coupon expiry is disabled')}</p>
          <p className="text-sm text-gray-400 mt-1">{t('Set "Coupon Validity (days)" in Settings to a value > 0 to track expiry.')}</p>
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
                  <p className="text-xs text-gray-500">{t(label)}</p>
                  <p className={`text-xl font-black ${color.split(' ')[1]}`}>{value ?? 0}</p>
                </div>
              ))}
            </div>
          )}

          {isLoading ? <PageLoader /> : rows.length === 0 ? (
            <div className="card p-8 text-center">
              <AlertTriangle className="h-10 w-10 text-green-300 mx-auto mb-3" />
              <p className="text-green-600 font-medium">{t('No expired coupons found')}</p>
              <p className="text-sm text-gray-400 mt-1">{t('All issued coupons have been redeemed.')}</p>
            </div>
          ) : (
            <>
            <div className="space-y-2.5 md:hidden">
              {rows.map((r) => (
                <MobileCard
                  key={r._id}
                  title={fmt(r._id)}
                  aside={<span className="font-semibold text-gray-700">{r.wasted > 0 ? fmtRs(r.wasted) : '—'}</span>}
                  fields={[
                    { label: t('Expired'), value: <span className="font-bold text-red-700">{r.count}</span> },
                    { label: t('Paid / Free'), value: <><span className="text-orange-700">{r.paid}</span> / <span className="text-purple-700">{r.free}</span></> },
                  ]}
                />
              ))}
            </div>
            <div className="hidden md:block card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead><tr className="bg-gray-50 border-b">
                    <th className="table-th">{t('Date')}</th>
                    <th className="table-th text-right">{t('Expired (Total)')}</th>
                    <th className="table-th text-right">{t('Paid|coupon')}</th>
                    <th className="table-th text-right">{t('Free')}</th>
                    <th className="table-th text-right">{t('Amount Lost')}</th>
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
                      <td className="table-td text-gray-700">{t('Totals')}</td>
                      <td className="table-td text-right text-red-700">{totals.count}</td>
                      <td className="table-td text-right text-orange-700">{totals.paid}</td>
                      <td className="table-td text-right text-purple-700">{totals.free}</td>
                      <td className="table-td text-right text-gray-700">{fmtRs(totals.wasted)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            </>
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
  const t = useT();
  const [tab, setTab] = useState('daily');

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mahaprasad Reports"
        subtitle="Coupon issuance, collection, staff activity, and wastage analysis"
        breadcrumbs={[{ label: 'Mahaprasad', to: '/mahaprasad' }, { label: 'Report' }]}
      />

      {/* Tab bar — phones: four equal segments with the icon above the label */}
      <div className="card p-1 grid grid-cols-4 gap-1 sm:flex sm:flex-wrap">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all max-sm:flex-col max-sm:gap-1 max-sm:px-1 max-sm:text-xs ${
              tab === key ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'
            }`}>
            <Icon className="h-4 w-4" /> {t(label)}
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
