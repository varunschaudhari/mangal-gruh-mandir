import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Tag, IndianRupee, CheckCircle2, Handshake } from 'lucide-react';
import { getAsset, createAsset, updateAsset } from '../../api/asset.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import toast from 'react-hot-toast';

const CATEGORIES = ['Electronics', 'Utensils', 'Furniture', 'Mandap', 'Vessels', 'Decoration', 'Other'];

const Field = ({ label, required, error, hint, children }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
      {label} {required && <span className="text-red-400">*</span>}
    </label>
    {children}
    {hint && !error && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
  </div>
);

const AssetForm = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { isActive: true, isBorrowable: true, finePerDay: 0, category: 'Other' },
  });

  const { data: assetRes, isLoading } = useQuery({
    queryKey: ['asset', id], queryFn: () => getAsset(id), enabled: isEdit,
  });

  useEffect(() => {
    if (assetRes?.data?.data) reset(assetRes.data.data);
  }, [assetRes]);

  const mutation = useMutation({
    mutationFn: (data) => isEdit ? updateAsset(id, data) : createAsset(data),
    onSuccess: () => {
      toast.success(isEdit ? 'Asset updated' : 'Asset created');
      qc.invalidateQueries({ queryKey: ['assets'] });
      navigate('/assets');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  if (isEdit && isLoading) return <PageLoader />;

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={isEdit ? 'Edit Asset' : 'New Asset'}
        breadcrumbs={[{ label: 'Assets', to: '/assets' }, { label: isEdit ? 'Edit' : 'New' }]}
      />

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b bg-blue-50">
            <Package className="h-5 w-5 text-blue-600" />
            <p className="text-sm font-semibold text-gray-800">Asset Details</p>
          </div>
          <div className="p-5 bg-white space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Asset Name" required error={errors.name?.message}>
                <input {...register('name', { required: 'Name is required' })} className="input" placeholder="e.g. Speaker System" />
              </Field>
              <Field label="Category">
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                  <select {...register('category')} className="input pl-9">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Total Quantity" required error={errors.totalQuantity?.message} hint="Total units owned by temple">
                <input
                  type="number" min="1"
                  {...register('totalQuantity', { required: 'Quantity is required', min: { value: 1, message: 'Min 1' }, valueAsNumber: true })}
                  className="input" placeholder="e.g. 10"
                />
              </Field>
              <Field label="Fine Per Day (₹)" hint="Leave 0 if no fine for late return">
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                  <input
                    type="number" min="0" step="0.5"
                    {...register('finePerDay', { min: 0, valueAsNumber: true })}
                    className="input pl-9" placeholder="0"
                  />
                </div>
              </Field>
            </div>

            <Field label="Description">
              <textarea {...register('description')} className="input" rows={3} placeholder="Optional description" />
            </Field>

            <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" {...register('isActive')} className="h-4 w-4 rounded text-primary-600" />
                <CheckCircle2 className="h-4 w-4 text-gray-400" />
                <span className="font-medium text-gray-700">Asset is Active</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" {...register('isBorrowable')} className="h-4 w-4 rounded text-primary-600" />
                <Handshake className="h-4 w-4 text-gray-400" />
                <span className="font-medium text-gray-700">Available for Borrowing</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={mutation.isPending} className="btn-primary px-6">
            {mutation.isPending ? 'Saving…' : isEdit ? 'Update Asset' : 'Create Asset'}
          </button>
          <button type="button" onClick={() => navigate('/assets')} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  );
};

export default AssetForm;
