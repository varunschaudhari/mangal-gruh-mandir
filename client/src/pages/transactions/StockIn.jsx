import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { getDepartments } from '../../api/department.api.js';
import { getSuppliers } from '../../api/supplier.api.js';
import { createBatchTransactions, checkInvoiceDuplicate } from '../../api/stockTransaction.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { FormField, FormRow, FormSection, FormActions } from '../../components/ui/FormField.jsx';
import DatePickerField from '../../components/ui/DatePickerField.jsx';
import ProductSearchSelect from '../../components/transactions/ProductSearchSelect.jsx';
import { useDebounce } from '../../hooks/useDebounce.js';
import toast from 'react-hot-toast';

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
      const count = res?.data?.data?.length || 1;
      toast.success(`${count} item${count > 1 ? 's' : ''} recorded`);
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['balance'] });
      navigate('/transactions/history');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to record'),
  });

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Stock In"
        subtitle="Record incoming stock"
        breadcrumbs={[{ label: 'Transactions' }, { label: 'Stock In' }]}
      />
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-6">

        {/* Shared header fields */}
        <div className="card p-6 space-y-6">
          <FormSection title="Transaction Details">
            <FormRow cols={2}>
              <DatePickerField name="transactionDate" control={control} label="Date" required />
              <FormField label="Type" required>
                <select {...register('stockInType')} className="input">
                  {STOCK_IN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </FormField>
            </FormRow>
            <FormField label="To Department" required error={errors.toDepartment?.message}>
              <select {...register('toDepartment', { required: 'Department is required' })} className="input">
                <option value="">Select department…</option>
                {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
            </FormField>
          </FormSection>

          {stockInType === 'PURCHASE' && (
            <FormSection title="Purchase Details">
              <FormField label="Supplier">
                <select {...register('supplier')} className="input">
                  <option value="">Select supplier…</option>
                  {suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                </select>
              </FormField>
              <FormRow cols={2}>
                <FormField label="Invoice Number">
                  <input {...register('invoiceNumber')} className="input" />
                </FormField>
                <DatePickerField name="invoiceDate" control={control} label="Invoice Date" />
              </FormRow>
            </FormSection>
          )}

          {stockInType === 'DONATION' && (
            <FormSection title="Donation Details">
              <FormField label="Donor Name">
                <input {...register('donorName')} className="input" placeholder="Donor's name (optional)" />
              </FormField>
            </FormSection>
          )}
        </div>

        {/* Dynamic item rows */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Items</h3>
            {grandTotal > 0 && (
              <span className="text-sm text-gray-500">
                Grand Total:{' '}
                <span className="font-semibold text-gray-900">
                  ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </span>
            )}
          </div>

          {fields.map((field, index) => {
            const item = items[index] || {};
            const rowTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0);

            return (
              <div key={field.id} className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Item {index + 1}</span>
                  <div className="flex items-center gap-3">
                    {rowTotal > 0 && (
                      <span className="text-xs text-gray-500">
                        ₹{rowTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    )}
                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="text-xs text-red-400 hover:text-red-600 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                <FormField label="Product" required error={errors.items?.[index]?.product?.message}>
                  <Controller
                    name={`items.${index}.product`}
                    control={control}
                    rules={{ required: 'Product is required' }}
                    render={({ field: f }) => (
                      <ProductSearchSelect
                        value={f.value}
                        onChange={f.onChange}
                        error={errors.items?.[index]?.product?.message}
                      />
                    )}
                  />
                </FormField>

                <FormRow cols={2}>
                  <FormField label="Quantity" required error={errors.items?.[index]?.quantity?.message}>
                    <div className="relative">
                      <input
                        {...register(`items.${index}.quantity`, {
                          required: 'Required',
                          min: { value: 0.001, message: 'Must be > 0' },
                        })}
                        type="number"
                        step="0.001"
                        className="input pr-16"
                      />
                      {item.product?.unit?.symbol && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                          {item.product.unit.symbol}
                        </span>
                      )}
                    </div>
                  </FormField>
                  <FormField label="Rate (₹)" hint="Per unit" error={errors.items?.[index]?.rate?.message}>
                    <input
                      {...register(`items.${index}.rate`, { min: { value: 0, message: 'Cannot be negative' } })}
                      type="number"
                      step="0.01"
                      className="input"
                    />
                  </FormField>
                </FormRow>

                <FormField label="Batch Reference" hint="Optional">
                  <input
                    {...register(`items.${index}.batchRef`)}
                    className="input font-mono"
                    placeholder="e.g. LOT-2026-001"
                  />
                </FormField>

                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    {...register(`items.${index}.hasExpiry`)}
                    className="h-4 w-4 rounded"
                  />
                  This batch has an expiry date
                </label>

                {item.hasExpiry && (
                  <FormRow cols={2}>
                    <DatePickerField name={`items.${index}.expiryDate`} control={control} label="Expiry Date" required allowFuture />
                    <DatePickerField name={`items.${index}.manufacturingDate`} control={control} label="Manufacturing Date" />
                  </FormRow>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => append(defaultItem())}
            className="w-full border-2 border-dashed border-gray-200 rounded-lg py-3 text-sm text-gray-500 hover:border-primary-400 hover:text-primary-600 transition-colors"
          >
            + Add another item
          </button>
        </div>

        <div className="card p-6">
          <FormField label="Notes">
            <textarea {...register('notes')} className="input" rows={2} placeholder="Optional remarks…" />
          </FormField>
        </div>

        {dupCheck?.isDuplicate && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-amber-800">Possible duplicate invoice</p>
              <p className="text-amber-700 text-xs mt-0.5">
                Invoice <span className="font-mono font-bold">{invoiceWatch}</span> from this supplier
                was already recorded in <span className="font-mono">{dupCheck.existing.transactionNumber}</span>.
                Proceed only if this is a separate delivery.
              </p>
            </div>
          </div>
        )}

        <FormActions onCancel={() => navigate(-1)} loading={mutation.isPending} submitLabel="Record Stock In" />
      </form>
    </div>
  );
};

export default StockIn;
