import { useFieldArray, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, User, CalendarDays, Shield, Info, Plus, Trash2, Hash } from 'lucide-react';
import { getAssets, getAvailability } from '../../api/asset.api.js';
import { createBorrowGroup } from '../../api/borrowGroup.api.js';
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
    {hint  && !error && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
  </div>
);

// ── Per-item availability indicator ──────────────────────────────────────────
const AvailabilityHint = ({ assetId, returnDate }) => {
  const dAsset  = useDebounce(assetId, 400);
  const dReturn = useDebounce(returnDate, 400);

  const { data } = useQuery({
    queryKey: ['asset-availability', dAsset, dReturn],
    queryFn: () => getAvailability({ assetId: dAsset, returnDate: dReturn }),
    enabled: !!dAsset && !!dReturn,
  });

  const av = data?.data?.data;
  if (!av) return null;

  return (
    <p className={`mt-1 text-xs flex items-center gap-1 ${av.available === 0 ? 'text-red-600' : 'text-green-700'}`}>
      <Info className="h-3.5 w-3.5 shrink-0" />
      {av.available} of {av.totalQuantity} unit(s) available
    </p>
  );
};

// ── Main Form ─────────────────────────────────────────────────────────────────
const NewBorrowRequest = () => {
  const navigate = useNavigate();
  const qc       = useQueryClient();

  const { register, handleSubmit, watch, control, formState: { errors } } = useForm({
    defaultValues: {
      borrower: '', approvedBy: '', expectedReturnDate: '', notes: '',
      items: [{ asset: '', quantity: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const expectedReturnDate = watch('expectedReturnDate');

  const { data: assetsRes }   = useQuery({ queryKey: ['assets-borrowable'], queryFn: () => getAssets({ active: true, borrowable: true }) });
  const { data: settingsRes } = useQuery({ queryKey: ['settings'],          queryFn: getSettings });
  const { data: usersRes }    = useQuery({ queryKey: ['users-active'],      queryFn: () => getUsers({ active: true }) });
  const { data: approversRes }= useQuery({ queryKey: ['users-approvers'],   queryFn: getApprovers });

  const maxDays   = settingsRes?.data?.data?.assetMaxBorrowDays || 7;
  const today     = new Date().toISOString().split('T')[0];
  const maxDate   = new Date(); maxDate.setDate(maxDate.getDate() + maxDays);
  const maxDateStr = maxDate.toISOString().split('T')[0];

  const assets    = assetsRes?.data?.data   || [];
  const users     = usersRes?.data?.data    || [];
  const approvers = approversRes?.data?.data || [];

  const mutation = useMutation({
    mutationFn: createBorrowGroup,
    onSuccess: (res) => {
      toast.success(`Borrow group created — ${res.data?.data?.transactions?.length || 1} item(s)`);
      qc.invalidateQueries({ queryKey: ['asset-transactions'] });
      qc.invalidateQueries({ queryKey: ['borrow-groups'] });
      navigate('/assets/borrows');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const onSubmit = (data) => {
    mutation.mutate({
      borrower:           data.borrower,
      approvedBy:         data.approvedBy,
      expectedReturnDate: data.expectedReturnDate,
      notes:              data.notes || undefined,
      items: data.items.map((item) => ({
        asset:    item.asset,
        quantity: Number(item.quantity),
      })),
    });
  };

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="New Borrow Request"
        subtitle="Log an asset borrow request for one or more items"
        breadcrumbs={[{ label: 'Assets' }, { label: 'Borrow Requests', to: '/assets/borrows' }, { label: 'New' }]}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

        {/* ── Shared details ── */}
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b bg-purple-50">
            <User className="h-5 w-5 text-purple-600" />
            <p className="text-sm font-semibold text-gray-800">Borrow Details</p>
          </div>
          <div className="p-5 bg-white space-y-4">

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
              <Field label="Expected Return Date" required error={errors.expectedReturnDate?.message} hint={`Max ${maxDays} days from today`}>
                <div className="relative">
                  <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                  <input type="date" min={today} max={maxDateStr}
                    {...register('expectedReturnDate', { required: 'Select return date' })}
                    className="input pl-9" />
                </div>
              </Field>
              <Field label="Approved By (Trustee)" required error={errors.approvedBy?.message} hint="Phone approval already received">
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                  <select {...register('approvedBy', { required: 'Select approver' })} className="input pl-9">
                    <option value="">— Select trustee —</option>
                    {approvers.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
                  </select>
                </div>
                {approvers.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">No approvers configured. Enable "Can Approve Assets" on trustee accounts.</p>
                )}
              </Field>
            </div>

            <Field label="Notes">
              <textarea {...register('notes')} className="input" rows={2} placeholder="Optional — event name, purpose, etc." />
            </Field>

          </div>
        </div>

        {/* ── Asset items ── */}
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b bg-green-50">
            <div className="flex items-center gap-3">
              <Package className="h-5 w-5 text-green-600" />
              <p className="text-sm font-semibold text-gray-800">Items to Borrow</p>
              <span className="text-xs text-gray-500 bg-white rounded-full px-2 py-0.5 border">{fields.length} item{fields.length > 1 ? 's' : ''}</span>
            </div>
            <button type="button" onClick={() => append({ asset: '', quantity: 1 })}
              className="flex items-center gap-1.5 text-xs font-semibold text-green-700 hover:text-green-900 transition-colors">
              <Plus className="h-3.5 w-3.5" /> Add Item
            </button>
          </div>

          <div className="divide-y divide-gray-50 bg-white">
            {fields.map((field, index) => {
              const watchedAsset = watch(`items.${index}.asset`);
              return (
                <div key={field.id} className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Item {index + 1}</p>
                    {fields.length > 1 && (
                      <button type="button" onClick={() => remove(index)}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <Field label="Asset" required error={errors.items?.[index]?.asset?.message}>
                        <div className="relative">
                          <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                          <select {...register(`items.${index}.asset`, { required: 'Select asset' })} className="input pl-9">
                            <option value="">— Select asset —</option>
                            {assets.map((a) => <option key={a._id} value={a._id}>{a.name} ({a.category})</option>)}
                          </select>
                        </div>
                        <AvailabilityHint assetId={watchedAsset} returnDate={expectedReturnDate} />
                      </Field>
                    </div>

                    <Field label="Qty" required error={errors.items?.[index]?.quantity?.message}>
                      <div className="relative">
                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                        <input type="number" min="1"
                          {...register(`items.${index}.quantity`, { required: 'Enter qty', min: { value: 1, message: 'Min 1' }, valueAsNumber: true })}
                          className="input pl-9" placeholder="1" />
                      </div>
                    </Field>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={mutation.isPending} className="btn-primary px-6">
            {mutation.isPending ? 'Creating…' : `Create Borrow Request (${fields.length} item${fields.length > 1 ? 's' : ''})`}
          </button>
          <button type="button" onClick={() => navigate('/assets/borrows')} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  );
};

export default NewBorrowRequest;
