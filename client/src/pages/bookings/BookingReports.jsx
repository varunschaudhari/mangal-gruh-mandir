import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  CalendarCheck, IndianRupee, Banknote, Smartphone, CreditCard, Users, Ban, Globe, FileText, FileSpreadsheet,
  BarChart3, CalendarDays, CalendarRange, Sparkles, Wallet, UserRound, ListOrdered,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Spinner, { PageLoader } from '../../components/ui/Spinner.jsx';
import { exportBookingsExcel, getBookingOptions, getBookingSummary, getBookingSummaryPdf } from '../../api/booking.api.js';
import { saveFile } from '../../utils/fileSaver.js';
import { localDateStr } from '../../utils/formatters.js';
import { useIsMobile } from '../../hooks/useMediaQuery.js';
import haptics from '../../utils/haptics.js';
import { useLanguage, useT } from '../../i18n/index.jsx';
import {
  MODES, MODE_LABEL, addDays, fmtDay, fmtRange, nBookings, parseDay, presetRange, rupees, rupeesShort, sevaLabel,
} from '../../components/booking/registerUtils.js';

// Collections from abhishek / puja bookings, by the day the money was received:
// tiles, date / month / year charts, and the cash each counter clerk has to hand over.

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'month', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'fy', label: 'This financial year' },
  { key: 'last12', label: 'Last 12 months' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom' },
];
const MODE_COLOR = { cash: '#16a34a', upi: '#7c3aed', card: '#2563eb', online: '#ea580c' };
const SEVA_COLORS = ['#ea580c', '#f59e0b', '#16a34a', '#2563eb', '#7c3aed', '#db2777', '#0891b2', '#65a30d'];

async function blobErrorMessage(err) {
  try { return JSON.parse(await err.response.data.text()).message; } catch { return null; }
}

const monthLabel = (ym, long) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1)
  .toLocaleDateString('en-IN', long ? { month: 'long', year: 'numeric' } : { month: 'short', year: '2-digit' });
const nextMonth = (ym) => { const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 1); return localDateStr(d).slice(0, 7); };

/** Days with no bookings still get a (zero) bar, so the chart reads as a timeline. */
function fillDays(rows, from, to, today) {
  const start = from || rows[0]?.date;
  const end = to && to < today ? to : today;
  if (!start || start > end || (parseDay(end) - parseDay(start)) / 864e5 > 400) return rows;
  const byDay = new Map(rows.map((r) => [r.date, r]));
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(byDay.get(d) || { date: d, count: 0, amount: 0 });
  return out;
}
function fillMonths(rows, from, to, today) {
  const start = from ? from.slice(0, 7) : rows[0]?.month;
  const end = (to && to < today ? to : today).slice(0, 7);
  if (!start || start > end) return rows;
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  const out = [];
  for (let m = start; m <= end && out.length < 240; m = nextMonth(m)) out.push(byMonth.get(m) || { month: m, count: 0, amount: 0 });
  return out;
}

