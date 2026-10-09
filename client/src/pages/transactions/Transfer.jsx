import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDepartments } from '../../api/department.api.js';
import { createTransaction } from '../../api/stockTransaction.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { FormField, FormRow, FormSection } from '../../components/ui/FormField.jsx';
import DatePickerField from '../../components/ui/DatePickerField.jsx';
import StickyActionBar from '../../components/ui/StickyActionBar.jsx';
import ProductSearchSelect from '../../components/transactions/ProductSearchSelect.jsx';
import CurrentBalanceDisplay from '../../components/transactions/CurrentBalanceDisplay.jsx';
import SearchableSelect from '../../components/ui/SearchableSelect.jsx';
import haptics from '../../utils/haptics.js';
import toast from 'react-hot-toast';

const Transfer = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  // Only used to show the unit next to the quantity; the form stores the product id.
  const [pickedProduct, setPickedProduct] = useState(null);

  const { register, handleSubmit, control, watch, formState: { errors } } = useForm({
    defaultValues: { transactionDate: new Date(), quantity: '' },
  });

  const selectedProduct = watch('product');
  const fromDept = watch('fromDepartment');
  const unitSymbol = pickedProduct?.unit?.symbol;

  const { data: deptsRes } = useQuery({ queryKey: ['departments'], queryFn: () => getDepartments() });
  const departments = deptsRes?.data?.data || [];

  const mutation = useMutation({
    mutationFn: (data) => createTransaction({ ...data, transactionType: 'TRANSFER', product: data.product?._id || data.product }),
    onSuccess: () => {
      haptics.success();
      toast.success('Transfer recorded');
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['balance'] });
      navigate('/transactions/history');
    },
    onError: (err) => {
      haptics.error();
      toast.error(err.response?.data?.message || 'Failed to record');
    },
  });

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Transfer"
        subtitle="Move stock between departments"
        breadcrumbs={[{ label: 'Transactions' }, { label: 'Transfer' }]}
      />
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4 sm:space-y-6">
        <div className="card p-4 sm:p-6 space-y-6">
          <FormSection title="Transfer Details">
            <DatePickerField name="transactionDate" control={control} label="Date" required error={errors.transactionDate?.message} />

            <FormField label="Product" required error={errors.product?.message}>
              <Controller
                name="product"
                control={control}
                rules={{ required: 'Product is required' }}
                render={({ field }) => (
                  <ProductSearchSelect value={field.value} onChange={field.onChange} onSelect={setPickedProduct} error={errors.product?.message} />
                )}
              />
            </FormField>

            <FormRow cols={2}>
              <FormField label="From Department" required error={errors.fromDepartment?.message}>
                <Controller
                  name="fromDepartment"
                  control={control}
                  rules={{ required: 'Source department is required' }}
                  render={({ field }) => (
                    <SearchableSelect
                      value={field.value || ''}
                      onChange={field.onChange}
                      options={departments.map((d) => ({ value: d._id, label: d.name }))}
                      placeholder="Select source…"
                      error={errors.fromDepartment?.message}
                    />
                  )}
                />
              </FormField>
              <FormField label="To Department" required error={errors.toDepartment?.message}>
                <Controller
                  name="toDepartment"
                  control={control}
                  rules={{ required: 'Destination department is required' }}
                  render={({ field }) => (
                    <SearchableSelect
                      value={field.value || ''}
                      onChange={field.onChange}
                      options={departments.map((d) => ({ value: d._id, label: d.name }))}
                      placeholder="Select destination…"
                      error={errors.toDepartment?.message}
                    />
                  )}
                />
              </FormField>
            </FormRow>

            {selectedProduct && fromDept && (
              <CurrentBalanceDisplay productId={selectedProduct._id || selectedProduct} departmentId={fromDept} label="Available in Source" />
            )}

            <FormField label="Quantity" required error={errors.quantity?.message}>
              <div className="relative sm:max-w-xs">
                <input
                  {...register('quantity', { required: 'Quantity is required', min: { value: 0.001, message: 'Must be > 0' } })}
                  type="number" step="0.001" inputMode="decimal" placeholder="0"
                  className="input pr-16"
                />
                {unitSymbol && (
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">{unitSymbol}</span>
                )}
              </div>
            </FormField>
          </FormSection>

          <FormField label="Notes">
            <textarea {...register('notes')} className="input" rows={2} placeholder="Optional remarks…" />
          </FormField>
        </div>

        <StickyActionBar>
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary hidden sm:inline-flex">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? 'Saving...' : 'Record Transfer'}
          </button>
        </StickyActionBar>
      </form>
    </div>
  );
};

export default Transfer;
