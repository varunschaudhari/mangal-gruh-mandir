import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Search, X, SlidersHorizontal, FileSpreadsheet, Plus, Printer, FileText, ChevronLeft, ChevronRight, Users,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import Badge from '../../components/ui/Badge.jsx';
import MobileCard from '../../components/ui/MobileCard.jsx';
import Spinner, { PageLoader } from '../../components/ui/Spinner.jsx';
import BookingDetailSheet from '../../components/booking/BookingDetailSheet.jsx';
import { exportBookingsExcel, getBookingOptions, getBookings } from '../../api/booking.api.js';
import { printBookingReceipt, printBookingSlip } from '../../utils/bookingReceipt.js';
import { saveFile } from '../../utils/fileSaver.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { useIsMobile } from '../../hooks/useMediaQuery.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import haptics from '../../utils/haptics.js';
import { useLanguage, useT } from '../../i18n/index.jsx';
import {
  MODES, MODE_BADGE, MODE_LABEL, fmtDateTime, fmtDay, fmtRange, fmtTime, presetRange, rupees, sevaLabel,
} from '../../components/booking/registerUtils.js';

// The booking register: every receipt, searchable by receipt no. / name / phone, filtered by
// date booked or puja date, seva, payment mode, staff and status. Paged on the server —
// a peak Tuesday alone has 1,000+ bookings.

const PAGE_SIZE = 50;   // desktop table
const FEED_SIZE = 30;   // phone "show more"

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow', only: 'puja' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All dates' },
  { key: 'custom', label: 'Custom' },
];
const STATUSES = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'voided', label: 'Voided' },
  { value: 'all', label: 'All' },
];

// Server errors come back as a Blob when the request asked for a file.
async function blobErrorMessage(err) {
  try { return JSON.parse(await err.response.data.text()).message; } catch { return null; }
}

/** Booked on / Puja date switch. */
function DateFieldSwitch({ value, onChange, className = '' }) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t('Filter dates by')} className={`inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-sm ${className}`}>
      {[['paid', 'Booked on'], ['puja', 'Puja date']].map(([key, label]) => (
        <button key={key} role="radio" aria-checked={value === key} onClick={() => onChange(key)}
          className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 font-medium transition-colors max-sm:py-2 ${value === key ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500'}`}>
          {t(label)}
        </button>
      ))}
    </div>
  );
}

