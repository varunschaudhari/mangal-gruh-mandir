import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { CalendarX2, Plus, RotateCcw, TriangleAlert, X } from 'lucide-react';
import Sheet from '../../ui/Sheet.jsx';
import { ConfirmModal } from '../../ui/Modal.jsx';
import { FormField } from '../../ui/FormField.jsx';
import { createClosure, deleteClosure } from '../../../api/booking.api.js';
import { fDate, localDateStr } from '../../../utils/formatters.js';
import { useT } from '../../../i18n/index.jsx';
import { errText, useRefreshBookings } from './setupUi.jsx';

const longDate = (key) => fDate(key, 'EEE, dd MMM yyyy');

function AddClosureSheet({ sevaTypes, closures, onClose, onAdded }) {
  const t = useT();
  const refresh = useRefreshBookings();
  const today = localDateStr();
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [onlySome, setOnlySome] = useState(false);
  const [chosen, setChosen] = useState([]);
  const [tried, setTried] = useState(false);

  // Sevas with a date ("No date" sevas never land on a day, so closing doesn't apply)
  const dated = sevaTypes.filter((s) => s.schedule !== 'none' && s.isActive);
  const alreadyClosed = date && closures.some((c) => c.date === date && !c.sevaTypes?.length);
  const dateError = tried && (!date ? t('Choose a date') : date < today ? t('Choose today or a later date') : '');
  const sevaError = tried && onlySome && !chosen.length ? t('Tick at least one seva') : '';

  const mut = useMutation({
    mutationFn: () => createClosure({ date, reason: reason.trim(), sevaTypes: onlySome ? chosen : [] }),
    onSuccess: (res) => {
      const saved = res.data.data;
      toast.success(t('Bookings closed on {date}', { date: longDate(date) }));
      refresh();
      onAdded(saved);
      onClose();
    },
    onError: (err) => toast.error(errText(t, err)),
  });

  const submit = (e) => {
    e.preventDefault();
    setTried(true);
    if (!date || date < today || (onlySome && !chosen.length)) return;
    mut.mutate();
  };

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button type="button" onClick={onClose} className="btn-secondary">{t('Cancel')}</button>
      <button type="submit" form="closure-form" disabled={mut.isPending} className="btn-primary">
        {mut.isPending ? t('Saving…') : t('Close this date')}
      </button>
    </div>
  );

  return (
    <Sheet open onClose={onClose} title={t('Close a date for bookings')} size="md" footer={footer}>
      <form id="closure-form" onSubmit={submit} className="space-y-5" noValidate>
        <FormField label={t('Date')} required error={dateError} hint={date ? longDate(date) : undefined}>
          <input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className="input" />
        </FormField>
        {alreadyClosed && <p className="-mt-3 text-xs text-amber-700">{t('This date is already closed for all sevas.')}</p>}

        <FormField label={t('Reason')} hint={t('The counter sees this when they pick the date')}>
          <input value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} className="input" placeholder={t('e.g. {example}', { example: t('Grahan (eclipse)') })} />
        </FormField>

        <fieldset>
          <legend className="label">{t('Closed for')}</legend>
          <div className="space-y-2">
            <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-gray-200 px-3 py-2">
              <input type="radio" className="h-5 w-5" checked={!onlySome} onChange={() => setOnlySome(false)} />
              <span className="text-sm text-gray-700">{t('All sevas')}</span>
            </label>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-gray-200 px-3 py-2">
              <input type="radio" className="h-5 w-5" checked={onlySome} onChange={() => setOnlySome(true)} />
              <span className="text-sm text-gray-700">{t('Only the sevas I tick')}</span>
            </label>
            {onlySome && (
              <div className="ml-4 space-y-1 border-l-2 border-gray-100 pl-3">
                {dated.map((s) => {
                  const on = chosen.includes(s._id);
                  return (
                    <label key={s._id} className="flex min-h-[44px] cursor-pointer items-center gap-3 sm:min-h-[36px]">
                      <input type="checkbox" className="h-5 w-5 rounded" checked={on} onChange={() => setChosen(on ? chosen.filter((id) => id !== s._id) : [...chosen, s._id])} />
                      <span className="text-sm text-gray-700">{s.name}</span>
                    </label>
                  );
                })}
                {sevaError && <p className="text-xs text-red-500">{sevaError}</p>}
              </div>
            )}
          </div>
        </fieldset>
        <p className="text-xs text-gray-400">{t('Bookings already made for this date are not cancelled.')}</p>
      </form>
    </Sheet>
  );
}