const Tile = ({ label, value, sub, icon: Icon, color, bg, border }) => (
  <div className={`card min-w-0 border-l-4 p-2.5 sm:p-4 ${border}`}>
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-xs text-gray-500">{label}</p>
        <p className="mt-0.5 whitespace-nowrap text-lg font-bold leading-6 text-gray-800 sm:text-2xl">{value}</p>
        {sub && <p className="truncate text-[11px] text-gray-500">{sub}</p>}
      </div>
      <div className={`shrink-0 rounded-full p-1.5 max-sm:hidden sm:p-3 ${bg}`}>
        <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${color}`} />
      </div>
    </div>
  </div>
);

function ChartTooltip({ active, payload, label, labelFormat }) {
  const t = useT();
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-gray-700">{labelFormat ? labelFormat(label) : label}</p>
      <p className="text-gray-600">{t('Bookings')}: <span className="font-medium text-gray-900">{row.count.toLocaleString('en-IN')}</span></p>
      <p className="text-gray-600">{t('Amount')}: <span className="font-medium text-gray-900">{rupees(row.amount)}</span></p>
    </div>
  );
}

function ChartCard({ title, icon: Icon, children, empty, className = '' }) {
  const t = useT();
  return (
    <div className={`card min-w-0 p-3 sm:p-4 ${className}`}>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary-600" />
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      </div>
      {empty ? <div className="flex h-40 items-center justify-center text-sm text-gray-400">{t('No bookings in this period')}</div> : children}
    </div>
  );
}

/** Vertical bars: date-wise, month-wise, year-wise. */
function Bars({ data, xKey, metric, tickFormat, labelFormat, height, color = '#ea580c' }) {
  const isMobile = useIsMobile();
  return (
    <ResponsiveContainer width="100%" height={height || (isMobile ? 190 : 230)}>
      <BarChart data={data} maxBarSize={36} margin={isMobile ? { top: 5, right: 4, bottom: 0, left: -8 } : { top: 5, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: isMobile ? 10 : 11 }} axisLine={false} tickLine={false}
          tickFormatter={tickFormat} interval="preserveStartEnd" minTickGap={isMobile ? 8 : 14} />
        <YAxis tick={{ fontSize: isMobile ? 10 : 11 }} axisLine={false} tickLine={false} width={isMobile ? 40 : 52} allowDecimals={false}
          tickFormatter={metric === 'amount' ? rupeesShort : (v) => v.toLocaleString('en-IN')} />
        <Tooltip content={<ChartTooltip labelFormat={labelFormat} />} cursor={{ fill: '#fff7ed' }} />
        <Bar dataKey={metric} fill={color} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const Share = ({ value, total, color = 'bg-primary-500' }) => {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} /></div>
      <span className="w-9 text-right text-xs tabular-nums text-gray-500">{pct}%</span>
    </div>
  );
};

export default function BookingReports() {
  const t = useT();
  const { lang } = useLanguage();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const today = localDateStr();

  const [preset, setPreset] = useState('month');
  const [custom, setCustom] = useState(() => presetRange('month'));
  const [sevaType, setSevaType] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [metric, setMetric] = useState('amount');
  const [downloading, setDownloading] = useState(null);

  const range = preset === 'custom' ? custom : presetRange(preset);
  const params = useMemo(() => ({
    from: range.from || undefined,
    to: range.to || undefined,
    sevaType: sevaType || undefined,
    paymentMode: paymentMode || undefined,
    createdBy: createdBy || undefined,
  }), [range.from, range.to, sevaType, paymentMode, createdBy]);

  const { data: options } = useQuery({
    queryKey: ['booking-options'], queryFn: getBookingOptions, select: (r) => r.data.data, staleTime: 5 * 60 * 1000,
  });
  const sevaById = useMemo(() => new Map((options?.allSevaTypes || options?.sevaTypes || []).map((s) => [String(s._id), s])), [options]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['booking-summary', params],
    queryFn: () => getBookingSummary(params),
    select: (r) => r.data.data,
    placeholderData: keepPreviousData,
  });

  const daily = useMemo(() => fillDays(data?.daily || [], range.from, range.to, today), [data, range.from, range.to, today]);
  const monthly = useMemo(() => fillMonths(data?.monthly || [], range.from, range.to, today), [data, range.from, range.to, today]);
  const yearly = data?.yearly || [];
  const bySeva = useMemo(() => (data?.bySeva || []).map((r) => ({ ...r, label: sevaLabel(lang, sevaById, r.sevaType, r.name) })), [data, lang, sevaById]);

  const totals = data?.totals || { count: 0, amount: 0, people: 0 };
  const byMode = data?.byMode || {};
  const voided = data?.voided || { count: 0, amount: 0 };
  const byStaff = data?.byStaff || [];
  const staffTotals = byStaff.reduce((s, r) => ({
    count: s.count + r.count, cash: s.cash + r.cash, upi: s.upi + r.upi, card: s.card + r.card, amount: s.amount + r.amount,
  }), { count: 0, cash: 0, upi: 0, card: 0, amount: 0 });
  const empty = !isLoading && totals.count === 0;

  const span = range.from ? `${range.from}${range.to && range.to !== range.from ? `-to-${range.to}` : ''}` : 'all-time';
  const rangeText = preset === 'all' ? t('All time') : fmtRange(range.from, range.to);

  const download = async (kind) => {
    setDownloading(kind);
    try {
      if (kind === 'pdf') {
        const res = await getBookingSummaryPdf(params);
        await saveFile(res.data, `booking-summary-${span}.pdf`);
      } else {
        const res = await exportBookingsExcel({ ...params, status: 'all' });
        await saveFile(res.data, `bookings-${span}.xlsx`);
      }
    } catch (e) {
      toast.error((await blobErrorMessage(e)) || t('Export failed'));
    } finally {
      setDownloading(null);
    }
  };

  // Drill down into the register with the same filters.
  const registerLink = (extra = {}) => {
    const qs = new URLSearchParams(Object.entries({
      range: preset === 'all' ? 'all' : 'custom',
      ...(preset === 'all' ? {} : { from: range.from, to: range.to }),
      sevaType, paymentMode, createdBy, ...extra,
    }).filter(([, v]) => v));
    return `/bookings?${qs}`;
  };

  const dayTick = (d) => (isMobile ? String(Number(d.slice(8, 10))) : fmtDay(d, { day: '2-digit', month: 'short' }));
  const dayLabel = (d) => fmtDay(d, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const modeRows = [...MODES.filter((m) => byMode[m]), ...Object.keys(byMode).filter((m) => !MODES.includes(m))]
    .map((m) => ({ mode: m, ...byMode[m] }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Booking Reports"
        subtitle={rangeText}
        breadcrumbs={[{ label: 'Bookings' }, { label: 'Booking Reports' }]}
        actions={(
          <>
            <button onClick={() => download('pdf')} disabled={!!downloading || empty} className="btn-secondary whitespace-nowrap">
              {downloading === 'pdf' ? <Spinner size="sm" /> : <FileText className="h-4 w-4 text-red-500" />} {t('Summary PDF')}
            </button>
            <button onClick={() => download('excel')} disabled={!!downloading || empty} className="btn-secondary whitespace-nowrap">
              {downloading === 'excel' ? <Spinner size="sm" /> : <FileSpreadsheet className="h-4 w-4 text-green-600" />} Excel
            </button>
          </>
        )}
      />

      {/* ── Period and filters ─────────────────────────────────────────────── */}
      <div className="card space-y-3 p-3 sm:p-4">
        <div className="-mx-3 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap">
            {PRESETS.map((p) => (
              <button key={p.key}
                onClick={() => {
                  haptics.select();
                  if (p.key === 'custom' && preset !== 'custom' && range.from) setCustom({ from: range.from, to: range.to > today ? today : range.to });
                  setPreset(p.key);
                }}
                className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors max-sm:px-3.5 max-sm:py-2 max-sm:text-sm ${
                  preset === p.key ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400'}`}>
                {t(p.label)}
              </button>
            ))}
          </div>
        </div>
        {preset === 'custom' && (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
            {[['from', 'From'], ['to', 'To']].map(([k, label]) => (
              <label key={k} className="block min-w-0">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{t(label)}</span>
                <input type="date" value={custom[k]} max={today} onChange={(e) => setCustom((c) => ({ ...c, [k]: e.target.value }))} className="input" />
              </label>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label className="col-span-2 block min-w-0 sm:col-span-1">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Seva')}</span>
            <select value={sevaType} onChange={(e) => setSevaType(e.target.value)} className="input">
              <option value="">{t('All sevas')}</option>
              {(options?.allSevaTypes || options?.sevaTypes || []).map((s) => <option key={s._id} value={s._id}>{(lang === 'mr' && s.nameMr) || s.name}</option>)}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Payment Mode')}</span>
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className="input">
              <option value="">{t('All modes')}</option>
              {MODES.map((m) => <option key={m} value={m}>{t(MODE_LABEL[m])}</option>)}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Booked by')}</span>
            <select value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} className="input">
              <option value="">{t('All staff')}</option>
              {(options?.staff || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </label>
        </div>
      </div>

      {isLoading ? <PageLoader /> : (
        <div className={`space-y-4 transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          {/* ── Tiles ─────────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
            <Tile label={t('Bookings')} value={totals.count.toLocaleString('en-IN')} icon={CalendarCheck} color="text-primary-600" bg="bg-primary-50" border="border-l-primary-500" />
            <Tile label={t('Amount')} value={rupees(totals.amount)} icon={IndianRupee} color="text-green-600" bg="bg-green-50" border="border-l-green-500" />
            <Tile label={t('People')} value={totals.people.toLocaleString('en-IN')} icon={Users} color="text-amber-600" bg="bg-amber-50" border="border-l-amber-500" />
            <Tile label={t('Voided')} value={voided.count.toLocaleString('en-IN')} sub={voided.count ? rupees(voided.amount) : t('None')} icon={Ban} color="text-red-600" bg="bg-red-50" border="border-l-red-500" />
            <Tile label={t('Cash')} value={rupees(byMode.cash?.amount)} sub={nBookings(t, byMode.cash?.count || 0)} icon={Banknote} color="text-emerald-600" bg="bg-emerald-50" border="border-l-emerald-500" />
            <Tile label="UPI" value={rupees(byMode.upi?.amount)} sub={nBookings(t, byMode.upi?.count || 0)} icon={Smartphone} color="text-purple-600" bg="bg-purple-50" border="border-l-purple-500" />
            <Tile label={t('Card')} value={rupees(byMode.card?.amount)} sub={nBookings(t, byMode.card?.count || 0)} icon={CreditCard} color="text-blue-600" bg="bg-blue-50" border="border-l-blue-500" />
            {byMode.online && (
              <Tile label={t('Online')} value={rupees(byMode.online.amount)} sub={nBookings(t, byMode.online.count)} icon={Globe} color="text-orange-600" bg="bg-orange-50" border="border-l-orange-500" />
            )}
          </div>

          {empty ? (
            <div className="card p-10 text-center">
              <BarChart3 className="mx-auto mb-3 h-10 w-10 text-gray-300" />
              <p className="font-medium text-gray-500">{t('No bookings in this period')}</p>
            </div>
          ) : (
            <>
              {/* ── Charts ──────────────────────────────────────────────────── */}
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-700">{t('Charts')}</h2>
                <div role="radiogroup" aria-label={t('Show')} className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs">
                  {[['amount', 'Amount'], ['count', 'Bookings']].map(([k, label]) => (
                    <button key={k} role="radio" aria-checked={metric === k} onClick={() => { haptics.select(); setMetric(k); }}
                      className={`rounded-md px-3 py-1.5 font-medium max-sm:py-2 ${metric === k ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500'}`}>
                      {t(label)}
                    </button>
                  ))}
                </div>
              </div>

              <ChartCard title={t('Date-wise')} icon={CalendarDays} empty={!daily.length}>
                <Bars data={daily} xKey="date" metric={metric} tickFormat={dayTick} labelFormat={dayLabel} />
              </ChartCard>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ChartCard title={t('Month-wise')} icon={CalendarRange} empty={!monthly.length}>
                  <Bars data={monthly} xKey="month" metric={metric} color="#f59e0b"
                    tickFormat={(m) => monthLabel(m)} labelFormat={(m) => monthLabel(m, true)} />
                </ChartCard>
                <ChartCard title={t('Year-wise')} icon={BarChart3} empty={!yearly.length}>
                  <Bars data={yearly} xKey="year" metric={metric} color="#16a34a" />
                </ChartCard>
              </div>

              <ChartCard title={t('By seva')} icon={Sparkles} empty={!bySeva.length}>
                <ResponsiveContainer width="100%" height={Math.max(120, bySeva.length * (isMobile ? 34 : 38) + 30)}>
                  <BarChart data={bySeva} layout="vertical" margin={{ top: 0, right: isMobile ? 8 : 16, bottom: 0, left: 0 }} maxBarSize={22}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: isMobile ? 10 : 11 }} axisLine={false} tickLine={false} allowDecimals={false}
                      tickFormatter={metric === 'amount' ? rupeesShort : (v) => v.toLocaleString('en-IN')} />
                    <YAxis type="category" dataKey="label" width={isMobile ? 100 : 190} tick={{ fontSize: isMobile ? 10 : 11, fill: '#374151' }}
                      axisLine={false} tickLine={false}
                      tickFormatter={(v) => (isMobile && v.length > 16 ? `${v.slice(0, 15)}…` : v)} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: '#fff7ed' }} />
                    <Bar dataKey={metric} radius={[0, 3, 3, 0]}>
                      {bySeva.map((r, i) => <Cell key={r.sevaType || i} fill={SEVA_COLORS[i % SEVA_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* ── Tables ──────────────────────────────────────────────────── */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="card min-w-0 overflow-hidden">
                  <div className="flex items-center gap-2 border-b bg-gray-50 px-4 py-3">
                    <Sparkles className="h-4 w-4 text-primary-600" />
                    <h3 className="text-sm font-semibold text-gray-700">{t('By seva')}</h3>
                  </div>
                  <table className="w-full table-fixed">
                    <thead>
                      <tr>
                        <th className="table-th max-sm:px-3">{t('Seva')}</th>
                        <th className="table-th w-[4.5rem] text-right max-sm:px-2 sm:w-24">{t('Bookings')}</th>
                        <th className="table-th w-24 text-right max-sm:px-3 sm:w-32">{t('Amount')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {bySeva.map((r, i) => (
                        <tr key={r.sevaType || r.name} className="cursor-pointer hover:bg-orange-50/50" onClick={() => navigate(registerLink({ sevaType: r.sevaType }))}>
                          <td className="table-td max-sm:px-3">
                            <p className="flex items-center gap-1.5 font-medium text-gray-900">
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SEVA_COLORS[i % SEVA_COLORS.length] }} />
                              <span className="break-words">{r.label}</span>
                            </p>
                            <Share value={r.amount} total={totals.amount} />
                          </td>
                          <td className="table-td text-right tabular-nums max-sm:px-2">{r.count.toLocaleString('en-IN')}</td>
                          <td className="table-td text-right font-semibold tabular-nums max-sm:px-3">{rupees(r.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="card min-w-0 overflow-hidden">
                  <div className="flex items-center gap-2 border-b bg-gray-50 px-4 py-3">
                    <Wallet className="h-4 w-4 text-primary-600" />
                    <h3 className="text-sm font-semibold text-gray-700">{t('By payment mode')}</h3>
                  </div>
                  <table className="w-full table-fixed">
                    <thead>
                      <tr>
                        <th className="table-th max-sm:px-3">{t('Mode')}</th>
                        <th className="table-th w-[4.5rem] text-right max-sm:px-2 sm:w-24">{t('Bookings')}</th>
                        <th className="table-th w-24 text-right max-sm:px-3 sm:w-32">{t('Amount')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {modeRows.map((r) => (
                        <tr key={r.mode} className="cursor-pointer hover:bg-orange-50/50" onClick={() => navigate(registerLink({ paymentMode: r.mode }))}>
                          <td className="table-td max-sm:px-3">
                            <p className="flex items-center gap-1.5 font-medium text-gray-900">
                              <span className="h-2 w-2 rounded-full" style={{ background: MODE_COLOR[r.mode] || '#9ca3af' }} />
                              {t(MODE_LABEL[r.mode] || r.mode)}
                            </p>
                            <Share value={r.amount} total={totals.amount} color="bg-gray-400" />
                          </td>
                          <td className="table-td text-right tabular-nums max-sm:px-2">{r.count.toLocaleString('en-IN')}</td>
                          <td className="table-td text-right font-semibold tabular-nums max-sm:px-3">{rupees(r.amount)}</td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50 font-semibold">
                        <td className="table-td max-sm:px-3">{t('Total')}</td>
                        <td className="table-td text-right tabular-nums max-sm:px-2">{totals.count.toLocaleString('en-IN')}</td>
                        <td className="table-td text-right tabular-nums max-sm:px-3">{rupees(totals.amount)}</td>
                      </tr>
                    </tbody>
                  </table>
                  {data?.byChannel?.online && (
                    <p className="border-t px-4 py-2.5 text-xs text-gray-500">
                      {t('Counter: {counter} · Online: {online}', {
                        counter: nBookings(t, data.byChannel.counter?.count || 0),
                        online: nBookings(t, data.byChannel.online.count),
                      })}
                    </p>
                  )}
                </div>
              </div>

              {/* By staff — the cash each clerk hands over */}
              <div className="card min-w-0 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-gray-50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <UserRound className="h-4 w-4 text-primary-600" />
                    <h3 className="text-sm font-semibold text-gray-700">{t('By staff — cash handover')}</h3>
                  </div>
                  <Link to={registerLink()} className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline">
                    <ListOrdered className="h-3.5 w-3.5" /> {t('Open in All Bookings')}
                  </Link>
                </div>
                {isMobile ? (
                  <div className="divide-y divide-gray-100">
                    {byStaff.map((r) => (
                      <button key={r.user || r.name} onClick={() => navigate(registerLink({ createdBy: r.user }))} className="block w-full px-4 py-3 text-left active:bg-gray-50">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold text-gray-900">{r.name}</span>
                          <span className="font-bold text-gray-900">{rupees(r.amount)}</span>
                        </span>
                        <span className="block text-xs text-gray-500">{nBookings(t, r.count)}</span>
                        <span className="mt-1.5 grid grid-cols-3 gap-1.5 text-center">
                          {[['Cash', r.cash, 'bg-green-50 text-green-800'], ['UPI', r.upi, 'bg-purple-50 text-purple-800'], ['Card', r.card, 'bg-blue-50 text-blue-800']].map(([label, v, cls]) => (
                            <span key={label} className={`rounded-lg px-1 py-1 ${cls}`}>
                              <span className="block text-[10px] uppercase tracking-wide opacity-80">{t(label)}</span>
                              <span className="block text-sm font-semibold">{rupees(v)}</span>
                            </span>
                          ))}
                        </span>
                      </button>
                    ))}
                    <div className="flex items-baseline justify-between bg-gray-50 px-4 py-3 font-semibold">
                      <span>{t('Total')}</span>
                      <span className="text-right">
                        {rupees(staffTotals.amount)}
                        <span className="block text-xs font-normal text-gray-600">{t('Cash')} {rupees(staffTotals.cash)}</span>
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead>
                        <tr>
                          <th className="table-th">{t('Staff')}</th>
                          <th className="table-th text-right">{t('Bookings')}</th>
                          <th className="table-th text-right">{t('Cash')}</th>
                          <th className="table-th text-right">UPI</th>
                          <th className="table-th text-right">{t('Card')}</th>
                          <th className="table-th text-right">{t('Total')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {byStaff.map((r) => (
                          <tr key={r.user || r.name} className="cursor-pointer hover:bg-orange-50/50" onClick={() => navigate(registerLink({ createdBy: r.user }))}>
                            <td className="table-td font-medium text-gray-900">{r.name}</td>
                            <td className="table-td text-right tabular-nums">{r.count.toLocaleString('en-IN')}</td>
                            <td className="table-td text-right font-semibold tabular-nums text-green-700">{rupees(r.cash)}</td>
                            <td className="table-td text-right tabular-nums">{rupees(r.upi)}</td>
                            <td className="table-td text-right tabular-nums">{rupees(r.card)}</td>
                            <td className="table-td text-right font-semibold tabular-nums">{rupees(r.amount)}</td>
                          </tr>
                        ))}
                        <tr className="bg-gray-50 font-semibold">
                          <td className="table-td">{t('Total')}</td>
                          <td className="table-td text-right tabular-nums">{staffTotals.count.toLocaleString('en-IN')}</td>
                          <td className="table-td text-right tabular-nums text-green-700">{rupees(staffTotals.cash)}</td>
                          <td className="table-td text-right tabular-nums">{rupees(staffTotals.upi)}</td>
                          <td className="table-td text-right tabular-nums">{rupees(staffTotals.card)}</td>
                          <td className="table-td text-right tabular-nums">{rupees(staffTotals.amount)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
                {voided.count > 0 && (
                  <p className="border-t px-4 py-2.5 text-xs text-gray-500">
                    {t('Voided bookings are not counted: {n} receipts, {amount}.', { n: voided.count, amount: rupees(voided.amount) })}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
