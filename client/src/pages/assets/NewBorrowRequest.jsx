import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, User, CalendarDays, Hash, Shield, Info } from 'lucide-react';
import { getAssets } from '../../api/asset.api.js';
import { createBorrowRequest, getAvailability } from '../../api/assetTransaction.api.js';
import { getSettings } from '../../api/settings.api.js';
import { getUsers, getApprovers } from '../../api/user.api.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import toast from 'react-hot-toast';

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

const NewBorrowRequest = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: { quantityBorrowed: 1 },
  });

  const watchedAsset      = watch('asset');
  const watchedReturnDate = watch('expectedReturnDate');

  const debouncedAsset      = useDebounce(watchedAsset, 400);
  const debouncedReturnDate = useDebounce(watchedReturnDate, 400);

  const { data: assetsRes }   = useQuery({ queryKey: ['assets-active'], queryFn: () => getAssets({ active: true }) });
  const { data: settingsRes } = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const { data: usersRes }    = useQuery({ queryKey: ['users-active'], queryFn: () => getUsers({ active: true }) });
  const { data: approversRes }= useQuery({ queryKey: ['users-approvers'], queryFn: getApprovers });

  const { data: availRes } = useQuery({
    queryKey: ['asset-availability', debouncedAsset, debouncedReturnDate],
    queryFn: () => getAvailability({ assetId: debouncedAsset, returnDate: debouncedReturnDate }),
    enabled: !!debouncedAsset && !!debouncedReturnDate,
  });

  const maxDays = settingsRes?.data?.data?.assetMaxBorrowDays || 7;

  const today = new Date().toISOString().split('T')[0];
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + maxDays);
  const maxDateStr = maxDate.toISOString().split('T')[0];

  const assets    = assetsRes?.data?.data   || [];
  const users     = usersRes?.data?.data    || [];
  const approvers = approversRes?.data?.data || [];
  const availData = availRes?.data?.data;

  const mutation = useMutation({
    mutationFn: createBorrowRequest,
    onSuccess: () => {
      toast.success('Borrow request created');
      qc.invalidateQueries({ queryKey: ['asset-transactions'] });
      navigate('/assets/borrows');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="New Borrow Request"
        breadcrumbs={[{ label: 'Assets' }, { label: 'Borrow Requests', to: '/assets/borrows' }, { label: 'New' }]}
      />

      <form onSubmit={handleSubmit((d) => mutation.mutate({ ...d, quantityBorrowed: Number(d.quantityBorrowed) }))} className="space-y-4">

        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b bg-green-50">
            <Package className="h-5 w-5 text-green-600" />
            <p className="text-sm font-semibold text-gray-800">Borrow Details</p>
          </div>
          <div className="p-5 bg-white space-y-4">

            <Field label="Asset" required error={errors.asset?.message}>
              <div className="relative">
                <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                <select {...register('asset', { required: 'Select an asset' })} className="input pl-9">
                  <option value="">— Select asset —</option>
                  {assets.map((a) => <option key={a._id} value={a._id}>{a.name} ({a.category})</option>)}
                </select>
              </div>
              {availData && (
                <p className={`mt-1.5 text-xs flex items-center gap-1 ${availData.available === 0 ? 'text-red-600' : 'text-green-700'}`}>
                  <Info className="h-3.5 w-3.5" />
                  {availData.available} of {availData.totalQuantity} unit(s) available
                </p>
              )}
            </Field>

            <Field label="Borrower" required error={errors.borrower?.message}>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                <select {...register('borrower', { required: 'Select borrower' })} className="input pl-9">
                  <option value="">— Select staff member —</option>
                  {users.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
                </select>
              </div>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Quantity" required error={errors.quantityBorrowed?.message}>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                  <input
                    type="number" min="1"
                    {...register('quantityBorrowed', { required: 'Enter quantity', min: { value: 1, message: 'Min 1' } })}
                    className="input pl-9" placeholder="1"
                  />
                </div>
              </Field>
              <Field label="Expected Return Date" required error={errors.expectedReturnDate?.message} hint={`Max ${maxDays} days from today`}>
                <div className="relative">
                  <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                  <input
                    type="date" min={today} max={maxDateStr}
                    {...register('expectedReturnDate', { required: 'Select return date' })}
                    className="input pl-9"
                  />
                </div>
              </Field>
            </div>

            <Field label="Approved By (Trustee)" required error={errors.approvedBy?.message} hint="Person who approved this request over phone">
              <div className="relative">
                <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                <select {...register('approvedBy', { required: 'Select approver' })} className="input pl-9">
                  <option value="">— Select approver —</option>
                  {approvers.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
                </select>
              </div>
              {approvers.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">No approvers configured. Ask admin to enable "Can Approve Assets" on trustee accounts.</p>
              )}
            </Field>

            <Field label="Notes">
              <textarea {...register('notes')} className="input" rows={2} placeholder="Optional notes" />
            </Field>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={mutation.isPending} className="btn-primary px-6">
            {mutation.isPending ? 'Creating…' : 'Create Borrow Request'}
          </button>
          <button type="button" onClick={() => navigate('/assets/borrows')} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  );
};

export default NewBorrowRequest;