export default function ClosuresTab({ setup, canManage }) {
  const t = useT();
  const refresh = useRefreshBookings();
  const { closures, sevaTypes } = setup;
  const today = localDateStr();
  const [adding, setAdding] = useState(false);
  const [toReopen, setToReopen] = useState(null);
  const [notice, setNotice] = useState(null); // { date, n } — bookings already on a newly closed date

  const upcoming = closures.filter((c) => c.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = closures.filter((c) => c.date < today).sort((a, b) => b.date.localeCompare(a.date));

  const sevaNames = (c) => (c.sevaTypes?.length
    ? c.sevaTypes.map((id) => sevaTypes.find((s) => String(s._id) === String(id))?.name).filter(Boolean).join(', ')
    : t('All sevas'));

  const reopenMut = useMutation({
    mutationFn: (c) => deleteClosure(c._id),
    onSuccess: (_, c) => {
      toast.success(t('{date} is open for bookings again', { date: longDate(c.date) }));
      if (notice?.date === c.date) setNotice(null);
      refresh();
      setToReopen(null);
    },
    onError: (err) => toast.error(errText(t, err)),
  });

  const row = (c, isPast) => {
    const d = new Date(`${c.date}T00:00:00`);
    return (
      <li key={c._id} className={`flex items-center gap-3 px-3 py-2.5 sm:px-4 ${isPast ? 'text-gray-400' : ''}`}>
        <div className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg leading-none ${isPast ? 'bg-gray-100' : 'bg-red-50 text-red-700'}`}>
          <span className="text-lg font-bold">{fDate(c.date, 'd')}</span>
          <span className="text-[11px] font-medium uppercase">{fDate(c.date, 'MMM')}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${isPast ? '' : 'text-gray-900'}`}>
            {fDate(c.date, 'EEEE')}{d.getFullYear() !== new Date().getFullYear() && ` ${d.getFullYear()}`}
            {c.date === today && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">{t('Today')}</span>}
          </p>
          <p className={`truncate text-sm ${isPast ? '' : 'text-gray-600'}`}>{c.reason || t('No reason given')}</p>
          <p className="truncate text-xs text-gray-400">{sevaNames(c)}</p>
        </div>
        {canManage && !isPast && (
          <button type="button" onClick={() => setToReopen(c)} className="btn-secondary h-11 shrink-0 px-3 sm:h-9">
            <RotateCcw className="h-4 w-4" /><span className="max-[380px]:sr-only">{t('Reopen')}</span>
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500">{t('On a closed date the counter cannot book the sevas it is closed for.')}</p>
        {canManage && (
          <button type="button" onClick={() => setAdding(true)} className="btn-primary max-sm:w-full">
            <Plus className="h-4 w-4" />{t('Close a date')}
          </button>
        )}
      </div>

      {notice && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {notice.n === 1
                  ? t('1 booking already made for {date} still stands.', { date: longDate(notice.date) })
                  : t('{n} bookings already made for {date} still stand.', { n: notice.n, date: longDate(notice.date) })}
            </p>
            <p className="mt-0.5 text-amber-800">{t('Closing a date does not cancel them. Call these devotees if the puja cannot happen.')}</p>
            <Link to={`/bookings/day?date=${notice.date}`} className="mt-1 inline-block font-medium text-amber-900 underline">{t('See them in the day sheet')}</Link>
          </div>
          <button type="button" onClick={() => setNotice(null)} className="btn-ghost -m-1 h-11 w-11 p-0 text-amber-700" aria-label={t('Dismiss')}><X className="h-4 w-4" /></button>
        </div>
      )}

      <section className="card overflow-hidden">
        <h3 className="border-b border-gray-100 px-3 py-2.5 text-sm font-semibold text-gray-800 sm:px-4">{t('Upcoming closed dates')}</h3>
        {upcoming.length ? (
          <ul className="divide-y divide-gray-100">{upcoming.map((c) => row(c, false))}</ul>
        ) : (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            <CalendarX2 className="mx-auto mb-1 h-6 w-6" />{t('No closed dates ahead. Bookings are open every day.')}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="card overflow-hidden opacity-80">
          <h3 className="border-b border-gray-100 px-3 py-2.5 text-sm font-semibold text-gray-500 sm:px-4">{t('Past 30 days')}</h3>
          <ul className="divide-y divide-gray-100">{past.map((c) => row(c, true))}</ul>
        </section>
      )}

      {adding && (
        <AddClosureSheet
          sevaTypes={sevaTypes} closures={closures} onClose={() => setAdding(false)}
          onAdded={(saved) => setNotice(saved.existingBookings > 0
            ? { date: saved.date, n: saved.existingBookings }
            : null)}
        />
      )}

      <ConfirmModal
        open={Boolean(toReopen)} onClose={() => setToReopen(null)}
        onConfirm={() => reopenMut.mutate(toReopen)} loading={reopenMut.isPending}
        title={/*t*/ 'Reopen this date?'}
        message={toReopen && t('Bookings for {date} can be taken again at the counter.', { date: longDate(toReopen.date) })}
        confirmLabel="Reopen" confirmClass="btn-primary"
      />
    </div>
  );
}
