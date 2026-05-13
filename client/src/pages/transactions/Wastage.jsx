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
import toast from 'react-hot-toast';

const REASONS = [
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'DAMAGED', label: 'Damaged' },
  { value: 'SPILLAGE', label: 'Spillage' },
  { value: 'PEST', label: 'Pest / Infestation' },
  { value: 'OTHER', label: 'Other' },
];

const Wastage = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { register, handleSubmit, control, watch, formState: { errors } } = useForm({
    defaultValues: { transactionDate: new Date(), wastageReason: 'DAMAGED', quantity: '' },
  });

  const selectedProduct = watch('product');
  const fromDept = watch('fromDepartment');

  const { data: deptsRes } = useQuery({ queryKey: ['departments'], queryFn: getDepartments });
  const departments = deptsRes?.data?.data || [];

  const mutation = useMutation({
    mutationFn: (data) => createTransaction({ ...data, transactionType: 'WASTAGE', product: data.product?._id || data.product }),
    onSuccess: () => {
      toast.success('Wastage recorded');
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['balance'] });
      navigate('/transactions/history');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to record'),
  });

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Wastage"
        subtitle="Record damaged or expired stock"
        breadcrumbs={[{ label: 'Transactions' }, { label: 'Wastage' }]}
      />
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="card p-6 space-y-6">
        <FormSection title="Wastage Details">
          <FormRow cols={2}>
            <DatePickerField name="transactionDate" control={control} label="Date" required error={errors.transactionDate?.message} />
            <FormField label="Reason" required>
              <select {...register('wastageReason')} className="input">
                {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
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
            <select {...register('fromDepartment', { required: 'Department is required' })} className="input">
              <option value="">Select department…</option>
              {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </FormField>

          {selectedProduct && fromDept && (
            <CurrentBalanceDisplay productId={selectedProduct._id || selectedProduct} departmentId={fromDept} />
          )}

          <FormField label="Quantity" required error={errors.quantity?.message}>
            <div className="relative max-w-xs">
              <input
                {...register('quantity', { required: 'Quantity is required', min: { value: 0.001, message: 'Must be > 0' } })}
                type="number" step="0.001" className="input pr-16"
              />
              {selectedProduct?.unit?.symbol && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">{selectedProduct.unit.symbol}</span>
              )}
            </div>
          </FormField>
        </FormSection>

        <FormField label="Notes">
          <textarea {...register('notes')} className="input" rows={2} placeholder="Describe the wastage…" />
        </FormField>

        <FormActions onCancel={() => navigate(-1)} loading={mutation.isPending} submitLabel="Record Wastage" />
      </form>
    </div>
  );
};

export default Wastage;
