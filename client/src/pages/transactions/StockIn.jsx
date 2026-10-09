import { useState } from 'react';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { getDepartments } from '../../api/department.api.js';
import { getSuppliers } from '../../api/supplier.api.js';
import { createBatchTransactions, checkInvoiceDuplicate } from '../../api/stockTransaction.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { FormField, FormRow, FormSection } from '../../components/ui/FormField.jsx';
import DatePickerField from '../../components/ui/DatePickerField.jsx';
import StickyActionBar from '../../components/ui/StickyActionBar.jsx';
import ProductSearchSelect from '../../components/transactions/ProductSearchSelect.jsx';
import SearchableSelect from '../../components/ui/SearchableSelect.jsx';
import { useDebounce } from '../../hooks/useDebounce.js';
import haptics from '../../utils/haptics.js';
import toast from 'react-hot-toast';
import { useT, rich } from '../../i18n/index.jsx';


const fmtTotal = (n) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STOCK_IN_TYPES = [
  { value: 'PURCHASE', label: 'Purchase' },
  { value: 'DONATION', label: 'Donation' },
  { value: 'RETURN', label: 'Return' },
];

const defaultItem = () => ({
  product: null,
  quantity: '',
  rate: '',
  batchRef: '',
  hasExpiry: false,
  expiryDate: null,
  manufacturingDate: null,
});

