import { useState } from 'react';
import { AlertTriangle, CalendarClock, Clock, Mail, RefreshCw } from 'lucide-react';
import { useLanguage, useT } from '../../../i18n/index.jsx';
import { addDays, compactBatchLabel, fmtDay, serverText } from './counterUtils.js';
import { HallBadge, radioTab, rovingKeyDown } from './bits.jsx';

const LOW = 5; // "N left" turns red at this many seats

function Notice({ tone = 'amber', icon: Icon = AlertTriangle, children, action }) {
  const tones = {
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    red: 'border-red-200 bg-red-50 text-red-700',
    gray: 'border-gray-200 bg-gray-50 text-gray-600',
    blue: 'border-blue-100 bg-blue-50 text-blue-800',
  };
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2.5 text-sm ${tones[tone]}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-[12rem] flex-1">{children}</span>
      {action}
    </div>
  );
}

const ActionBtn = ({ onClick, children }) => (
  <button type="button" onClick={onClick}
    className="min-h-[40px] shrink-0 rounded-lg border border-black/10 bg-white px-3 text-sm font-semibold hover:bg-white/70">
    {children}
  </button>
);

/**
 * Where/when for the chosen seva and date: the batch grid (batch sevas), the fixed time and
 * seats left (slot sevas), or a note (arrangement / by post).
 */
