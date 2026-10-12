import { useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import PincodeFields from '../../../components/ui/PincodeFields.jsx';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Star } from 'lucide-react';
import { getSupplier, createSupplier, updateSupplier } from '../../../api/supplier.api.js';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { FormField, FormRow, FormSection, FormActions } from '../../../components/ui/FormField.jsx';
import { PageLoader } from '../../../components/ui/Spinner.jsx';
import toast from 'react-hot-toast';
import { useT } from '../../../i18n/index.jsx';

const SupplierForm = () => {
  const t = useT();
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
  const setPlace = useCallback((patch) => Object.entries(patch).forEach(([k, v]) => setValue(k, v, { shouldDirty: true })), [setValue]);

  const mutation = useMutation({
    mutationFn: (data) => isEdit ? updateSupplier(id, data) : createSupplier(data),
    onSuccess: () => {
      toast.success(isEdit ? t('Supplier updated') : t('Supplier created'));
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['supplier', id] });
      navigate('/masters/suppliers');
    },
    onError: (err) => toast.error(err.response?.data?.message || t('Failed')),
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
        <FormSection title={t('Basic Information')}>
          <FormRow>
            <FormField label={t('Name')} required error={errors.name?.message}>
              <input {...register('name', { required: 'Name is required' })} className="input" placeholder={t('Supplier or donor name')} />
            </FormField>
            <FormField label={t('Type')} required>
              <select {...register('type')} className="input">
                <option value="vendor">{t('Vendor (Supplier)')}</option>
                <option value="donor">{t('Donor')}</option>
                <option value="both">{t('Both')}</option>
              </select>
            </FormField>
          </FormRow>
        </FormSection>

        <FormSection title={t('Contact Details')}>
          <FormRow>
            <FormField label={t('Contact Person')}>
              <input {...register('contactPerson')} className="input" />
            </FormField>
            <FormField label={t('Phone')}>
              <input {...register('phone')} className="input" type="tel" />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label={t('Email')}>
              <input {...register('email')} className="input" type="email" />
            </FormField>
          </FormRow>
          <FormField label={t('Address')} hint={t('House / building, street')}>
            <textarea {...register('address')} rows={2} className="input" />
          </FormField>
          {/* PIN fills city, district and state */}
          <PincodeFields
            value={{ pincode: watch('pincode'), area: watch('area'), city: watch('city'), district: watch('district'), state: watch('state') }}
            onChange={setPlace}
          />
        </FormSection>

        <FormSection title={t('Business Details')}>
          <FormRow cols={3}>
            <FormField label="GSTIN" hint={t('Optional')}>
              <input {...register('gstin')} className="input" placeholder={t('GST number')} />
            </FormField>
            <FormField label={t('PAN Number')} hint={t('Required for 80G donation receipts')}>
              <input {...register('panNumber')} className="input uppercase" placeholder={t('ABCDE1234F')} />
            </FormField>
            <FormField label={t('Credit Days')} hint={t('Payment due after N days from invoice')}>
              <input {...register('creditDays', { valueAsNumber: true, min: 0 })} type="number" min={0} className="input" placeholder="0" />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label=" ">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mt-2">
                <input type="checkbox" {...register('isActive')} className="h-4 w-4 rounded" /> {t('Active')}
              </label>
            </FormField>
          </FormRow>
          <FormField label={t('Notes')}>
            <textarea {...register('notes')} rows={2} className="input" />
          </FormField>
        </FormSection>

        {/* ── Bank Accounts ── */}
        <FormSection title={t('Bank Accounts')}>
          {bankFields.length === 0 && (
            <p className="text-sm text-gray-400">{t('No bank accounts added yet.')}</p>
          )}

          {bankFields.map((field, idx) => {
            const isDefault = watch(`bankAccounts.${idx}.isDefault`);
            return (
              <div key={field.id} className={`rounded-xl border-2 p-4 space-y-3 transition-colors ${isDefault ? 'border-primary-400 bg-orange-50' : 'border-gray-100'}`}>
                {/* Row header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('Account')} {idx + 1}</span>
                    {isDefault && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-primary-600 bg-orange-100 px-2 py-0.5 rounded-full">
                        <Star className="h-3 w-3" /> {t('Default')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!isDefault && (
                      <button type="button" onClick={() => handleSetDefault(idx)}
                        className="text-xs text-gray-500 hover:text-primary-600 border border-gray-200 hover:border-primary-400 rounded px-2 py-0.5 transition-colors">
                        {t('Set as Default')}
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
                    <label className="block text-xs text-gray-500 mb-1">{t('Label (optional)')}</label>
                    <input {...register(`bankAccounts.${idx}.label`)} className="input text-sm" placeholder={t('e.g. Main, Savings, UPI')} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{t('Bank Name')}</label>
                    <input {...register(`bankAccounts.${idx}.bankName`)} className="input text-sm" placeholder={t('State Bank of India')} />
                  </div>
                </div>

                {/* Account holder + Account number */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{t('Account Holder Name')}</label>
                    <input {...register(`bankAccounts.${idx}.accountHolderName`)} className="input text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{t('Account Number')}</label>
                    <input {...register(`bankAccounts.${idx}.accountNumber`)} className="input text-sm font-mono" />
                  </div>
                </div>

                {/* IFSC + UPI */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{t('IFSC Code')}</label>
                    <input {...register(`bankAccounts.${idx}.ifscCode`)} className="input text-sm font-mono uppercase" placeholder={t('SBIN0001234')} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{t('UPI ID (optional)')}</label>
                    <input {...register(`bankAccounts.${idx}.upiId`)} className="input text-sm font-mono" placeholder="name@bank" />
                  </div>
                </div>
              </div>
            );
          })}

          <button type="button" onClick={addBankAccount}
            className="btn-secondary flex items-center gap-2 text-sm w-full justify-center border-dashed">
            <Plus className="h-4 w-4" /> {t('Add Bank Account')}
          </button>
        </FormSection>

        <FormActions onCancel={() => navigate('/masters/suppliers')} loading={mutation.isPending} submitLabel={isEdit ? 'Update' : 'Create'} />
      </form>
    </div>
  );
};

export default SupplierForm;
