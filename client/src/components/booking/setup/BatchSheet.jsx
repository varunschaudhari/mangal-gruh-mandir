import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import Sheet from '../../ui/Sheet.jsx';
import { FormField, FormRow } from '../../ui/FormField.jsx';
import { createBookingBatch, updateBookingBatch } from '../../../api/booking.api.js';
import { useLanguage, useT } from '../../../i18n/index.jsx';
import { hallHeading, hallName, hallTitle } from '../../../utils/halls.js';
import {
  ALL_DAYS, HallChip, SwitchRow, WeekdayChips, batchTime, errText, hallList, hallNamesOf, isEveryDay, lengthText, to12h, toMinutes, useRefreshBookings,
} from './setupUi.jsx';

/** Add / edit a batch. `batch` = the one being edited, or {} for a new one. */
export default function BatchSheet({ batch, onClose, batches = [], halls: hallRows = [], sevaTypes = [], capacityUnit }) {
  const t = useT();
  const { lang } = useLanguage();
  const refresh = useRefreshBookings();
  const isNew = !batch?._id;
  const halls = hallList(batches, hallRows);
  const names = hallNamesOf(hallRows);
  // The halls a batch can be put in: those switched on, plus the one it already has
  const choices = hallRows.filter((h) => h.isActive !== false || h.code === batch?.hall);
  if (batch?.hall && !choices.some((h) => h.code === batch.hall)) choices.push({ code: batch.hall, name: '', isActive: true });
  // New batch: start where the last one ends, in the same hall, with the most common capacity
  const defaults = useMemo(() => {
    if (!isNew) {
      return {
        start: batch.start, end: batch.end, hall: batch.hall, capacity: batch.capacity,
        weekdays: batch.weekdays?.length ? batch.weekdays : [...ALL_DAYS],
        sevaTypes: (batch.sevaTypes || []).map(String), isActive: batch.isActive !== false,
      };
    }
    const counts = {};
    batches.forEach((b) => { counts[b.capacity] = (counts[b.capacity] || 0) + 1; });
    const capacity = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]) || 50;
    return { start: '', end: '', hall: '', capacity, weekdays: [...ALL_DAYS], sevaTypes: [], isActive: true };
  }, [batch, isNew, batches]);

  const { register, handleSubmit, control, watch, setValue, setError, formState: { errors } } = useForm({ defaultValues: defaults });
  const [start, end, hall] = watch(['start', 'end', 'hall']);
  const [onlySome, setOnlySome] = useState(() => Boolean(batch?.sevaTypes?.length));

  // Batch-scheduled sevas can be tied to a batch. Others never use batches.
  const batchSevas = sevaTypes.filter((s) => s.schedule === 'batch');

  // Same hall, overlapping time → probably a mistake (not blocked: two groups can share a big hall)
  const clash = start && end && hall && batches.find((b) => b._id !== batch?._id
    && b.hall === hall
    && toMinutes(b.start) < toMinutes(end) && toMinutes(start) < toMinutes(b.end));

  const mut = useMutation({
    mutationFn: (data) => (isNew ? createBookingBatch(data) : updateBookingBatch(batch._id, data)),
    onSuccess: (_, data) => {
      const label = `${batchTime(data)}, ${hallTitle(data.hall, names, lang)}`;
      toast.success(isNew ? t('Batch {label} added', { label }) : t('Batch {label} saved', { label }));
      refresh();
      onClose();
    },
    onError: (err) => toast.error(errText(t, err)),
  });

  const submit = (v) => {
    if (onlySome && !v.sevaTypes.length) { setError('sevaTypes', { message: t('Tick at least one seva') }); return; }
    save(v);
  };
  const save = (v) => mut.mutate({
    start: v.start,
    end: v.end,
    hall: v.hall,
    capacity: Math.floor(Number(v.capacity)),
    weekdays: isEveryDay(v.weekdays) ? [...ALL_DAYS] : v.weekdays,
    sevaTypes: onlySome ? v.sevaTypes : [],
    isActive: Boolean(v.isActive),
  });

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button type="button" onClick={onClose} className="btn-secondary">{t('Cancel')}</button>
      <button type="submit" form="batch-form" disabled={mut.isPending} className="btn-primary">
        {mut.isPending ? t('Saving…') : t('Save')}
      </button>
    </div>
  );

  return (
    <Sheet open onClose={onClose} title={isNew ? t('Add batch') : t('Edit batch')} size="lg" footer={footer} full>
      <form id="batch-form" onSubmit={handleSubmit(submit)} className="space-y-5" noValidate>
        <div>
          <FormRow>
            <FormField label={t('Starts at')} required error={errors.start?.message}>
              <input type="time" className="input" {...register('start', { required: t('{label} is required', { label: t('Starts at') }) })} />
            </FormField>
            <FormField label={t('Ends at')} required error={errors.end?.message}>
              <input
                type="time" className="input"
                {...register('end', {
                  required: t('{label} is required', { label: t('Ends at') }),
                  validate: (v, all) => !all.start || toMinutes(v) > toMinutes(all.start) || t('The end time must be after the start time'),
                })}
              />
            </FormField>
          </FormRow>
          {start && end && toMinutes(end) > toMinutes(start) && (
            <p className="mt-1.5 text-sm text-gray-500">{to12h(start)} – {to12h(end)} · {lengthText(t, start, end)}</p>
          )}
        </div>

        <FormRow>
          <FormField label={t('Hall')} required error={errors.hall?.message}>
            <input type="hidden" {...register('hall', { validate: (v) => Boolean(v) || t('Choose a hall') })} />
            {choices.length > 0 ? (
              <div className="flex flex-col gap-1.5" role="radiogroup" aria-label={t('Hall')}>
                {choices.map((h) => (
                  <button
                    key={h.code} type="button" role="radio" aria-checked={hall === h.code}
                    onClick={() => setValue('hall', h.code, { shouldValidate: true, shouldDirty: true })}
                    className={`flex min-h-[44px] items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left text-sm sm:min-h-[38px] ${hall === h.code ? 'border-primary-500 bg-primary-50 text-primary-800' : 'border-gray-200 text-gray-700 hover:border-gray-300'}`}
                  >
                    <HallChip hall={h.code} halls={halls} />
                    <span className="min-w-0 truncate font-medium">{hallName(h.code, names, lang) || <span className="text-gray-400">{t('No name yet')}</span>}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                {t('No halls yet.')} <Link to="?tab=halls" onClick={onClose} className="font-medium underline">{t('Add a hall first')}</Link>
              </p>
            )}
          </FormField>
          <FormField
            label={capacityUnit === 'people' ? t('Seats (people)') : t('Seats (bookings)')} required error={errors.capacity?.message}
            hint={capacityUnit === 'people' ? t('How many people this batch can take') : t('How many bookings this batch can take')}
          >
            <input
              type="number" inputMode="numeric" min={1} step={1} className="input w-32"
              {...register('capacity', {
                required: t('{label} is required', { label: t('Seats') }),
                validate: (v) => (Number.isInteger(Number(v)) && Number(v) >= 1) || t('Enter a whole number of 1 or more'),
              })}
            />
          </FormField>
        </FormRow>

        {clash && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {t('{hall} already has a batch at {time}. Save anyway only if both groups fit in the hall.', { hall: hallHeading(t, clash.hall, names, lang), time: batchTime(clash) })}
          </p>
        )}

        <FormField label={t('Days')} hint={t('Untick the days when this batch is not held')}>
          <Controller name="weekdays" control={control} render={({ field }) => <WeekdayChips value={field.value} onChange={field.onChange} />} />
        </FormField>

        <fieldset>
          <legend className="label">{t('Which sevas can be booked in this batch?')}</legend>
          <div className="space-y-2">
            <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-gray-200 px-3 py-2">
              <input type="radio" className="h-5 w-5" checked={!onlySome} onChange={() => setOnlySome(false)} />
              <span className="text-sm text-gray-700">
                {t('All batch sevas')}
                <span className="block text-xs text-gray-400">{batchSevas.map((s) => s.name).join(', ')}</span>
              </span>
            </label>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-gray-200 px-3 py-2">
              <input type="radio" className="h-5 w-5" checked={onlySome} onChange={() => setOnlySome(true)} />
              <span className="text-sm text-gray-700">{t('Only the sevas I tick')}</span>
            </label>
            {onlySome && (
              <Controller
                name="sevaTypes" control={control}
                render={({ field }) => (
                  <div className="ml-4 space-y-1 border-l-2 border-gray-100 pl-3">
                    {batchSevas.length === 0 && <p className="text-sm text-gray-400">{t('No seva is booked in batches yet.')}</p>}
                    {batchSevas.map((s) => {
                      const on = field.value.includes(String(s._id));
                      return (
                        <label key={s._id} className="flex min-h-[44px] cursor-pointer items-center gap-3 sm:min-h-[36px]">
                          <input
                            type="checkbox" className="h-5 w-5 rounded" checked={on}
                            onChange={() => field.onChange(on ? field.value.filter((id) => id !== String(s._id)) : [...field.value, String(s._id)])}
                          />
                          <span className={`text-sm ${s.isActive ? 'text-gray-700' : 'text-gray-400'}`}>
                            {s.name}{!s.isActive && ` (${t('Inactive')})`}
                          </span>
                        </label>
                      );
                    })}
                    {errors.sevaTypes?.message && <p className="text-xs text-red-500">{errors.sevaTypes.message}</p>}
                  </div>
                )}
              />
            )}
          </div>
        </fieldset>

        <Controller
          name="isActive" control={control}
          render={({ field }) => (
            <SwitchRow
              label={t('Active')} hint={t('Switched off, the counter stops offering this batch. Old bookings stay.')}
              checked={field.value} onChange={field.onChange}
            />
          )}
        />
      </form>
    </Sheet>
  );
}