export default function BatchPanel({
  seva, sevaTypes, query, date, today, batchId, onPick, onDate, suggestDate, notice, capacityUnit, peopleCount,
}) {
  const t = useT();
  const { lang } = useLanguage();
  const [showEnded, setShowEnded] = useState(false);

  if (!seva) return null;

  if (seva.schedule === 'none') {
    return (
      <Notice tone="blue" icon={Mail}>
        {t('No date or batch — the puja is done on the devotee’s behalf and prasad is sent by post.')}
      </Notice>
    );
  }

  const { data: avail, isLoading, isError, error: loadError, refetch, isFetching } = query;
  const seats = capacityUnit === 'people' ? Math.max(1, peopleCount) : 1;

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4" aria-busy="true">
        {Array.from({ length: seva.schedule === 'batch' ? 8 : 1 }, (_, i) => <div key={i} className="h-[62px] animate-pulse rounded-xl bg-gray-100" />)}
      </div>
    );
  }
  if (isError) {
    return (
      <Notice tone="red" action={<ActionBtn onClick={() => refetch()}>{t('Try again')}</ActionBtn>}>
        {serverText(t, loadError?.response?.data?.message, { sevaTypes, lang }) || t('Could not load seats')}
      </Notice>
    );
  }
  if (!avail) return null;

  if (!avail.open) {
    return (
      <Notice
        tone="amber"
        icon={CalendarClock}
        action={suggestDate && suggestDate !== date && (
          <ActionBtn onClick={() => onDate(suggestDate)}>{t('Book for {date}', { date: fmtDay(suggestDate, lang) })}</ActionBtn>
        )}
      >
        {serverText(t, avail.reason, { sevaTypes, lang })}
      </Notice>
    );
  }

  if (seva.schedule === 'arrangement') {
    return (
      <Notice tone="gray" icon={CalendarClock}>
        {t('No batch — the date is as agreed with the temple office.')}
      </Notice>
    );
  }

  if (seva.schedule === 'slot') {
    const s = avail.slot || {};
    const unlimited = s.left === null || s.left === undefined;
    const full = !unlimited && s.left < seats;
    return (
      <div className="space-y-2">
        <div className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 ${full ? 'border-red-200 bg-red-50' : 'border-primary-200 bg-primary-50'}`}>
          <Clock className={`h-5 w-5 shrink-0 ${full ? 'text-red-500' : 'text-primary-600'}`} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900">{s.label || seva.slotTime || t('Fixed time')}</p>
            <p className="text-xs text-gray-500">{fmtDay(date, lang, { weekday: 'long', day: 'numeric', month: 'short' })}</p>
          </div>
          <span className={`shrink-0 text-sm font-bold ${full ? 'text-red-600' : unlimited ? 'text-gray-500' : s.left <= LOW ? 'text-red-600' : 'text-green-700'}`}>
            {unlimited ? t('No limit') : full ? t('Full') : t('{n} left', { n: s.left })}
          </span>
        </div>
        {full && suggestDate && (
          <Notice tone="red" action={<ActionBtn onClick={() => onDate(suggestDate)}>{t('Book for {date}', { date: fmtDay(suggestDate, lang) })}</ActionBtn>}>
            {t('No seats left on this date')}
          </Notice>
        )}
      </div>
    );
  }

  // ── batch ───────────────────────────────────────────────────────────────────
  const batches = avail.batches || [];
  const ended = batches.filter((b) => b.ended);
  const visible = showEnded ? batches : batches.filter((b) => !b.ended);
  const anySelected = visible.some((b) => b._id === batchId);
  const firstEnabled = visible.findIndex((b) => !b.ended && b.left >= seats);
  const allEnded = batches.length > 0 && ended.length === batches.length;
  const allFull = batches.length > 0 && batches.every((b) => b.ended || b.left < seats);

  return (
    <div className="space-y-2">
      {notice && (
        <Notice tone="red">
          {t('{batch} ({hall}) just filled up — choose another batch.', { batch: compactBatchLabel(notice.start, notice.end, notice.label), hall: notice.hall })}
        </Notice>
      )}
      {batches.length === 0 && <Notice tone="gray">{t('No batches are set up for this seva on this day.')}</Notice>}
      {allEnded && date === today && (
        <Notice tone="amber" icon={Clock} action={<ActionBtn onClick={() => onDate(addDays(today, 1))}>{t('Book for tomorrow')}</ActionBtn>}>
          {t('All of today’s batches are over.')}
        </Notice>
      )}
      {!allEnded && allFull && <Notice tone="red">{t('All batches are full on this date.')}</Notice>}

      {visible.length > 0 && (
        <div role="radiogroup" aria-label={t('Batch')} onKeyDown={rovingKeyDown} className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {visible.map((b, i) => {
            const selected = b._id === batchId;
            const full = b.left < seats;
            const disabled = b.ended || full;
            const low = !disabled && b.left <= LOW;
            const pct = b.capacity ? Math.min(100, Math.round((b.booked / b.capacity) * 100)) : 0;
            return (
              <button
                key={b._id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                tabIndex={disabled ? -1 : radioTab(selected, i === firstEnabled, anySelected)}
                data-enter-books
                onClick={() => onPick(b)}
                className={`relative flex min-h-[62px] flex-col justify-between rounded-xl border-2 px-2.5 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:cursor-not-allowed ${
                  selected ? 'border-primary-500 bg-primary-50 shadow-sm'
                    : disabled ? 'border-gray-100 bg-gray-50 opacity-60'
                      : 'border-gray-200 bg-white hover:border-primary-300'
                }`}
              >
                <span className="flex items-center justify-between gap-1">
                  <span className={`text-[13px] font-bold tabular-nums leading-tight ${selected ? 'text-primary-800' : 'text-gray-900'}`}>
                    {compactBatchLabel(b.start, b.end, b.label)}
                  </span>
                  <HallBadge hall={b.hall} />
                </span>
                <span className="mt-1 flex items-center justify-between gap-1 text-xs">
                  <span className={`font-semibold ${b.ended ? 'text-gray-400' : full ? 'text-red-500' : low ? 'text-red-600' : 'text-green-700'}`}>
                    {b.ended ? t('Finished') : full ? t('Full') : t('{n} left', { n: b.left })}
                  </span>
                  <span className="text-gray-400 tabular-nums">{b.booked}/{b.capacity}</span>
                </span>
                {!b.ended && (
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-gray-100">
                    <span className={`block h-full rounded-full ${full || low ? 'bg-red-500' : pct > 70 ? 'bg-amber-400' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
        {ended.length > 0 && !allEnded ? (
          <button type="button" onClick={() => setShowEnded((v) => !v)} className="min-h-[32px] font-medium text-gray-500 underline-offset-2 hover:underline">
            {showEnded ? t('Hide finished batches') : t('Show {n} finished batches', { n: ended.length })}
          </button>
        ) : <span />}
        <span className="flex items-center gap-1">
          <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} /> {t('Seats update every 30 s')}
        </span>
      </div>
    </div>
  );
}
