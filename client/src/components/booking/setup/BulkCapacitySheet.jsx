import { useState } from 'react';
import toast from 'react-hot-toast';
import Sheet from '../../ui/Sheet.jsx';
import { FormField } from '../../ui/FormField.jsx';
import { updateBookingBatch } from '../../../api/booking.api.js';
import { useT } from '../../../i18n/index.jsx';
import { batchTime, errText, hallList, useRefreshBookings } from './setupUi.jsx';

/**
 * Sets one capacity on many batches — the selected ones, one hall, or all — by saving
 * each batch in turn, with progress. Batches already at that number are skipped.
 */
export default function BulkCapacitySheet({ batches, selectedIds, capacityUnit, onClose, onDone }) {
  const t = useT();
  const refresh = useRefreshBookings();
  const halls = hallList(batches);
  const [scope, setScope] = useState(selectedIds.length ? 'selected' : 'active');
  const [value, setValue] = useState('');
  const [progress, setProgress] = useState(null); // { done, total }
  const running = Boolean(progress);

  const targets = (() => {
    if (scope === 'selected') return batches.filter((b) => selectedIds.includes(b._id));
    if (scope === 'active') return batches.filter((b) => b.isActive);
    if (scope === 'all') return batches;
    return batches.filter((b) => b.hall === scope.slice(5)); // 'hall:H1'
  })();

  const n = Number(value);
  const valid = Number.isInteger(n) && n >= 1 && String(value).trim() !== '';

  const run = async () => {
    const todo = targets.filter((b) => b.capacity !== n);
    const failed = [];
    setProgress({ done: 0, total: todo.length });
    for (const [i, b] of todo.entries()) {
      try { await updateBookingBatch(b._id, { capacity: n }); } catch (err) { failed.push(`${batchTime(b)} ${b.hall}: ${errText(t, err)}`); }
      setProgress({ done: i + 1, total: todo.length });
    }
    await refresh();
    setProgress(null);
    if (failed.length) {
      toast.error(`${t('{n} batches could not be saved', { n: failed.length })}\n${failed.slice(0, 4).join('\n')}`, { duration: 8000 });
      return;
    }
    toast.success(t('Seats set to {n} for {count} batches', { n, count: targets.length }));
    onDone?.();
    onClose();
  };

  const options = [
    selectedIds.length > 0 && { id: 'selected', label: t('Ticked batches'), count: selectedIds.length },
    { id: 'active', label: t('All active batches'), count: batches.filter((b) => b.isActive).length },
    batches.some((b) => !b.isActive) && { id: 'all', label: t('All batches, including switched-off ones'), count: batches.length },
    ...halls.map((h) => ({ id: `hall:${h}`, label: t('Every batch in hall {hall}', { hall: h }), count: batches.filter((b) => b.hall === h).length })),
  ].filter(Boolean);

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button type="button" onClick={onClose} disabled={running} className="btn-secondary">{t('Cancel')}</button>
      <button type="button" onClick={run} disabled={!valid || running || !targets.length} className="btn-primary">
        {running
          ? t('Saving {done} of {total}…', progress)
          : valid ? t('Set {n} seats for {count} batches', { n, count: targets.length }) : t('Set seats')}
      </button>
    </div>
  );

  return (
    <Sheet open onClose={running ? undefined : onClose} title={t('Set seats for many batches')} size="md" footer={footer}>
      <div className="space-y-5">
        <FormField
          label={capacityUnit === 'people' ? t('Seats (people)') : t('Seats (bookings)')}
          hint={capacityUnit === 'people' ? t('How many people one batch can take') : t('How many bookings one batch can take')}
        >
          <input
            type="number" inputMode="numeric" min={1} step={1} autoFocus value={value} disabled={running}
            onChange={(e) => setValue(e.target.value)} className="input w-32 text-lg font-semibold"
            onKeyDown={(e) => { if (e.key === 'Enter' && valid && !running) run(); }}
          />
        </FormField>

        <fieldset>
          <legend className="label">{t('Apply to')}</legend>
          <div className="space-y-2">
            {options.map((o) => (
              <label key={o.id} className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 ${scope === o.id ? 'border-primary-500 bg-primary-50/60' : 'border-gray-200'}`}>
                <input type="radio" name="bulk-scope" className="h-5 w-5" checked={scope === o.id} disabled={running} onChange={() => setScope(o.id)} />
                <span className="flex-1 text-sm text-gray-700">{o.label}</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{o.count}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {running && (
          <div aria-live="polite">
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full bg-primary-600 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 100}%` }} />
            </div>
            <p className="mt-1 text-xs text-gray-500">{t('Saving {done} of {total}…', progress)}</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}