const StockIn = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const t = useT();

  const { register, handleSubmit, control, watch, formState: { errors } } = useForm({
    defaultValues: {
      transactionDate: new Date(),
      stockInType: 'PURCHASE',
      toDepartment: '',
      supplier: '',
      invoiceNumber: '',
      invoiceDate: null,
      donorName: '',
      notes: '',
      items: [defaultItem()],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  // Unit symbol per item row (keyed by field id), only for display next to the quantity.
  const [rowUnits, setRowUnits] = useState({});

  const stockInType   = watch('stockInType');
  const items         = watch('items');
  const supplierWatch = watch('supplier');
  const invoiceWatch  = watch('invoiceNumber');

  const dSupplier = useDebounce(supplierWatch, 600);
  const dInvoice  = useDebounce(invoiceWatch, 600);

  const { data: dupRes } = useQuery({
    queryKey: ['invoice-dup-check', dSupplier, dInvoice],
    queryFn: () => checkInvoiceDuplicate(dSupplier, dInvoice),
    enabled: stockInType === 'PURCHASE' && !!dSupplier && !!dInvoice?.trim(),
    staleTime: 30 * 1000,
  });
  const dupCheck = dupRes?.data?.data;

  const { data: deptsRes } = useQuery({ queryKey: ['departments'], queryFn: () => getDepartments() });
  const { data: suppliersRes } = useQuery({ queryKey: ['suppliers'], queryFn: () => getSuppliers({ active: true }) });

  const departments = deptsRes?.data?.data || [];
  const suppliers = suppliersRes?.data?.data || [];

  const grandTotal = items.reduce((sum, item) => {
    return sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0);
  }, 0);

  const mutation = useMutation({
    mutationFn: (data) => createBatchTransactions({
      transactionDate: data.transactionDate,
      stockInType: data.stockInType,
      toDepartment: data.toDepartment,
      supplier: data.supplier || undefined,
      invoiceNumber: data.invoiceNumber || undefined,
      invoiceDate: data.invoiceDate || undefined,
      donorName: data.donorName || undefined,
      notes: data.notes || undefined,
      items: data.items.map((item) => ({
        product: item.product?._id || item.product,
        quantity: item.quantity,
        rate: item.rate || 0,
        batchRef: item.batchRef || undefined,
        expiryDate: item.hasExpiry ? item.expiryDate : undefined,
        manufacturingDate: item.hasExpiry ? item.manufacturingDate : undefined,
      })),
    }),
    onSuccess: (res) => {
      haptics.success();
      const count = res?.data?.data?.length || 1;
      toast.success(t(count > 1 ? '{n} items recorded' : '{n} item recorded', { n: count }));
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['balance'] });
      navigate('/transactions/history');
    },
    onError: (err) => {
      haptics.error();
      toast.error(err.response?.data?.message || t('Failed to record'));
    },
  });

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Stock In"
        subtitle="Record incoming stock"
        breadcrumbs={[{ label: 'Transactions' }, { label: 'Stock In' }]}
      />
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4 sm:space-y-6">

        {/* Shared header fields */}
        <div className="card p-4 sm:p-6 space-y-6">
          <FormSection title={t('Transaction Details')}>
            <FormRow cols={2}>
              <DatePickerField name="transactionDate" control={control} label={t('Date')} required />
              <FormField label={t('Type')} required>
                <select {...register('stockInType')} className="input">
                  {STOCK_IN_TYPES.map((ty) => <option key={ty.value} value={ty.value}>{t(ty.label)}</option>)}
                </select>
              </FormField>
            </FormRow>
            <FormField label={t('To Department')} required error={errors.toDepartment?.message}>
              <Controller
                name="toDepartment"
                control={control}
                rules={{ required: t('Department is required') }}
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
            </FormField>
          </FormSection>

          {stockInType === 'PURCHASE' && (
            <FormSection title={t('Purchase Details')}>
              <FormField label={t('Supplier')}>
                <Controller
                  name="supplier"
                  control={control}
                  render={({ field }) => (
                    <SearchableSelect
                      value={field.value || ''}
                      onChange={field.onChange}
                      options={suppliers.map((s) => ({ value: s._id, label: s.name }))}
                      placeholder={t('Select supplier…')}
                    />
                  )}
                />
              </FormField>
              <FormRow cols={2}>
                <FormField label={t('Invoice Number')}>
                  <input {...register('invoiceNumber')} className="input" autoCapitalize="characters" />
                </FormField>
                <DatePickerField name="invoiceDate" control={control} label={t('Invoice Date')} />
              </FormRow>
            </FormSection>
          )}

          {stockInType === 'DONATION' && (
            <FormSection title={t('Donation Details')}>
              <FormField label={t('Donor Name')}>
                <input {...register('donorName')} className="input" placeholder={t("Donor's name (optional)")} />
              </FormField>
            </FormSection>
          )}
        </div>

        {/* Dynamic item rows */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">{t('Items')}</h3>
            {grandTotal > 0 && (
              <span className="text-sm text-gray-500">
                {t('Grand Total')}:{' '}
                <span className="font-semibold text-gray-900">{fmtTotal(grandTotal)}</span>
              </span>
            )}
          </div>

          {fields.map((field, index) => {
            const item = items[index] || {};
            const rowTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0);
            const unitSymbol = rowUnits[field.id];

            return (
              <div key={field.id} className="card p-4 space-y-3">
                <div className="flex min-h-[2rem] items-center justify-between">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('Item {n}', { n: index + 1 })}</span>
                  <div className="flex items-center gap-3">
                    {rowTotal > 0 && (
                      <span className="text-sm font-semibold text-gray-800 sm:text-xs sm:font-normal sm:text-gray-500">
                        {fmtTotal(rowTotal)}
                      </span>
                    )}
                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        aria-label={t('Remove item {n}', { n: index + 1 })}
                        className="-mr-2 rounded-md p-2 text-xs text-red-400 hover:text-red-600 active:bg-red-50 transition-colors sm:mr-0 sm:p-0"
                      >
                        <Trash2 className="h-4 w-4 sm:hidden" />
                        <span className="hidden sm:inline">{t('Remove')}</span>
                      </button>
                    )}
                  </div>
                </div>

                <FormField label={t('Product')} required error={errors.items?.[index]?.product?.message}>
                  <Controller
                    name={`items.${index}.product`}
                    control={control}
                    rules={{ required: t('Product is required') }}
                    render={({ field: f }) => (
                      <ProductSearchSelect
                        value={f.value}
                        onChange={f.onChange}
                        onSelect={(prod) => setRowUnits((u) => ({ ...u, [field.id]: prod?.unit?.symbol }))}
                        error={errors.items?.[index]?.product?.message}
                      />
                    )}
                  />
                </FormField>

                {/* Qty + rate stay side by side on phones too: both are short numbers. */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <FormField label={t('Quantity')} required error={errors.items?.[index]?.quantity?.message}>
                    <div className="relative">
                      <input
                        {...register(`items.${index}.quantity`, {
                          required: t('Required'),
                          min: { value: 0.001, message: t('Must be > 0') },
                        })}
                        type="number"
                        step="0.001"
                        inputMode="decimal"
                        placeholder="0"
                        className="input pr-12 sm:pr-16"
                      />
                      {unitSymbol && (
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                          {unitSymbol}
                        </span>
                      )}
                    </div>
                  </FormField>
                  <FormField label={t('Rate (₹)')} hint={t('Per unit')} error={errors.items?.[index]?.rate?.message}>
                    <input
                      {...register(`items.${index}.rate`, { min: { value: 0, message: t('Cannot be negative') } })}
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="0.00"
                      className="input"
                    />
                  </FormField>
                </div>

                <FormField label={t('Batch Reference')} hint={t('Optional')}>
                  <input
                    {...register(`items.${index}.batchRef`)}
                    className="input font-mono"
                    placeholder={t('e.g. {example}', { example: 'LOT-2026-001' })}
                  />
                </FormField>

                <label className="flex min-h-[44px] items-center gap-3 text-sm cursor-pointer select-none sm:min-h-0 sm:gap-2">
                  <input
                    type="checkbox"
                    {...register(`items.${index}.hasExpiry`)}
                    className="h-5 w-5 rounded sm:h-4 sm:w-4"
                  />
                  {t('This batch has an expiry date')}
                </label>

                {item.hasExpiry && (
                  <FormRow cols={2}>
                    <DatePickerField name={`items.${index}.expiryDate`} control={control} label={t('Expiry Date')} required allowFuture />
                    <DatePickerField name={`items.${index}.manufacturingDate`} control={control} label={t('Manufacturing Date')} />
                  </FormRow>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => append(defaultItem())}
            className="flex w-full items-center justify-center gap-1.5 border-2 border-dashed border-gray-200 rounded-lg py-3 text-sm font-medium text-gray-500 hover:border-primary-400 hover:text-primary-600 active:bg-gray-50 transition-colors sm:font-normal"
          >
            <Plus className="h-4 w-4" /> {t('Add another item')}
          </button>
        </div>

        <div className="card p-4 sm:p-6">
          <FormField label={t('Notes')}>
            <textarea {...register('notes')} className="input" rows={2} placeholder={t('Optional remarks…')} />
          </FormField>
        </div>

        {dupCheck?.isDuplicate && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-amber-800">{t('Possible duplicate invoice')}</p>
              <p className="text-amber-700 text-xs mt-0.5">
                {rich(t('Invoice {invoice} from this supplier was already recorded in {txn}. Proceed only if this is a separate delivery.'), {
                  invoice: <span className="font-mono font-bold">{invoiceWatch}</span>,
                  txn: <span className="font-mono">{dupCheck.existing.transactionNumber}</span>,
                })}
              </p>
            </div>
          </div>
        )}

        <StickyActionBar>
          {/* Phones: running total next to Save, since the item list can be long. */}
          <div className="flex flex-col justify-center leading-tight sm:hidden">
            <span className="text-[11px] uppercase tracking-wide text-gray-400">
              {t(fields.length !== 1 ? '{n} items' : '{n} item', { n: fields.length })}
            </span>
            <span className="text-base font-bold text-gray-900">{fmtTotal(grandTotal)}</span>
          </div>
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary hidden sm:inline-flex">{t('Cancel')}</button>
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? t('Saving...') : t('Record Stock In')}
          </button>
        </StickyActionBar>
      </form>
    </div>
  );
};

export default StockIn;
