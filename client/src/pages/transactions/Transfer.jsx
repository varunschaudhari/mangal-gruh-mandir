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

const Transfer = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { register, handleSubmit, control, watch, formState: { errors } } = useForm({
    defaultValues: { transactionDate: new Date(), quantity: '' },
  });

  const selectedProduct = watch('product');
  const fromDept = watch('fromDepartment');

  const { data: deptsRes } = useQuery({ queryKey: ['departments'], queryFn: () => getDepartments() });
  const departments = deptsRes?.data?.data || [];

  const mutation = useMutation({
    mutationFn: (data) => createTransaction({ ...data, transactionType: 'TRANSFER', product: data.product?._id || data.product }),
    onSuccess: () => {
      toast.success('Transfer recorded');
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['balance'] });
      navigate('/transactions/history');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to record'),
  });

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Transfer"
        subtitle="Move stock between departments"
        breadcrumbs={[{ label: 'Transactions' }, { label: 'Transfer' }]}
      />
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="card p-6 space-y-6">
        <FormSection title="Transfer Details">
          <DatePickerField name="transactionDate" control={control} label="Date" required error={errors.transactionDate?.message} />

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

          <FormRow cols={2}>
            <FormField label="From Department" required error={errors.fromDepartment?.message}>
              <select {...register('fromDepartment', { required: 'Source department is required' })} className="input">
                <option value="">Select source…</option>
                {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
            </FormField>
            <FormField label="To Department" required error={errors.toDepartment?.message}>
              <select {...register('toDepartment', { required: 'Destination department is required' })} className="input">
                <option value="">Select destination…</option>
                {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
            </FormField>
          </FormRow>

          {selectedProduct && fromDept && (
            <CurrentBalanceDisplay productId={selectedProduct._id || selectedProduct} departmentId={fromDept} label="Available in Source" />
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
          <textarea {...register('notes')} className="input" rows={2} placeholder="Optional remarks…" />
        </FormField>

        <FormActions onCancel={() => navigate(-1)} loading={mutation.isPending} submitLabel="Record Transfer" />
      </form>
    </div>
  );
};

export default Transfer;
