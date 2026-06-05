import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSupplier, createSupplier, updateSupplier } from '../../../api/supplier.api.js';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { FormField, FormRow, FormSection, FormActions } from '../../../components/ui/FormField.jsx';
import { PageLoader } from '../../../components/ui/Spinner.jsx';
import toast from 'react-hot-toast';

const SupplierForm = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { register, handleSubmit, reset, formState: { errors } } = useForm({ defaultValues: { type: 'vendor', isActive: true } });

  const { data: res, isLoading } = useQuery({ queryKey: ['supplier', id], queryFn: () => getSupplier(id), enabled: isEdit });
  useEffect(() => { if (res?.data?.data) reset(res.data.data); }, [res]);

  const mutation = useMutation({
    mutationFn: (data) => isEdit ? updateSupplier(id, data) : createSupplier(data),
    onSuccess: () => { toast.success(isEdit ? 'Supplier updated' : 'Supplier created'); qc.invalidateQueries({ queryKey: ['suppliers'] }); navigate('/masters/suppliers'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  if (isEdit && isLoading) return <PageLoader />;

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={isEdit ? 'Edit Supplier' : 'New Supplier'}
        breadcrumbs={[{ label: 'Masters' }, { label: 'Suppliers', to: '/masters/suppliers' }, { label: isEdit ? 'Edit' : 'New' }]}
      />
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="card p-6 space-y-6">
        <FormSection title="Basic Information">
          <FormRow>
            <FormField label="Name" required error={errors.name?.message}>
              <input {...register('name', { required: 'Name is required' })} className="input" placeholder="Supplier or donor name" />
            </FormField>
            <FormField label="Type" required>
              <select {...register('type')} className="input">
                <option value="vendor">Vendor (Supplier)</option>
                <option value="donor">Donor</option>
                <option value="both">Both</option>
              </select>
            </FormField>
          </FormRow>
        </FormSection>

        <FormSection title="Contact Details">
          <FormRow>
            <FormField label="Contact Person">
              <input {...register('contactPerson')} className="input" />
            </FormField>
            <FormField label="Phone">
              <input {...register('phone')} className="input" type="tel" />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="Email">
              <input {...register('email')} className="input" type="email" />
            </FormField>
            <FormField label="City">
              <input {...register('city')} className="input" placeholder="e.g. Amalner" />
            </FormField>
          </FormRow>
          <FormField label="Address">
            <textarea {...register('address')} rows={2} className="input" />
          </FormField>
        </FormSection>

        <FormSection title="Business Details">
          <FormRow>
            <FormField label="GSTIN" hint="Optional">
              <input {...register('gstin')} className="input" placeholder="GST number" />
            </FormField>
            <FormField label="PAN Number" hint="Required for 80G donation receipts">
              <input {...register('panNumber')} className="input uppercase" placeholder="ABCDE1234F" />
            </FormField>
            <FormField label=" ">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mt-2">
                <input type="checkbox" {...register('isActive')} className="h-4 w-4 rounded" /> Active
              </label>
            </FormField>
          </FormRow>
          <FormField label="Notes">
            <textarea {...register('notes')} rows={2} className="input" />
          </FormField>
        </FormSection>

        <FormActions onCancel={() => navigate('/masters/suppliers')} loading={mutation.isPending} submitLabel={isEdit ? 'Update' : 'Create'} />
      </form>
    </div>
  );
};

export default SupplierForm;
