import { useMemo, useState } from 'react';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Vault, X } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import MobileCard from '../../components/ui/MobileCard.jsx';
import Spinner, { PageLoader } from '../../components/ui/Spinner.jsx';
import CloseShiftSheet from '../../components/booking/shift/CloseShiftSheet.jsx';
import ShiftDetailSheet from '../../components/booking/shift/ShiftDetailSheet.jsx';
import { DifferenceBadge, LateVoidFlag, StatusBadge } from '../../components/booking/shift/ShiftBits.jsx';
import { getBookingOptions, getShifts } from '../../api/booking.api.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { useIsMobile } from '../../hooks/useMediaQuery.js';
import haptics from '../../utils/haptics.js';
import { useT } from '../../i18n/index.jsx';
import { fmtDateTime, fmtRange, presetRange, rupees } from '../../components/booking/registerUtils.js';

// Cash handover register: every shift a counter person closed, with the cash they counted
// against what was expected. Supervisors (bookings:cash) see everyone and verify; counter staff
// see only their own (the server enforces it).

const PAGE_SIZE = 25;   // desktop table
const FEED_SIZE = 20;   // phone "show more"

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'all', label: 'All dates' },
  { key: 'custom', label: 'Custom' },
];
const STATUSES = [
  { value: 'all', label: 'All' },
  { value: 'closed', label: 'To verify' },
  { value: 'verified', label: 'Verified' },
];

function PresetChips({ preset, onPick, className = '' }) {
  const t = useT();
  return (
    <div className={`flex gap-1.5 ${className}`}>
      {PRESETS.map((p) => (
        <button key={p.key} type="button" onClick={() => onPick(p.key)}
          className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors max-sm:px-3.5 max-sm:py-2 max-sm:text-sm ${
            preset === p.key ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400'}`}>
          {t(p.label)}
        </button>
      ))}
    </div>
  );
}

function StatusSwitch({ value, onChange, className = '' }) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t('Status')} className={`inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-sm ${className}`}>
      {STATUSES.map((s) => (
        <button key={s.value} type="button" role="radio" aria-checked={value === s.value} onClick={() => { haptics.select(); onChange(s.value); }}
          className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 font-medium transition-colors max-sm:min-h-[40px] ${value === s.value ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500'}`}>
          {t(s.label)}
        </button>
      ))}
    </div>
  );
}

const Tile = ({ label, value, sub, tone = 'text-gray-900', border = 'border-l-gray-300', onClick, active, className = '' }) => {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp type={onClick ? 'button' : undefined} onClick={onClick}
      className={`card min-w-0 border-l-4 p-2.5 text-left sm:p-3.5 ${border} ${onClick ? 'transition-colors hover:bg-gray-50' : ''} ${active ? 'ring-2 ring-primary-300' : ''} ${className}`}>
      <p className="truncate text-xs text-gray-500">{label}</p>
      <p className={`mt-0.5 truncate text-lg font-bold tabular-nums leading-6 sm:text-xl ${tone}`}>{value}</p>
      {sub && <p className="truncate text-[11px] text-gray-400">{sub}</p>}
    </Comp>
  );
};

