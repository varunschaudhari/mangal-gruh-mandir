import { useForm, Controller } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDepartments } from '../../api/department.api.js';
import { createTransaction } from '../../api/stockTransaction.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { FormField, FormRow, FormSection, FormActions } from '../../components/ui/FormField.jsx';
import DatePickerField from '../../components/ui/DatePickerField.jsx';
import ProductSearchSelect from '../../components/transactions/ProductSearchSelect.jsx';
import CurrentBalanceDisplay from '../../components/transactions/CurrentBalanceDisplay.jsx';
import SearchableSelect from '../../components/ui/SearchableSelect.jsx';
import toast from 'react-hot-toast';

const PURPOSES = [
  { value: 'CONSUMPTION', label: 'Consumption (Kitchen)' },
  { value: 'DISTRIBUTION', label: 'Distribution (Prasadam)' },
  { value: 'OFFERING', label: 'Offering / Puja' },
  { value: 'OTHER', label: 'Other' },
];

const StockOut = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { register, handleSubmit, control, watch, formState: { errors } } = useForm({
    defaultValues: { transactionDate: new Date(), stockOutPurpose: 'CONSUMPTION', quantity: '' },
  });

  const selectedProduct = watch('product');
  const fromDept = watch('fromDepartment');

  const { data: deptsRes } = useQuery({ queryKey: ['departments'], queryFn: () => getDepartments() });
  const departments = deptsRes?.data?.data || [];

  const mutation = useMutation({
    mutationFn: (data) => createTransaction({ ...data, transactionType: 'STOCK_OUT', product: data.product?._id || data.product }),
    onSuccess: () => {
      toast.success('Stock Out recorded');
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['balance'] });
      navigate('/transactions/history');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to record'),
  });

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Stock Out"
        subtitle="Record outgoing stock"
        breadcrumbs={[{ label: 'Transactions' }, { label: 'Stock Out' }]}
      />
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="card p-6 space-y-6">
        <FormSection title="Transaction Details">
          <FormRow cols={2}>
            <DatePickerField name="transactionDate" control={control} label="Date" required error={errors.transactionDate?.message} />
            <FormField label="Purpose" required>
              <select {...register('stockOutPurpose')} className="input">
                {PURPOSES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
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

          <FormField label="From Department" required error={errors.fromDepartment?.message}>
            <Controller
              name="fromDepartment"
              control={control}
              rules={{ required: 'Department is required' }}
              render={({ field }) => (
                <SearchableSelect
                  value={field.value || ''}
                  onChange={field.onChange}
                  options={departments.map((d) => ({ value: d._id, label: d.name }))}
                  placeholder="Select department…"
                  error={errors.fromDepartment?.message}
                />
              )}
            />
          </FormField>

          {selectedProduct && fromDept && (
            <CurrentBalanceDisplay productId={selectedProduct._id || selectedProduct} departmentId={fromDept} />
          )}

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
            <FormField label="Issued To">
              <input {...register('issuedTo')} className="input" placeholder="Person / team (optional)" />
            </FormField>
          </FormRow>
        </FormSection>

        <FormField label="Notes">
          <textarea {...register('notes')} className="input" rows={2} placeholder="Optional remarks…" />
        </FormField>

        <FormActions onCancel={() => navigate(-1)} loading={mutation.isPending} submitLabel="Record Stock Out" />
      </form>
    </div>
  );
};

export default StockOut;
