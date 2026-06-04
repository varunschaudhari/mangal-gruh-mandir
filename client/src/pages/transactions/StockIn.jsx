import { useForm, Controller } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDepartments } from '../../api/department.api.js';
import { getSuppliers } from '../../api/supplier.api.js';
import { createTransaction } from '../../api/stockTransaction.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { FormField, FormRow, FormSection, FormActions } from '../../components/ui/FormField.jsx';
import DatePickerField from '../../components/ui/DatePickerField.jsx';
import ProductSearchSelect from '../../components/transactions/ProductSearchSelect.jsx';
import toast from 'react-hot-toast';

const STOCK_IN_TYPES = [
  { value: 'PURCHASE', label: 'Purchase' },
  { value: 'DONATION', label: 'Donation' },
  { value: 'RETURN', label: 'Return' },
];

const StockIn = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm({
    defaultValues: { transactionDate: new Date(), stockInType: 'PURCHASE', quantity: '', rate: '', hasExpiry: false },
  });

  const stockInType = watch('stockInType');
  const selectedProduct = watch('product');
  const hasExpiry = watch('hasExpiry');

  const { data: deptsRes } = useQuery({ queryKey: ['departments'], queryFn: () => getDepartments() });
  const { data: suppliersRes } = useQuery({ queryKey: ['suppliers'], queryFn: () => getSuppliers({ isActive: true, limit: 100 }) });

  const departments = deptsRes?.data?.data || [];
  const suppliers = suppliersRes?.data?.data?.suppliers || suppliersRes?.data?.data || [];

  const mutation = useMutation({
    mutationFn: ({ hasExpiry, ...data }) => createTransaction({
      ...data,
      transactionType: 'STOCK_IN',
      product: data.product?._id || data.product,
      expiryDate: hasExpiry ? data.expiryDate : undefined,
      manufacturingDate: hasExpiry ? data.manufacturingDate : undefined,
    }),
    onSuccess: () => {
      toast.success('Stock In recorded');
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['balance'] });
      navigate('/transactions/history');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to record'),
  });

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Stock In"
        subtitle="Record incoming stock"
        breadcrumbs={[{ label: 'Transactions' }, { label: 'Stock In' }]}
      />
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="card p-6 space-y-6">
        <FormSection title="Transaction Details">
          <FormRow cols={2}>
            <DatePickerField name="transactionDate" control={control} label="Date" required error={errors.transactionDate?.message} />
            <FormField label="Type" required>
              <select {...register('stockInType')} className="input">
                {STOCK_IN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </FormField>
          </FormRow>

          <FormField label="Product" required error={errors.product?.message}>
            <Controller
              name="product"
              control={control}
              rules={{ required: 'Product is required' }}
              render={({ field }) => (
                <ProductSearchSelect value={field.value} onChange={field.onChange} error={errors.product?.message} />
              )}
            />
          </FormField>

          <FormField label="To Department" required error={errors.toDepartment?.message}>
            <select {...register('toDepartment', { required: 'Department is required' })} className="input">
              <option value="">Select department…</option>
              {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </FormField>

          <FormRow cols={2}>
            <FormField label="Quantity" required error={errors.quantity?.message}>
              <div className="relative">
                <input
                  {...register('quantity', { required: 'Quantity is required', min: { value: 0.001, message: 'Must be > 0' } })}
                  type="number" step="0.001" className="input pr-16"
                />
                {selectedProduct?.unit?.symbol && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">{selectedProduct.unit.symbol}</span>
                )}
              </div>
            </FormField>
            <FormField label="Rate (₹)" error={errors.rate?.message} hint="Per unit">
              <input {...register('rate', { min: { value: 0, message: 'Cannot be negative' } })} type="number" step="0.01" className="input" />
            </FormField>
          </FormRow>
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

        <FormSection title="Batch / Expiry">
          <FormField label="Batch Reference" hint="e.g. LOT-2026-001 (optional)">
            <input {...register('batchRef')} className="input font-mono" placeholder="Optional batch/lot number" />
          </FormField>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" {...register('hasExpiry')} className="h-4 w-4 rounded" />
            This batch has an expiry date
          </label>
          {hasExpiry && (
            <FormRow cols={2}>
              <DatePickerField name="expiryDate" control={control} label="Expiry Date" required />
              <DatePickerField name="manufacturingDate" control={control} label="Manufacturing Date" />
            </FormRow>
          )}
        </FormSection>

        <FormField label="Notes">
          <textarea {...register('notes')} className="input" rows={2} placeholder="Optional remarks…" />
        </FormField>

        <FormActions onCancel={() => navigate(-1)} loading={mutation.isPending} submitLabel="Record Stock In" />
      </form>
    </div>
  );
};

export default StockIn;