export default function BookingShifts() {
  const t = useT();
  const { can } = usePermissions();
  const isMobile = useIsMobile();
  const canAll = can('bookings:cash');

  const [preset, setPreset] = useState('month');
  const [custom, setCustom] = useState(() => presetRange('month'));
  const [status, setStatus] = useState('all');
  const [person, setPerson] = useState('');
  const [selected, setSelected] = useState(null);
  const [closeOpen, setCloseOpen] = useState(false);

  const range = preset === 'custom' ? custom : presetRange(preset);
  const filters = useMemo(() => ({
    from: range.from || undefined,
    to: range.to || undefined,
    status: status === 'all' ? undefined : status,
    user: (canAll && person) || undefined,
  }), [range.from, range.to, status, canAll, person]);

  // Any filter change goes back to page 1.
  const filterKey = JSON.stringify(filters);
  const [pager, setPager] = useState({ key: filterKey, page: 1 });
  const page = pager.key === filterKey ? pager.page : 1;
  const setPage = (fn) => {
    setPager({ key: filterKey, page: fn(page) });
    document.querySelector('main')?.scrollTo({ top: 0 });
  };

  // The counter caches the options already unwrapped; other pages cache the response.
  const { data: options } = useQuery({
    queryKey: ['booking-options'], queryFn: getBookingOptions, select: (r) => r.data.data, staleTime: 5 * 60 * 1000,
  });
  const settings = options?.settings || {};

  // Desktop: numbered pages. Phones: one list with "Show more".
  const list = useQuery({
    queryKey: ['booking-shifts', 'list', filters, page],
    queryFn: () => getShifts({ ...filters, page, limit: PAGE_SIZE }),
    select: (r) => r.data.data,
    placeholderData: keepPreviousData,
    enabled: !isMobile,
    staleTime: 15_000,
  });
  const feed = useInfiniteQuery({
    queryKey: ['booking-shifts', 'feed', filters],
    queryFn: ({ pageParam }) => getShifts({ ...filters, page: pageParam, limit: FEED_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => { const d = last.data.data; return d.page < d.pages ? d.page + 1 : undefined; },
    placeholderData: keepPreviousData,
    enabled: isMobile,
    staleTime: 15_000,
  });

  const head = isMobile ? feed.data?.pages?.[0]?.data?.data : list.data;
  const items = isMobile ? (feed.data?.pages || []).flatMap((p) => p.data.data.items) : (list.data?.items || []);
  const total = head?.total ?? 0;
  const summary = head?.summary || { amount: 0, cash: 0, short: 0, excess: 0, pending: 0 };
  const pages = list.data?.pages || 1;
  const loading = isMobile ? feed.isLoading : list.isLoading;
  const fetching = isMobile ? feed.isFetching && !feed.isFetchingNextPage : list.isFetching;
  const queryError = isMobile ? feed.error : list.error;

  const anyFilter = preset !== 'month' || status !== 'all' || Boolean(person);
  const clearAll = () => { setPreset('month'); setStatus('all'); setPerson(''); };
  const pickPreset = (key) => {
    haptics.select();
    if (key === 'custom' && !custom.from && !custom.to) setCustom(range.from ? { from: range.from, to: range.to } : presetRange('today'));
    setPreset(key);
  };
  const open = (s) => { haptics.tap(); setSelected(s); };

  const rangeText = preset === 'all' ? t('All dates') : fmtRange(range.from, range.to) || t('All dates');
  const bookingsLine = (s) => `${(s.totals?.count ?? 0).toLocaleString('en-IN')} · ${rupees(s.totals?.amount)}`;

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
  const personSelect = canAll && (
    <label className="block min-w-0 sm:w-56">
      <span className="sr-only">{t('Person')}</span>
      <select value={person} onChange={(e) => setPerson(e.target.value)} className="input" aria-label={t('Person')}>
        <option value="">{t('All staff')}</option>
        {(options?.staff || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
      </select>
    </label>
  );

  return (
    <div className="space-y-3 sm:space-y-4">
      <PageHeader
        title="Cash Handover"
        subtitle={canAll ? 'Shift closes from the booking counter, to check and verify' : 'Your shift closes and cash counts'}
        breadcrumbs={[{ label: 'Pooja Booking' }, { label: 'Cash Handover' }]}
        actions={can('bookings:create') && (
          <button type="button" onClick={() => setCloseOpen(true)} className="btn-primary whitespace-nowrap">
            <Vault className="h-4 w-4" /> {t('Close my shift')}
          </button>
        )}
      />

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      {isMobile ? (
        <div className="space-y-2.5">
          <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <PresetChips preset={preset} onPick={pickPreset} className="w-max" />
          </div>
          {customDates}
          <StatusSwitch value={status} onChange={setStatus} className="w-full" />
          {personSelect}
        </div>
      ) : (
        <div className="card space-y-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <PresetChips preset={preset} onPick={pickPreset} className="flex-wrap" />
          </div>
          {customDates}
          <div className="flex flex-wrap items-center gap-2">
            <StatusSwitch value={status} onChange={setStatus} />
            {personSelect}
            {anyFilter && (
              <button type="button" onClick={clearAll} className="inline-flex items-center gap-1 px-1 text-xs font-medium text-primary-700 hover:underline">
                <X className="h-3.5 w-3.5" /> {t('Clear filters')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Summary tiles ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
        <Tile label={t('Collected')} value={rupees(summary.amount)} sub={`${t('{n} handovers', { n: total.toLocaleString('en-IN') })} · ${rangeText}`}
          border="border-l-primary-500" className="col-span-2 sm:col-span-1" />
        <Tile label={t('Cash')} value={rupees(summary.cash)} border="border-l-green-500" tone="text-green-700" />
        <Tile label={t('To verify')} value={(summary.pending || 0).toLocaleString('en-IN')} border="border-l-blue-500" tone="text-blue-700"
          onClick={() => { haptics.select(); setStatus(status === 'closed' ? 'all' : 'closed'); }} active={status === 'closed'}
          sub={summary.pending && status !== 'closed' ? t('Tap to show them') : undefined} />
        <Tile label={t('Short')} value={rupees(Math.abs(summary.short || 0))} border="border-l-red-500"
          tone={summary.short ? 'text-red-700' : 'text-gray-400'} />
        <Tile label={t('Excess')} value={rupees(summary.excess)} border="border-l-amber-500"
          tone={summary.excess ? 'text-amber-700' : 'text-gray-400'} />
      </div>

      {/* ── Results ────────────────────────────────────────────────────────── */}
      {loading ? <PageLoader /> : queryError && !items.length ? (
        <div className="card px-4 py-10 text-center">
          <p className="text-sm text-red-600">{t(queryError.response?.data?.message || 'Could not load the handovers')}</p>
          <button type="button" onClick={() => (isMobile ? feed.refetch() : list.refetch())} className="btn-secondary mt-3">{t('Try again')}</button>
        </div>
      ) : items.length === 0 ? (
        <div className="card px-4 py-12 text-center">
          <p className="text-sm text-gray-500">{t('No handovers in this period.')}</p>
          {can('bookings:create') && <p className="mt-1 text-xs text-gray-400">{t('Close your shift from the booking counter when you hand over the cash.')}</p>}
          {anyFilter && <button type="button" onClick={clearAll} className="btn-ghost mt-3 text-primary-700">{t('Clear filters')}</button>}
        </div>
      ) : isMobile ? (
        <div className="space-y-2.5">
          {items.map((s) => (
            <MobileCard
              key={s._id}
              onClick={() => open(s)}
              title={s.user?.name || '—'}
              subtitle={fmtDateTime(s.closedAt)}
              aside={<DifferenceBadge difference={s.difference} />}
              fields={[
                { label: t('Bookings'), value: bookingsLine(s) },
                { label: t('Status'), value: <StatusBadge status={s.status} /> },
                { label: t('Expected cash'), value: rupees(s.expectedCash) },
                { label: t('Counted'), value: <b className="tabular-nums">{rupees(s.countedCash)}</b> },
                s.voidedAfterClose?.count && { label: t('Check'), value: <LateVoidFlag late={s.voidedAfterClose} />, full: true },
              ]}
            />
          ))}
          {feed.hasNextPage && (
            <button type="button" onClick={() => feed.fetchNextPage()} disabled={feed.isFetchingNextPage} className="btn-secondary w-full">
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
                  <th className="table-th">{t('Person')}</th>
                  <th className="table-th">{t('Closed at')}</th>
                  <th className="table-th text-right">{t('Bookings')}</th>
                  <th className="table-th text-right">{t('Expected cash')}</th>
                  <th className="table-th text-right">{t('Counted')}</th>
                  <th className="table-th">{t('Difference')}</th>
                  <th className="table-th">{t('Status')}</th>
                </tr>
              </thead>
              <tbody className={`divide-y divide-gray-100 bg-white ${fetching ? 'opacity-60' : ''}`}>
                {items.map((s) => (
                  <tr key={s._id} onClick={() => open(s)} className="cursor-pointer transition-colors hover:bg-orange-50/50">
                    <td className="table-td font-medium text-gray-900">{s.user?.name || '—'}</td>
                    <td className="table-td whitespace-nowrap">
                      <p>{fmtDateTime(s.closedAt)}</p>
                      <p className="text-xs text-gray-400">{t('from {time}', { time: fmtDateTime(s.startedAt) })}</p>
                    </td>
                    <td className="table-td whitespace-nowrap text-right tabular-nums">
                      <p className="font-medium text-gray-900">{(s.totals?.count ?? 0).toLocaleString('en-IN')}</p>
                      <p className="text-xs text-gray-500">{rupees(s.totals?.amount)}</p>
                    </td>
                    <td className="table-td whitespace-nowrap text-right tabular-nums">{rupees(s.expectedCash)}</td>
                    <td className="table-td whitespace-nowrap text-right font-semibold tabular-nums text-gray-900">{rupees(s.countedCash)}</td>
                    <td className="table-td"><DifferenceBadge difference={s.difference} /></td>
                    <td className="table-td">
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={s.status} />
                        <LateVoidFlag late={s.voidedAfterClose} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-sm text-gray-600">
            <span className="flex items-center gap-2">
              {t('Showing {from}–{to} of {total}', {
                from: ((page - 1) * PAGE_SIZE + 1).toLocaleString('en-IN'),
                to: Math.min(page * PAGE_SIZE, total).toLocaleString('en-IN'),
                total: total.toLocaleString('en-IN'),
              })}
              {fetching && <Spinner size="sm" />}
            </span>
            {pages > 1 && (
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="btn-ghost p-1.5 disabled:opacity-40" aria-label={t('Prev')}>
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-1 tabular-nums">{t('Page {page} of {pages}', { page, pages })}</span>
                <button type="button" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} className="btn-ghost p-1.5 disabled:opacity-40" aria-label={t('Next')}>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <ShiftDetailSheet shift={selected} onClose={() => setSelected(null)} settings={settings} />
      {can('bookings:create') && (
        <CloseShiftSheet open={closeOpen} onClose={() => setCloseOpen(false)} settings={settings} historyLink={false} />
      )}
    </div>
  );
}
