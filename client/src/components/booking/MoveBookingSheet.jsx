import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, ArrowRight, CalendarClock, Clock, RefreshCw } from 'lucide-react';
import Sheet from '../ui/Sheet.jsx';
import Spinner from '../ui/Spinner.jsx';
import { getAvailability, moveBooking } from '../../api/booking.api.js';
import haptics from '../../utils/haptics.js';
import { useLanguage, useT } from '../../i18n/index.jsx';
import DateChips from './counter/DateChips.jsx';
import { HallBadge, radioTab, rovingKeyDown } from './counter/bits.jsx';
import { compactBatchLabel, fmtDay, lastBookableDay, nextAllowedDay, serverText, toKey } from './counter/counterUtils.js';
import { bookingWhere } from './bookingFixUtils.js';

const QUICK_REASONS = ['Devotee asked', 'Devotee could not come', 'Wrong date or batch entered'];

const Label = ({ htmlFor, children }) => (
  <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">{children}</label>
);

const Notice = ({ tone = 'amber', children, action }) => (
  <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2.5 text-sm ${
    tone === 'red' ? 'border-red-200 bg-red-50 text-red-700' : tone === 'gray' ? 'border-gray-200 bg-gray-50 text-gray-600' : 'border-amber-200 bg-amber-50 text-amber-800'
  }`}>
    <AlertTriangle className="h-4 w-4 shrink-0" />
    <span className="min-w-[10rem] flex-1">{children}</span>
    {action}
  </div>
);

/**
 * Moves a booking to another batch and/or date. The new seat is taken first (a full batch refuses)
 * and gets a new serial; receipt number, amount and payment stay as they were.
 * Mount it only while open. `seva` is the booking's seva type from the booking options (weekdays).
 */
export default function MoveBookingSheet({ booking: b, seva, sevaTypes = [], settings = {}, onClose, onMoved }) {
  const t = useT();
  const { lang } = useLanguage();
  const qc = useQueryClient();
  const [today] = useState(() => toKey());
  const schedule = seva?.schedule || b.schedule;
  const weekdays = schedule === 'slot' ? seva?.weekdays : null;

  // Start on the booking's own day (another batch the same day is the usual ask), or the next open day.
  const [date, setDate] = useState(() => (b.dateKey >= today ? b.dateKey
    : nextAllowedDay(today, weekdays, lastBookableDay(today, settings.maxAdvanceDays)) || today));
  const [picked, setPicked] = useState({}); // date → batch id chosen on that date
  const [showEnded, setShowEnded] = useState(false);
  const [reason, setReason] = useState('');

  const availQ = useQuery({
    queryKey: ['booking-availability', String(b.sevaType), date],
    queryFn: () => getAvailability(String(b.sevaType), date).then((r) => r.data.data),
    enabled: Boolean(date && b.sevaType),
    refetchInterval: 30_000,
    staleTime: 5_000,
    retry: 1,
  });
  const avail = availQ.data;
  const seats = (avail?.capacityUnit || settings.capacityUnit) === 'people' ? Math.max(1, b.peopleCount || 1) : 1;

  const batches = schedule === 'batch' && avail?.open ? avail.batches || [] : [];
  const isCurrent = (x) => date === b.dateKey && String(x._id) === String(b.batch || '');
  const usable = (x) => x && !x.ended && x.left >= seats && !isCurrent(x);
  // On another day, the same batch as now is chosen for them when it has room.
  const sameBatch = date !== b.dateKey ? batches.find((x) => String(x._id) === String(b.batch || '') && usable(x)) : null;
  const batchId = picked[date] ?? sameBatch?._id ?? null;
  const chosen = batches.find((x) => String(x._id) === String(batchId));

  let ready = false;
  if (avail?.open && date) {
    if (schedule === 'batch') ready = usable(chosen);
    else if (schedule === 'slot') ready = date !== b.dateKey && (avail.slot?.left == null || avail.slot.left >= seats);
    else ready = date !== b.dateKey;
  }

  const chooseDate = (key) => { haptics.select(); setDate(key); };
  const pick = (x) => { haptics.select(); setPicked((p) => ({ ...p, [date]: x._id })); };

  const mut = useMutation({
    mutationFn: (body) => moveBooking(b._id, body),
    onSuccess: (res) => { haptics.success(); onMoved(res); },
    onError: (err) => {
      haptics.error();
      const res = err?.response;
      toast.error(serverText(t, res?.data?.message, { sevaTypes, lang }) || t('Failed'), { id: 'booking-move', duration: 6000 });
      if (res?.status === 409 || res?.status === 400) availQ.refetch();
      // Someone else moved it meanwhile: show where it is now.
      if (res?.status === 409) qc.invalidateQueries({ queryKey: ['booking', b._id] });
    },
  });

  const submit = () => {
    if (!ready || mut.isPending) return;
    const body = { date };
    if (schedule === 'batch') body.batch = chosen._id;
    if (reason.trim()) body.reason = reason.trim();
    mut.mutate(body);
  };

  const target = schedule === 'batch'
    ? chosen && [fmtDay(date, lang), compactBatchLabel(chosen.start, chosen.end, chosen.label), chosen.hall].filter(Boolean).join(' · ')
    : date !== b.dateKey && fmtDay(date, lang);

  const footer = (
    <div className="space-y-2">
      {ready && target && (
        <p className="flex items-center gap-1.5 text-xs text-gray-600">
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary-600" />
          <span className="min-w-0">{t('Moving to {where}', { where: target })}{b.serialNo != null && schedule !== 'arrangement' ? ` · ${t('new serial')}` : ''}</span>
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
        <button type="button" onClick={onClose} className="btn-secondary">{t('Cancel')}</button>
        <button type="button" onClick={submit} disabled={!ready || mut.isPending} className="btn-primary">
          {mut.isPending ? <Spinner size="sm" /> : <CalendarClock className="h-4 w-4" />} {mut.isPending ? t('Moving…') : t('Move booking')}
        </button>
      </div>
    </div>
  );

  const ended = batches.filter((x) => x.ended);
  const visible = showEnded ? batches : batches.filter((x) => !x.ended);
  const anySelected = visible.some((x) => String(x._id) === String(batchId));
  const firstEnabled = visible.findIndex(usable);

  return (
    <Sheet open onClose={onClose} title={t('Move booking')} size="lg" footer={footer} full>
      <div className="space-y-4">
        {/* Now */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{t('Booked now for')}</p>
          <p className="mt-0.5 break-words text-sm font-semibold text-gray-900">{bookingWhere(b, lang) || '—'}</p>
          <p className="mt-0.5 text-xs text-gray-500">{t('Receipt number, amount and payment stay the same.')}</p>
        </div>

        <div>
          <Label>{t('New date')}</Label>
          <DateChips seva={seva || { schedule }} today={today} value={date} onChange={chooseDate} maxAdvanceDays={settings.maxAdvanceDays} />
        </div>

        {/* Batch / seats on that date */}
        <div>
          {schedule === 'batch' && <Label>{t('New batch')}</Label>}
          {availQ.isLoading ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-busy="true">
              {Array.from({ length: schedule === 'batch' ? 4 : 1 }, (_, i) => <div key={i} className="h-[58px] animate-pulse rounded-xl bg-gray-100" />)}
            </div>
          ) : availQ.isError ? (
            <Notice tone="red" action={(
              <button type="button" onClick={() => availQ.refetch()} className="min-h-[40px] rounded-lg border border-black/10 bg-white px-3 text-sm font-semibold">{t('Try again')}</button>
            )}>
              {serverText(t, availQ.error?.response?.data?.message, { sevaTypes, lang }) || t('Could not load seats')}
            </Notice>
          ) : !avail ? null : !avail.open ? (
            <Notice>{serverText(t, avail.reason, { sevaTypes, lang })}</Notice>
          ) : schedule === 'slot' ? (
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5">
              <Clock className="h-5 w-5 shrink-0 text-primary-600" />
              <p className="min-w-0 flex-1 text-sm font-semibold text-gray-900">{avail.slot?.label || seva?.slotTime || t('Fixed time')}</p>
              <span className={`shrink-0 text-sm font-bold ${avail.slot?.left != null && avail.slot.left < seats ? 'text-red-600' : 'text-green-700'}`}>
                {avail.slot?.left == null ? t('No limit') : avail.slot.left < seats ? t('Full') : t('{n} left', { n: avail.slot.left })}
              </span>
            </div>
          ) : schedule === 'batch' ? (
            <div className="space-y-2">
              {batches.length === 0 && <Notice tone="gray">{t('No batches are set up for this seva on this day.')}</Notice>}
              {batches.length > 0 && !batches.some(usable) && <Notice tone="red">{t('No other batch has room on this date.')}</Notice>}
              {visible.length > 0 && (
                <div role="radiogroup" aria-label={t('New batch')} onKeyDown={rovingKeyDown} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {visible.map((x, i) => {
                    const current = isCurrent(x);
                    const full = x.left < seats;
                    const disabled = !usable(x);
                    const selected = String(x._id) === String(batchId);
                    return (
                      <button
                        key={x._id} type="button" role="radio" aria-checked={selected} disabled={disabled}
                        tabIndex={disabled ? -1 : radioTab(selected, i === firstEnabled, anySelected)}
                        onClick={() => pick(x)}
                        className={`flex min-h-[58px] flex-col justify-between rounded-xl border-2 px-2.5 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:cursor-not-allowed ${
                          selected ? 'border-primary-500 bg-primary-50 shadow-sm'
                            : current ? 'border-dashed border-gray-300 bg-gray-50'
                              : disabled ? 'border-gray-100 bg-gray-50 opacity-60' : 'border-gray-200 bg-white hover:border-primary-300'
                        }`}
                      >
                        <span className="flex items-center justify-between gap-1">
                          <span className={`text-[13px] font-bold tabular-nums leading-tight ${selected ? 'text-primary-800' : 'text-gray-900'}`}>
                            {compactBatchLabel(x.start, x.end, x.label)}
                          </span>
                          <HallBadge hall={x.hall} />
                        </span>
                        <span className={`mt-1 text-xs font-semibold ${current ? 'text-gray-500' : x.ended ? 'text-gray-400' : full ? 'text-red-500' : 'text-green-700'}`}>
                          {current ? t('Booked now') : x.ended ? t('Finished') : full ? t('Full') : t('{n} left', { n: x.left })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
                {ended.length > 0 && ended.length < batches.length ? (
                  <button type="button" onClick={() => setShowEnded((v) => !v)} className="min-h-[32px] font-medium text-gray-500 underline-offset-2 hover:underline">
                    {showEnded ? t('Hide finished batches') : t('Show {n} finished batches', { n: ended.length })}
                  </button>
                ) : <span />}
                <span className="flex items-center gap-1">
                  <RefreshCw className={`h-3 w-3 ${availQ.isFetching ? 'animate-spin' : ''}`} /> {t('Seats update every 30 s')}
                </span>
              </div>
            </div>
          ) : null}
          {avail?.open && schedule !== 'batch' && date === b.dateKey && (
            <p className="mt-2 text-xs text-gray-500">{t('Choose a different date')}</p>
          )}
        </div>

        <div>
          <Label htmlFor="mb-reason">{t('Reason for the change')} <span className="font-normal normal-case tracking-normal text-gray-400">{t('(optional)')}</span></Label>
          <input id="mb-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="input" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK_REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(t(r))}
                className={`min-h-[36px] rounded-full border px-3 text-xs max-sm:min-h-[40px] ${reason === t(r) ? 'border-primary-400 bg-primary-50 text-primary-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {t(r)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