function PresetChips({ preset, dateField, onPick, className = '' }) {
  const t = useT();
  return (
    <div className={`flex gap-1.5 ${className}`}>
      {PRESETS.filter((p) => !p.only || p.only === dateField).map((p) => (
        <button key={p.key} onClick={() => onPick(p.key)}
          className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors max-sm:px-3.5 max-sm:py-2 max-sm:text-sm ${
            preset === p.key ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400'}`}>
          {t(p.label)}
        </button>
      ))}
    </div>
  );
}

const Select = ({ label, value, onChange, children }) => (
  <label className="block min-w-0">
    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input">{children}</select>
  </label>
);

export default function BookingList() {
  const t = useT();
  const { lang } = useLanguage();
  const { can } = usePermissions();
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();

  // Filters start from the URL (links from reports, and coming back from another page)
  const [search, setSearch] = useState(() => params.get('q') || '');
  const [dateField, setDateField] = useState(() => (params.get('dateField') === 'puja' ? 'puja' : 'paid'));
  const [preset, setPreset] = useState(() => {
    const p = params.get('range');
    if (PRESETS.some((x) => x.key === p)) return p;
    return params.get('from') || params.get('to') ? 'custom' : 'today';
  });
  const [custom, setCustom] = useState(() => ({ from: params.get('from') || '', to: params.get('to') || '' }));
  const [sevaType, setSevaType] = useState(() => params.get('sevaType') || '');
  const [paymentMode, setPaymentMode] = useState(() => params.get('paymentMode') || '');
  const [createdBy, setCreatedBy] = useState(() => params.get('createdBy') || '');
  const [status, setStatus] = useState(() => (['voided', 'all'].includes(params.get('status')) ? params.get('status') : 'confirmed'));
  const [selected, setSelected] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(null);

  const q = useDebounce(search.trim(), 350);
  const range = preset === 'custom' ? custom : presetRange(preset);

  const filters = useMemo(() => ({
    q: q || undefined,
    from: range.from || undefined,
    to: range.to || undefined,
    dateField,
    sevaType: sevaType || undefined,
    paymentMode: paymentMode || undefined,
    createdBy: createdBy || undefined,
    status,
  }), [q, range.from, range.to, dateField, sevaType, paymentMode, createdBy, status]);

  // Keep the URL in step so Back returns to the same view (only when it actually changed).
  useEffect(() => {
    const next = { range: preset === 'today' ? '' : preset, dateField: dateField === 'paid' ? '' : dateField };
    if (preset === 'custom') Object.assign(next, { from: custom.from, to: custom.to });
    Object.assign(next, { q, sevaType, paymentMode, createdBy, status: status === 'confirmed' ? '' : status });
    const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v));
    if (qs.toString() !== params.toString()) setParams(qs, { replace: true });
  }, [preset, dateField, custom.from, custom.to, q, sevaType, paymentMode, createdBy, status, params, setParams]);

  // Any filter change goes back to page 1 (no effect needed: the page belongs to a filter set).
  const filterKey = JSON.stringify(filters);
  const [pager, setPager] = useState({ key: filterKey, page: 1 });
  const page = pager.key === filterKey ? pager.page : 1;
  const setPage = (fn) => {
    setPager({ key: filterKey, page: fn(page) });
    document.querySelector('main')?.scrollTo({ top: 0 });
  };

  const { data: options } = useQuery({
    queryKey: ['booking-options'], queryFn: getBookingOptions, select: (r) => r.data.data, staleTime: 5 * 60 * 1000,
  });
  const settings = options?.settings || {};
  const sevaById = useMemo(() => new Map((options?.allSevaTypes || options?.sevaTypes || []).map((s) => [String(s._id), s])), [options]);

  // Desktop: numbered pages. Phones: one long list with "Show more".
  const list = useQuery({
    queryKey: ['bookings', 'list', filters, page],
    queryFn: () => getBookings({ ...filters, page, limit: PAGE_SIZE }),
    select: (r) => r.data.data,
    placeholderData: keepPreviousData,
    enabled: !isMobile,
  });
  const feed = useInfiniteQuery({
    queryKey: ['bookings', 'feed', filters],
    queryFn: ({ pageParam }) => getBookings({ ...filters, page: pageParam, limit: FEED_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => { const d = last.data.data; return d.page < d.pages ? d.page + 1 : undefined; },
    placeholderData: keepPreviousData,
    enabled: isMobile,
  });

  const head = isMobile ? feed.data?.pages?.[0]?.data?.data : list.data;
  const items = isMobile ? (feed.data?.pages || []).flatMap((p) => p.data.data.items) : (list.data?.items || []);
  const total = head?.total ?? 0;
  const amount = head?.amount ?? 0;
  const pages = list.data?.pages || 1;
  const loading = isMobile ? feed.isLoading : list.isLoading;
  const fetching = isMobile ? feed.isFetching && !feed.isFetchingNextPage : list.isFetching;

  const extraFilters = [sevaType, paymentMode, createdBy, status !== 'confirmed'].filter(Boolean).length;
  const anyFilter = extraFilters > 0 || preset !== 'today' || dateField !== 'paid' || !!search;

  const pickPreset = (key) => {
    haptics.select();
    if (key === 'custom') {
      if (!custom.from && !custom.to) setCustom(range.from ? { from: range.from, to: range.to } : presetRange('today'));
      if (isMobile) setFiltersOpen(true);
    }
    setPreset(key);
  };
  const switchDateField = (key) => {
    haptics.select();
    setDateField(key);
    if (key === 'paid' && preset === 'tomorrow') setPreset('today');
  };
  const clearAll = () => {
    setSearch(''); setDateField('paid'); setPreset('today'); setCustom({ from: '', to: '' });
    setSevaType(''); setPaymentMode(''); setCreatedBy(''); setStatus('confirmed');
  };

  const doExport = async () => {
    setExporting(true);
    try {
      const res = await exportBookingsExcel(filters);
      const span = range.from ? `${range.from}${range.to && range.to !== range.from ? `-to-${range.to}` : ''}` : 'all';
      await saveFile(res.data, `bookings-${span}.xlsx`);
    } catch (e) {
      toast.error((await blobErrorMessage(e)) || t('Export failed'));
    } finally {
      setExporting(false);
    }
  };

  const quickPrint = async (e, b, kind) => {
    e.stopPropagation();
    setPrinting(`${b._id}-${kind}`);
    try {
      if (kind === 'slip') await printBookingSlip(b, settings);
      else await printBookingReceipt(b, settings);
    } catch (err) {
      toast.error(err?.message ? t('Could not print: {reason}', { reason: err.message }) : t('Could not print'));
    } finally {
      setPrinting(null);
    }
  };

  const sevaName = (b) => sevaLabel(lang, sevaById, b.sevaType, b.sevaName);
  const pujaLine = (b) => (b.dateKey
    ? [fmtDay(b.dateKey, { weekday: 'short', day: '2-digit', month: 'short' }), b.batchLabel].filter(Boolean).join(' · ')
    : t('No visit (on behalf)'));
  const seatLine = (b) => [b.hall && t('Hall {hall}', { hall: b.hall }), b.serialNo != null && `#${b.serialNo}`].filter(Boolean).join(' · ');

  // ── Filter fields (inline on desktop, in a sheet on phones) ─────────────────
  const filterFields = (
    <>
      <Select label={t('Seva')} value={sevaType} onChange={setSevaType}>
        <option value="">{t('All sevas')}</option>
        {(options?.allSevaTypes || options?.sevaTypes || []).map((s) => (
          <option key={s._id} value={s._id}>{(lang === 'mr' && s.nameMr) || s.name}</option>
        ))}
      </Select>
      <Select label={t('Payment Mode')} value={paymentMode} onChange={setPaymentMode}>
        <option value="">{t('All modes')}</option>
        {MODES.map((m) => <option key={m} value={m}>{t(MODE_LABEL[m])}</option>)}
      </Select>
      <Select label={t('Booked by')} value={createdBy} onChange={setCreatedBy}>
        <option value="">{t('All staff')}</option>
        {(options?.staff || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
      </Select>
      <Select label={t('Status')} value={status} onChange={setStatus}>
        {STATUSES.map((s) => <option key={s.value} value={s.value}>{t(s.label)}</option>)}
      </Select>
    </>
  );
  const customDates = preset === 'custom' && (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
      {[['from', 'From'], ['to', 'To']].map(([k, label]) => (
        <label key={k} className="block min-w-0">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{t(label)}</span>
          <input type="date" value={custom[k]} onChange={(e) => setCustom((c) => ({ ...c, [k]: e.target.value }))} className="input" />
        </label>
      ))}
    </div>
  );

  const rangeText = preset === 'all' ? t('All dates') : fmtRange(range.from, range.to) || t('All dates');

  return (
    <div className="space-y-3 sm:space-y-4">
      <PageHeader
        title="All Bookings"
        subtitle="Abhishek and puja receipts"
        breadcrumbs={[{ label: 'Bookings' }, { label: 'All Bookings' }]}
        actions={(
          <>
            <button onClick={doExport} disabled={exporting || !total} className="btn-secondary whitespace-nowrap">
              {exporting ? <Spinner size="sm" /> : <FileSpreadsheet className="h-4 w-4 text-green-600" />}
              {t('Download Excel')}
            </button>
            {can('bookings:create') && (
              <Link to="/bookings/new" className="btn-primary max-sm:hidden"><Plus className="h-4 w-4" /> {t('New Booking')}</Link>
            )}
          </>
        )}
      />

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      {isMobile ? (
        <div className="space-y-2.5">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} enterKeyHint="search"
                placeholder={t('Receipt no., name or phone')} className="input pl-9" />
            </div>
            <button onClick={() => setFiltersOpen(true)} className="btn-secondary relative px-3" aria-label={t('Filters')}>
              <SlidersHorizontal className="h-4 w-4" />
              {extraFilters > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-[11px] font-bold text-white">{extraFilters}</span>
              )}
            </button>
          </div>
          <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <PresetChips preset={preset} dateField={dateField} onPick={pickPreset} className="w-max" />
          </div>
        </div>
      ) : (
        <div className="card space-y-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Receipt no., name or phone')} className="input pl-9" />
            </div>
            <DateFieldSwitch value={dateField} onChange={switchDateField} />
            <PresetChips preset={preset} dateField={dateField} onPick={pickPreset} className="flex-wrap" />
          </div>
          {customDates}
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{filterFields}</div>
          {anyFilter && (
            <button onClick={clearAll} className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline">
              <X className="h-3.5 w-3.5" /> {t('Clear filters')}
            </button>
          )}
        </div>
      )}

      {/* ── Totals strip ───────────────────────────────────────────────────── */}
      <div className="card flex items-stretch divide-x divide-gray-100 overflow-hidden">
        <div className="min-w-0 px-3 py-2.5 sm:px-4">
          <p className="text-xs text-gray-500">{status === 'voided' ? t('Voided bookings') : t('Bookings')}</p>
          <p className="text-lg font-bold text-gray-900 sm:text-xl">{total.toLocaleString('en-IN')}</p>
        </div>
        <div className="min-w-0 px-3 py-2.5 sm:px-4">
          <p className="text-xs text-gray-500">{t('Amount')}</p>
          <p className={`text-lg font-bold sm:text-xl ${status === 'voided' ? 'text-red-600 line-through decoration-1' : 'text-green-700'}`}>{rupees(amount)}</p>
        </div>
        <div className="min-w-0 flex-1 px-3 py-2.5 sm:px-4">
          <p className="truncate text-xs text-gray-500">{dateField === 'puja' ? t('Puja date') : t('Booked on')}</p>
          <div className="flex items-center gap-2 truncate text-sm font-semibold text-gray-800 sm:text-base">
            {rangeText}
            {fetching && !loading && <Spinner size="sm" />}
          </div>
        </div>
      </div>

      {/* ── Results ────────────────────────────────────────────────────────── */}
      {loading ? <PageLoader /> : items.length === 0 ? (
        <div className="card px-4 py-12 text-center">
          <p className="text-sm text-gray-500">{t('No bookings match these filters.')}</p>
          {q && preset !== 'all' && (
            <button onClick={() => setPreset('all')} className="btn-secondary mt-3">
              <Search className="h-4 w-4" /> {t('Search all dates')}
            </button>
          )}
          {!q && anyFilter && (
            <button onClick={clearAll} className="btn-ghost mt-3 text-primary-700">{t('Clear filters')}</button>
          )}
        </div>
      ) : isMobile ? (
        <div className="space-y-2.5">
          {items.map((b) => (
            <MobileCard
              key={b._id}
              onClick={() => { haptics.tap(); setSelected(b); }}
              className={b.status === 'voided' ? 'opacity-70' : ''}
              title={(
                <span className="flex items-center gap-1.5">
                  <span className="truncate">{b.devotee?.name}</span>
                  {b.peopleCount > 1 && <span className="shrink-0 text-xs font-normal text-gray-500">×{b.peopleCount}</span>}
                </span>
              )}
              subtitle={<span className="font-mono">{b.receiptNo} · {fmtTime(b.paidAt)}</span>}
              aside={(
                <div className="text-right">
                  <p className={`text-sm font-bold ${b.status === 'voided' ? 'text-red-500 line-through' : 'text-gray-900'}`}>{rupees(b.amount)}</p>
                  {b.status === 'voided'
                    ? <Badge variant="red">{t('Voided')}</Badge>
                    : <Badge variant={MODE_BADGE[b.paymentMode]}>{t(MODE_LABEL[b.paymentMode] || b.paymentMode)}</Badge>}
                </div>
              )}
              fields={[
                { label: t('Seva'), value: sevaName(b) },
                { label: t('Puja'), value: pujaLine(b) },
                seatLine(b) && { label: t('Seat'), value: seatLine(b) },
                { label: t('Booked by'), value: b.createdBy?.name },
              ]}
            />
          ))}
          {feed.hasNextPage && (
            <button onClick={() => feed.fetchNextPage()} disabled={feed.isFetchingNextPage} className="btn-secondary w-full">
              {feed.isFetchingNextPage ? <Spinner size="sm" /> : t('Show more ({n} remaining)', { n: total - items.length })}
            </button>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="table-th">{t('Receipt No.')}</th>
                  <th className="table-th">{t('Devotee')}</th>
                  <th className="table-th">{t('Seva')}</th>
                  <th className="table-th">{t('Puja')}</th>
                  <th className="table-th text-right">{t('Amount')}</th>
                  <th className="table-th">{t('Booked by')}</th>
                  <th className="table-th w-20"><span className="sr-only">{t('Actions')}</span></th>
                </tr>
              </thead>
              <tbody className={`divide-y divide-gray-100 bg-white ${fetching ? 'opacity-60' : ''}`}>
                {items.map((b) => {
                  const voided = b.status === 'voided';
                  return (
                    <tr key={b._id} onClick={() => setSelected(b)} className={`cursor-pointer transition-colors hover:bg-orange-50/50 ${voided ? 'bg-red-50/40' : ''}`}>
                      <td className="table-td whitespace-nowrap">
                        <p className="font-mono text-xs font-semibold text-primary-700">{b.receiptNo}</p>
                        <p className="text-xs text-gray-400">{fmtDateTime(b.paidAt)}</p>
                      </td>
                      <td className="table-td">
                        <p className="font-medium text-gray-900">
                          {b.devotee?.name}
                          {b.peopleCount > 1 && (
                            <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs font-normal text-gray-500"><Users className="h-3 w-3" />{b.peopleCount}</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">{b.devotee?.phone}</p>
                      </td>
                      <td className="table-td">{sevaName(b)}</td>
                      <td className="table-td">
                        <p className="whitespace-nowrap">{pujaLine(b)}</p>
                        {seatLine(b) && <p className="text-xs text-gray-500">{seatLine(b)}</p>}
                      </td>
                      <td className="table-td text-right">
                        <p className={`font-semibold ${voided ? 'text-red-500 line-through' : 'text-gray-900'}`}>{rupees(b.amount)}</p>
                        {voided
                          ? <Badge variant="red">{t('Voided')}</Badge>
                          : <Badge variant={MODE_BADGE[b.paymentMode]}>{t(MODE_LABEL[b.paymentMode] || b.paymentMode)}</Badge>}
                      </td>
                      <td className="table-td whitespace-nowrap text-gray-600">{b.createdBy?.name || '—'}</td>
                      <td className="table-td whitespace-nowrap">
                        <div className="flex justify-end gap-0.5">
                          <button onClick={(e) => quickPrint(e, b, 'slip')} disabled={!!printing} title={t('Print slip')} aria-label={t('Print slip')}
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                            {printing === `${b._id}-slip` ? <Spinner size="sm" /> : <Printer className="h-4 w-4" />}
                          </button>
                          <button onClick={(e) => quickPrint(e, b, 'a4')} disabled={!!printing} title={t('A4 receipt')} aria-label={t('A4 receipt')}
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                            {printing === `${b._id}-a4` ? <Spinner size="sm" /> : <FileText className="h-4 w-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-sm text-gray-600">
            <span>
              {t('Showing {from}–{to} of {total}', {
                from: ((page - 1) * PAGE_SIZE + 1).toLocaleString('en-IN'),
                to: Math.min(page * PAGE_SIZE, total).toLocaleString('en-IN'),
                total: total.toLocaleString('en-IN'),
              })}
            </span>
            {pages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="btn-ghost p-1.5 disabled:opacity-40" aria-label={t('Prev')}>
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-1 tabular-nums">{t('Page {page} of {pages}', { page, pages })}</span>
                <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} className="btn-ghost p-1.5 disabled:opacity-40" aria-label={t('Next')}>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Phone filter sheet ─────────────────────────────────────────────── */}
      {isMobile && (
        <Sheet
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          title={t('Filters')}
          footer={(
            <div className="flex gap-2">
              <button onClick={clearAll} className="btn-secondary flex-1">{t('Clear filters')}</button>
              <button onClick={() => setFiltersOpen(false)} className="btn-primary flex-1">
                {t('Show {n} bookings', { n: total.toLocaleString('en-IN') })}
              </button>
            </div>
          )}
        >
          <div className="space-y-4">
            <div>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Filter dates by')}</span>
              <DateFieldSwitch value={dateField} onChange={switchDateField} className="w-full" />
            </div>
            <div>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Dates')}</span>
              <PresetChips preset={preset} dateField={dateField} onPick={pickPreset} className="flex-wrap" />
            </div>
            {customDates}
            <div className="grid grid-cols-1 gap-3">{filterFields}</div>
          </div>
        </Sheet>
      )}

      <BookingDetailSheet booking={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
