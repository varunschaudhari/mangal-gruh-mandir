import { useEffect, useState } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2, Package } from 'lucide-react';
import { getSuppliers, getSupplier } from '../../api/supplier.api.js';
import { getDepartments } from '../../api/department.api.js';
import { createPurchaseEntry } from '../../api/purchaseEntry.api.js';
import ProductSearchSelect from '../../components/transactions/ProductSearchSelect.jsx';
import SearchableSelect from '../../components/ui/SearchableSelect.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StickyActionBar from '../../components/ui/StickyActionBar.jsx';
import haptics from '../../utils/haptics.js';
import toast from 'react-hot-toast';
import { localDateStr } from '../../utils/formatters.js';
import { useT } from '../../i18n/index.jsx';

const today = () => localDateStr();

function addDays(dateStr, days) {
  if (!dateStr || !days) return '';
  const d = new Date(dateStr);
  d.setDate(d.getDate() + Number(days));
  return localDateStr(d);
}

const emptyItem = () => ({ product: '', quantity: '', rate: '', expiryDate: '', batchRef: '' });

const fieldLabel = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5';

export default function NewPurchaseEntry() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const t = useT();
  // Unit symbol per item row (keyed by field id), only for display next to the quantity.
  const [rowUnits, setRowUnits] = useState({});

  const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm({
    defaultValues: {
      supplier:      '',
      invoiceNumber: '',
      invoiceDate:   today(),
      receivedDate:  today(),
      dueDate:       '',
      toDepartment:  '',
      notes:         '',
      items: [emptyItem()],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchedItems = watch('items');
  const supplierId   = watch('supplier');
  const invoiceDate  = watch('invoiceDate');

  const { data: supRes } = useQuery({
    queryKey: ['suppliers-all'],
    queryFn:  () => getSuppliers({ type: 'vendor' }),
  });
  const suppliers = supRes?.data?.data || [];

  const { data: selSupRes } = useQuery({
    queryKey: ['supplier', supplierId],
    queryFn:  () => getSupplier(supplierId),
    enabled:  !!supplierId,
  });
  const selectedSupplier = selSupRes?.data?.data;

  const { data: deptsRes } = useQuery({
    queryKey: ['departments'],
    queryFn:  () => getDepartments(),
  });
  const departments = deptsRes?.data?.data || [];

  // Auto-compute due date when supplier or invoice date changes
  useEffect(() => {
    if (selectedSupplier?.creditDays && invoiceDate) {
      setValue('dueDate', addDays(invoiceDate, selectedSupplier.creditDays));
    }
  }, [supplierId, invoiceDate, selectedSupplier?.creditDays]);

  const grandTotal = watchedItems.reduce((sum, item) => {
    return sum + (Number(item.quantity) || 0) * (Number(item.rate) || 0);
  }, 0);

  const mutation = useMutation({
    mutationFn: createPurchaseEntry,
    onSuccess: (res) => {
      haptics.success();
      toast.success(t('Purchase entry created'));
      qc.invalidateQueries({ queryKey: ['purchase-entries'] });
      qc.invalidateQueries({ queryKey: ['supplier-invoices'] });
      navigate(`/purchases/${res.data.data._id}`);
    },
    onError: (e) => {
      haptics.error();
      toast.error(e.response?.data?.message || t('Failed to create entry'));
    },
  });

  const onSubmit = (data) => {
    const payload = {
      supplier:      data.supplier,
      invoiceNumber: data.invoiceNumber || undefined,
      invoiceDate:   data.invoiceDate   || undefined,
      receivedDate:  data.receivedDate,
      dueDate:       data.dueDate       || undefined,
      toDepartment:  data.toDepartment,
      notes:         data.notes         || undefined,
      items: data.items.map((item) => ({
        product:    item.product,
        quantity:   Number(item.quantity),
        rate:       Number(item.rate) || 0,
        expiryDate: item.expiryDate || undefined,
        batchRef:   item.batchRef   || undefined,
      })),
    };
    mutation.mutate(payload);
  };

  const fmtAmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

  return (
    <div className="max-w-4xl">
      {/* Below lg the app bar already has a back arrow. Kept outside the spaced stack so
          the hidden link doesn't leave a gap above the page on phones. */}
      <div className="hidden lg:block mb-4">
        <button onClick={() => navigate('/purchases')}
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
          <ArrowLeft className="h-4 w-4" /> {t('Purchase Register')}
        </button>
      </div>

      <div className="space-y-4">
        <PageHeader
          title="New Purchase Entry"
          subtitle="Record a purchase invoice with line items"
          breadcrumbs={[{ label: 'Purchases', to: '/purchases' }, { label: 'New Entry' }]}
        />

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

          {/* ── Invoice Details ── */}
          <div className="card p-4 sm:p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">{t('Invoice Details')}</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={fieldLabel}>{t('Supplier')} *</label>
                <Controller
                  name="supplier"
                  control={control}
                  rules={{ required: t('Required') }}
                  render={({ field }) => (
                    <SearchableSelect
                      value={field.value || ''}
                      onChange={field.onChange}
                      options={suppliers.map((s) => ({ value: s._id, label: s.name }))}
                      placeholder={t('Select supplier…')}
                      error={errors.supplier?.message}
                    />
                  )}
                />
                {errors.supplier && <p className="mt-1 text-xs text-red-500">{errors.supplier.message}</p>}
                {selectedSupplier?.creditDays && (
                  <p className="mt-1 text-xs text-gray-400">{t('Credit: {n} days', { n: selectedSupplier.creditDays })}</p>
                )}
              </div>

              <div>
                <label className={fieldLabel}>{t('Department')} *</label>
                <Controller
                  name="toDepartment"
                  control={control}
                  rules={{ required: t('Required') }}
                  render={({ field }) => (
                    <SearchableSelect
                      value={field.value || ''}
                      onChange={field.onChange}
                      options={departments.map((d) => ({ value: d._id, label: d.name }))}
                      placeholder={t('Select department…')}
                      error={errors.toDepartment?.message}
                    />
                  )}
                />
                {errors.toDepartment && <p className="mt-1 text-xs text-red-500">{errors.toDepartment.message}</p>}
              </div>

              <div>
                <label className={fieldLabel}>{t('Invoice Number')}</label>
                <input {...register('invoiceNumber')} className="input font-mono" placeholder={t('e.g. {example}', { example: 'INV-2025-001' })} autoCapitalize="characters" />
              </div>

              <div>
                <label className={fieldLabel}>{t('Invoice Date')}</label>
                <input {...register('invoiceDate')} type="date" className="input" />
              </div>

              <div>
                <label className={fieldLabel}>{t('Received Date')} *</label>
                <input {...register('receivedDate', { required: t('Required') })} type="date" className="input" />
                {errors.receivedDate && <p className="mt-1 text-xs text-red-500">{errors.receivedDate.message}</p>}
              </div>

              <div>
                <label className={fieldLabel}>{t('Due Date')}</label>
                <input {...register('dueDate')} type="date" className="input" />
                {selectedSupplier?.creditDays && (
                  <p className="mt-1 text-xs text-gray-400">{t('Auto-set from {n}-day credit term', { n: selectedSupplier.creditDays })}</p>
                )}
              </div>
            </div>

            <div>
              <label className={fieldLabel}>{t('Notes')}</label>
              <textarea {...register('notes')} rows={2} className="input" placeholder={t('Optional notes')} />
            </div>
          </div>

          {/* ── Line Items ── */}
          <div className="card p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">
                {t('Items Received')}
                <span className="ml-1.5 font-normal text-gray-400 sm:hidden">({fields.length})</span>
              </h3>
              <button
                type="button"
                onClick={() => append(emptyItem())}
                className="btn-secondary text-xs hidden sm:flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> {t('Add Item')}
              </button>
            </div>

            {/* Column headers — desktop only */}
            <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              <div className="col-span-4">{t('Product')}</div>
              <div className="col-span-2">{t('Qty')}</div>
              <div className="col-span-2">{t('Rate (₹)')}</div>
              <div className="col-span-2">{t('Total')}</div>
              <div className="col-span-2"></div>
            </div>

            {/* Phones: each line is a card (header · product · qty/rate · batch · expiry · amount).
                From `sm` up the same inputs fall into the 12-column row layout. */}
            {fields.map((field, idx) => {
              const qty   = Number(watchedItems[idx]?.quantity) || 0;
              const rate  = Number(watchedItems[idx]?.rate)     || 0;
              const total = qty * rate;
              const unitSymbol = rowUnits[field.id];

              return (
                <div key={field.id} className="bg-orange-50 rounded-lg p-3 border border-orange-100 space-y-3 sm:space-y-2">

                  {/* Phone card header */}
                  <div className="flex items-center justify-between sm:hidden">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Item {n}', { n: idx + 1 })}</span>
                    <button
                      type="button"
                      onClick={() => remove(idx)}
                      disabled={fields.length === 1}
                      aria-label={t('Remove item {n}', { n: idx + 1 })}
                      className="-my-1 -mr-1.5 rounded-md p-2 text-red-400 active:bg-red-100 disabled:opacity-30">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Row 1: Product · Qty · Rate · Total · Delete */}
                  <div className="grid grid-cols-12 gap-x-3 gap-y-3 sm:gap-2 items-start">

                    {/* Product — searchable */}
                    <div className="col-span-12 sm:col-span-4">
                      <label className="block text-xs text-gray-500 mb-1 sm:hidden">{t('Product')} *</label>
                      <Controller
                        name={`items.${idx}.product`}
                        control={control}
                        rules={{ required: t('Product is required') }}
                        render={({ field: f }) => (
                          <ProductSearchSelect
                            value={f.value}
                            onChange={f.onChange}
                            onSelect={(prod) => {
                              if (prod?.standardRate) setValue(`items.${idx}.rate`, prod.standardRate);
                              setRowUnits((u) => ({ ...u, [field.id]: prod?.unit?.symbol }));
                            }}
                            error={errors.items?.[idx]?.product?.message}
                          />
                        )}
                      />
                    </div>

                    {/* Qty */}
                    <div className="col-span-6 sm:col-span-2">
                      <label className="block text-xs text-gray-500 mb-1 sm:hidden">{t('Qty')} *</label>
                      <div className="relative">
                        <input
                          {...register(`items.${idx}.quantity`, { required: true, min: 0.001, valueAsNumber: true })}
                          type="number" step="0.001" min="0.001" inputMode="decimal"
                          placeholder="0"
                          className={`input text-sm ${unitSymbol ? 'pr-11 sm:pr-3' : ''} ${errors.items?.[idx]?.quantity ? 'border-red-400' : ''}`} />
                        {unitSymbol && (
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 sm:hidden">{unitSymbol}</span>
                        )}
                      </div>
                    </div>

                    {/* Rate */}
                    <div className="col-span-6 sm:col-span-2">
                      <label className="block text-xs text-gray-500 mb-1 sm:hidden">{t('Rate (₹)')}</label>
                      <input
                        {...register(`items.${idx}.rate`, { valueAsNumber: true, min: 0 })}
                        type="number" step="0.01" min="0" inputMode="decimal"
                        placeholder="0.00"
                        className="input text-sm" />
                    </div>

                    {/* Total (read-only) — phones show it at the bottom of the card */}
                    <div className="hidden sm:flex sm:col-span-2 items-end pb-1">
                      <span className="text-sm font-semibold text-gray-800">{total > 0 ? fmtAmt(total) : '—'}</span>
                    </div>

                    {/* Delete — phones have it in the card header */}
                    <div className="hidden sm:flex sm:col-span-2 items-start justify-end">
                      <button
                        type="button"
                        onClick={() => remove(idx)}
                        disabled={fields.length === 1}
                        className="p-1.5 rounded hover:bg-red-50 text-red-400 disabled:opacity-30 mt-0.5">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Row 2: Batch Ref · Expiry Date */}
                  <div className="grid grid-cols-12 gap-x-3 gap-y-3 sm:gap-2 items-end">
                    <div className="col-span-12 sm:col-span-7">
                      <label className="block text-xs text-gray-500 mb-1 sm:hidden">{t('Batch / lot (optional)')}</label>
                      <input
                        {...register(`items.${idx}.batchRef`)}
                        className="input text-xs"
                        autoCapitalize="characters"
                        placeholder={t('Batch / lot reference (optional)')} />
                    </div>

                    <div className="col-span-12 sm:col-span-5">
                      <label className="block text-xs text-gray-500 sm:text-gray-400 mb-1">
                        {t('Expiry Date')} <span className="text-gray-300 hidden sm:inline">{t('(optional · DD/MM/YYYY)')}</span>
                        <span className="text-gray-400 sm:hidden">{t('(optional)')}</span>
                      </label>
                      <input
                        {...register(`items.${idx}.expiryDate`)}
                        type="date"
                        className="input text-sm w-full"
                        title={t('Expiry date (DD/MM/YYYY)')}
                      />
                    </div>
                  </div>

                  {/* Phone: line amount */}
                  <div className="flex items-baseline justify-between border-t border-orange-100 pt-2 sm:hidden">
                    <span className="text-xs text-gray-500">
                      {qty > 0 && rate > 0 ? `${qty} × ${fmtAmt(rate)}` : t('Amount')}
                    </span>
                    <span className="text-base font-semibold text-gray-900">{total > 0 ? fmtAmt(total) : '—'}</span>
                  </div>

                </div>
              );
            })}

            {fields.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-gray-400 bg-gray-50 rounded-lg p-3">
                <Package className="h-4 w-4 shrink-0" />
                {t('Add at least one item.')}
              </div>
            )}

            {/* Phones: big add button under the last item, where the thumb already is */}
            <button
              type="button"
              onClick={() => { haptics.tap(); append(emptyItem()); }}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-orange-200 py-3 text-sm font-medium text-primary-600 active:bg-orange-50 sm:hidden">
              <Plus className="h-4 w-4" /> {t('Add item')}
            </button>

            {/* Grand total */}
            <div className="flex items-center justify-between pt-3 border-t border-dashed">
              <span className="text-sm font-semibold text-gray-700">{t('Grand Total')}</span>
              <span className="text-xl font-bold text-gray-900">{fmtAmt(grandTotal)}</span>
            </div>
          </div>

          <StickyActionBar>
            {/* Phones: running total beside Save */}
            <div className="flex flex-col justify-center leading-tight sm:hidden">
              <span className="text-[11px] uppercase tracking-wide text-gray-400">
                {t('Total')} · {t(fields.length !== 1 ? '{n} items' : '{n} item', { n: fields.length })}
              </span>
              <span className="text-base font-bold text-gray-900">{fmtAmt(grandTotal)}</span>
            </div>
            <button type="button" onClick={() => navigate('/purchases')} className="btn-secondary hidden sm:inline-flex">{t('Cancel')}</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary">
              {mutation.isPending ? t('Saving…') : <><span className="sm:hidden">{t('Save Entry')}</span><span className="hidden sm:inline">{t('Save Purchase Entry')}</span></>}
            </button>
          </StickyActionBar>
        </form>
      </div>
    </div>
  );
}
