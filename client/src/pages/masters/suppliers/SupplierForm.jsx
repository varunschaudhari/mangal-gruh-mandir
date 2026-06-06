import { useForm, useFieldArray } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Star } from 'lucide-react';
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

  const { data: res, isLoading } = useQuery({
    queryKey: ['supplier', id],
    queryFn: () => getSupplier(id),
    enabled: isEdit,
  });

  const supplierData = res?.data?.data;

  // `values` auto-resets the form whenever supplierData arrives or changes.
  // defaultValues covers the create-new case.
  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm({
    defaultValues: { type: 'vendor', isActive: true, creditDays: 0, bankAccounts: [] },
    values: supplierData
      ? { ...supplierData, bankAccounts: Array.isArray(supplierData.bankAccounts) ? supplierData.bankAccounts : [] }
      : undefined,
  });

  const { fields: bankFields, append: appendBank, remove: removeBank } = useFieldArray({ control, name: 'bankAccounts' });

  const mutation = useMutation({
    mutationFn: (data) => isEdit ? updateSupplier(id, data) : createSupplier(data),
    onSuccess: () => {
      toast.success(isEdit ? 'Supplier updated' : 'Supplier created');
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['supplier', id] });
      navigate('/masters/suppliers');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const handleSetDefault = (idx) => {
    bankFields.forEach((_, i) => {
      setValue(`bankAccounts.${i}.isDefault`, i === idx, { shouldDirty: true });
    });
  };

  const addBankAccount = () => {
    appendBank({
      label: '',
      bankName: '',
      accountNumber: '',
      ifscCode: '',
      accountHolderName: '',
      upiId: '',
      isDefault: bankFields.length === 0,
    });
  };

  if (isEdit && (isLoading || !supplierData)) return <PageLoader />;

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
          <FormRow cols={3}>
            <FormField label="GSTIN" hint="Optional">
              <input {...register('gstin')} className="input" placeholder="GST number" />
            </FormField>
            <FormField label="PAN Number" hint="Required for 80G donation receipts">
              <input {...register('panNumber')} className="input uppercase" placeholder="ABCDE1234F" />
            </FormField>
            <FormField label="Credit Days" hint="Payment due after N days from invoice">
              <input {...register('creditDays', { valueAsNumber: true, min: 0 })} type="number" min={0} className="input" placeholder="0" />
            </FormField>
          </FormRow>
          <FormRow>
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

        {/* ── Bank Accounts ── */}
        <FormSection title="Bank Accounts">
          {bankFields.length === 0 && (
            <p className="text-sm text-gray-400">No bank accounts added yet.</p>
          )}

          {bankFields.map((field, idx) => {
            const isDefault = watch(`bankAccounts.${idx}.isDefault`);
            return (
              <div key={field.id} className={`rounded-xl border-2 p-4 space-y-3 transition-colors ${isDefault ? 'border-primary-400 bg-orange-50' : 'border-gray-100'}`}>
                {/* Row header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Account {idx + 1}</span>
                    {isDefault && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-primary-600 bg-orange-100 px-2 py-0.5 rounded-full">
                        <Star className="h-3 w-3" /> Default
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!isDefault && (
                      <button type="button" onClick={() => handleSetDefault(idx)}
                        className="text-xs text-gray-500 hover:text-primary-600 border border-gray-200 hover:border-primary-400 rounded px-2 py-0.5 transition-colors">
                        Set as Default
                      </button>
                    )}
                    <button type="button" onClick={() => removeBank(idx)}
                      className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Label + Bank Name */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Label (optional)</label>
                    <input {...register(`bankAccounts.${idx}.label`)} className="input text-sm" placeholder="e.g. Main, Savings, UPI" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Bank Name</label>
                    <input {...register(`bankAccounts.${idx}.bankName`)} className="input text-sm" placeholder="State Bank of India" />
                  </div>
                </div>

                {/* Account holder + Account number */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Account Holder Name</label>
                    <input {...register(`bankAccounts.${idx}.accountHolderName`)} className="input text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Account Number</label>
                    <input {...register(`bankAccounts.${idx}.accountNumber`)} className="input text-sm font-mono" />
                  </div>
                </div>

                {/* IFSC + UPI */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">IFSC Code</label>
                    <input {...register(`bankAccounts.${idx}.ifscCode`)} className="input text-sm font-mono uppercase" placeholder="SBIN0001234" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">UPI ID (optional)</label>
                    <input {...register(`bankAccounts.${idx}.upiId`)} className="input text-sm font-mono" placeholder="name@bank" />
                  </div>
                </div>
              </div>
            );
          })}

          <button type="button" onClick={addBankAccount}
            className="btn-secondary flex items-center gap-2 text-sm w-full justify-center border-dashed">
            <Plus className="h-4 w-4" /> Add Bank Account
          </button>
        </FormSection>

        <FormActions onCancel={() => navigate('/masters/suppliers')} loading={mutation.isPending} submitLabel={isEdit ? 'Update' : 'Create'} />
      </form>
    </div>
  );
};

export default SupplierForm;
