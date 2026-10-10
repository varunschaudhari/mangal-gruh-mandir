import { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Info } from 'lucide-react';
import Sheet from '../../ui/Sheet.jsx';
import { FormField, FormRow } from '../../ui/FormField.jsx';
import { createSevaType, updateSevaType } from '../../../api/booking.api.js';
import { useT } from '../../../i18n/index.jsx';
import {
  ALL_DAYS, SCHEDULES, SwitchRow, WeekdayChips, errText, isEveryDay, useRefreshBookings,
} from './setupUi.jsx';

const EMPTY = {
  name: '', nameMr: '', code: '', description: '', price: '', schedule: 'batch', duration: '',
  slotTime: '', weekdays: [...ALL_DAYS], dailyLimit: 0, maxPeople: 0, needsPostalAddress: false,
  isActive: true, sortOrder: 0,
};

/** Add / edit a seva type. `seva` = the one being edited, or {} for a new one. */
export default function SevaTypeSheet({ seva, onClose, batches = [], capacityUnit, nextSortOrder = 0 }) {
  const t = useT();
  const refresh = useRefreshBookings();
  const isNew = !seva?._id;

  const defaultValues = useMemo(() => (isNew
    ? { ...EMPTY, sortOrder: nextSortOrder }
    : { ...EMPTY, ...seva, price: seva.price ?? '', weekdays: seva.weekdays?.length ? seva.weekdays : [...ALL_DAYS] }
  ), [seva, isNew, nextSortOrder]);

  const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm({ defaultValues });
  const schedule = watch('schedule');

  const mut = useMutation({
    mutationFn: (data) => (isNew ? createSevaType(data) : updateSevaType(seva._id, data)),
    onSuccess: (_, data) => {
      toast.success(isNew ? t('"{name}" added', { name: data.name }) : t('"{name}" saved', { name: data.name }));
      refresh();
      onClose();
    },
    onError: (err) => toast.error(errText(t, err)),
  });

  const submit = (v) => {
    const slot = v.schedule === 'slot';
    mut.mutate({
      name: v.name.trim(),
      nameMr: v.nameMr.trim(),
      code: v.code.trim().toUpperCase(),
      description: v.description.trim(),
      price: Number(v.price),
      schedule: v.schedule,
      duration: v.schedule === 'none' ? '' : v.duration.trim(),
      slotTime: slot ? v.slotTime.trim() : '',
      weekdays: slot && !isEveryDay(v.weekdays) ? v.weekdays : [...ALL_DAYS],
      dailyLimit: slot ? Math.max(0, Math.floor(Number(v.dailyLimit) || 0)) : 0,
      maxPeople: Math.max(0, Math.floor(Number(v.maxPeople) || 0)),
      needsPostalAddress: Boolean(v.needsPostalAddress),
      isActive: Boolean(v.isActive),
      sortOrder: Math.floor(Number(v.sortOrder) || 0),
    });
  };

  // Batches this seva can be booked into (an empty seva list on a batch = every batch seva)
  const usableBatches = batches.filter((b) => b.isActive
    && (!b.sevaTypes?.length || (!isNew && b.sevaTypes.some((id) => String(id) === String(seva._id))))).length;

  const required = (label) => ({ required: t('{label} is required', { label }) });
  const wholeNumber = { min: { value: 0, message: t('Enter 0 or more') }, validate: (v) => Number.isInteger(Number(v)) || t('Enter a whole number') };

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button type="button" onClick={onClose} className="btn-secondary">{t('Cancel')}</button>
      <button type="submit" form="seva-type-form" disabled={mut.isPending} className="btn-primary">
        {mut.isPending ? t('Saving…') : t('Save')}
      </button>
    </div>
  );

  return (
    <Sheet open onClose={onClose} title={isNew ? t('Add seva type') : t('Edit seva type')} size="lg" footer={footer} full>
      <form id="seva-type-form" onSubmit={handleSubmit(submit)} className="space-y-5" noValidate>
        <FormRow>
          <FormField label={t('Name')} required error={errors.name?.message}>
            <input {...register('name', { ...required(t('Name')), validate: (v) => Boolean(v.trim()) || t('{label} is required', { label: t('Name') }) })} className="input" placeholder={t('e.g. {example}', { example: 'Abhishek' })} autoComplete="off" />
          </FormField>
          <FormField label={t('Name in Marathi')} hint={t('Shown on the Marathi screen')}>
            <input {...register('nameMr')} className="input" placeholder="उदा. अभिषेक" lang="mr" autoComplete="off" />
          </FormField>
        </FormRow>

        <FormRow>
          <FormField label={t('Price (₹)')} required error={errors.price?.message}>
            <input
              type="number" inputMode="numeric" min={1} step={1} className="input"
              {...register('price', {
                required: t('{label} is required', { label: t('Price') }),
                min: { value: 1, message: t('The price must be at least ₹1') },
              })}
            />
          </FormField>
          <FormField label={t('Short code')} hint={t('Up to 8 letters, e.g. ABH — used in lists and reports')} error={errors.code?.message}>
            <input
              {...register('code', { maxLength: { value: 8, message: t('Up to 8 letters') } })}
              maxLength={8} className="input uppercase" autoComplete="off" autoCapitalize="characters"
            />
          </FormField>
        </FormRow>

        <FormField label={t('Description')} hint={t('What is done — helps the counter staff explain it to devotees')}>
          <textarea {...register('description')} rows={2} className="input" />
        </FormField>

        {/* ── How it is booked ── */}
        <fieldset>
          <legend className="label">{t('How is it booked?')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(SCHEDULES).map(([key, s]) => (
              <label
                key={key}
                className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${schedule === key ? 'border-primary-500 bg-primary-50/60 ring-1 ring-primary-500' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <input
                  type="radio" value={key} className="mt-0.5 h-5 w-5 shrink-0"
                  {...register('schedule', { onChange: (e) => { if (e.target.value === 'none') setValue('needsPostalAddress', true); } })}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-gray-800">{t(s.label)}</span>
                  <span className="block text-xs leading-snug text-gray-500">{t(s.hint)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {schedule === 'batch' && (
          <p className="flex items-start gap-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {isNew
                ? t('After saving, it can be booked into every batch that is open to all batch sevas ({n} now). To limit it to certain batches, choose it in the Batches tab.', { n: usableBatches })
                : t('It can be booked into {n} active batches. Times, halls and seats are set in the Batches tab.', { n: usableBatches })}
            </span>
          </p>
        )}

        {schedule === 'slot' && (
          <div className="space-y-4 rounded-xl border border-purple-200 bg-purple-50/40 p-3">
            <FormField label={t('Time')} required hint={t('Printed on the receipt as written')} error={errors.slotTime?.message}>
              <input
                {...register('slotTime', { validate: (v) => schedule !== 'slot' || Boolean(v.trim()) || t('{label} is required', { label: t('Time') }) })}
                className="input" placeholder={t('e.g. {example}', { example: '5:00 AM – 7:00 AM' })} autoComplete="off"
              />
            </FormField>
            <FormField label={t('Done on')} error={errors.weekdays?.message}>
              <Controller
                name="weekdays" control={control}
                render={({ field }) => <WeekdayChips value={field.value} onChange={field.onChange} />}
              />
            </FormField>
            <FormField
              label={capacityUnit === 'people' ? t('People per day') : t('Bookings per day')}
              hint={t('0 = no limit. Panchamrit Abhishek, for example, is one family a day.')}
              error={errors.dailyLimit?.message}
            >
              <input type="number" inputMode="numeric" min={0} step={1} className="input w-32" {...register('dailyLimit', wholeNumber)} />
            </FormField>
          </div>
        )}

        {schedule === 'arrangement' && (
          <p className="flex items-start gap-2 rounded-xl bg-orange-50 p-3 text-sm text-orange-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            {t('The counter enters the date agreed with the devotee. Any number of bookings can be taken for a date.')}
          </p>
        )}

        <FormRow>
          {schedule !== 'none' && (
            <FormField label={t('Duration')} hint={t('Shown to staff, e.g. 1 hour')}>
              <input {...register('duration')} className="input" autoComplete="off" />
            </FormField>
          )}
          <FormField label={t('Most people per booking')} hint={t('0 = no limit')} error={errors.maxPeople?.message}>
            <input type="number" inputMode="numeric" min={0} step={1} className="input w-32" {...register('maxPeople', wholeNumber)} />
          </FormField>
        </FormRow>

        <div className="space-y-2">
          <Controller
            name="needsPostalAddress" control={control}
            render={({ field }) => (
              <SwitchRow
                label={t('Postal address needed')}
                hint={t('The counter must take the devotee\'s address, e.g. to post the prasad.')}
                checked={field.value} onChange={field.onChange}
              />
            )}
          />
          <Controller
            name="isActive" control={control}
            render={({ field }) => (
              <SwitchRow
                label={t('Active')}
                hint={t('Switched off, it is hidden from the counter. Old bookings stay.')}
                checked={field.value} onChange={field.onChange}
              />
            )}
          />
        </div>

        <FormField label={t('Position in the list')} hint={t('Smaller numbers come first at the counter')}>
          <input type="number" inputMode="numeric" step={1} className="input w-32" {...register('sortOrder')} />
        </FormField>
      </form>
    </Sheet>
  );
}
