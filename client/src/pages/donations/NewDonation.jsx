import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart, User, CalendarDays, IndianRupee, Package, Plus, Trash2, Printer, FileCheck2, UserCheck, Clock } from 'lucide-react';
import { createDonation, lookupDonor } from '../../api/donation.api.js';
import { getOccasions } from '../../api/donationOccasion.api.js';
import { getSuppliers } from '../../api/supplier.api.js';
import { getDepartments } from '../../api/department.api.js';
import api from '../../api/axios.js';
import { printDonationReceipt } from '../../utils/donationReceipt.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { useDebounce } from '../../hooks/useDebounce.js';
import toast from 'react-hot-toast';

const Field = ({ label, required, hint, error, children }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
      {label}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
    {children}
    {hint  && !error && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
  </div>
);


const NewDonation = () => {
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const [lastDonation, setLastDonation] = useState(null);

  const { register, handleSubmit, watch, control, setValue, formState: { errors } } = useForm({
    defaultValues: {
      donationType: 'named',
      date: new Date().toISOString().split('T')[0],
      cashAmount: '',
      paymentMode: 'cash',
      is80G: false,
      kindItems: [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'kindItems' });
  const donationType  = watch('donationType');
  const cashAmount    = watch('cashAmount');
  const panNumber     = watch('panNumber');
  const is80G         = watch('is80G');
  const donorPhone    = watch('donorPhone');

  const debouncedPhone = useDebounce(donorPhone, 600);

  const { data: donorLookupRes } = useQuery({
    queryKey: ['donor-lookup', debouncedPhone],
    queryFn: () => lookupDonor(debouncedPhone),
    enabled: donationType === 'named' && !watch('donor') && !!debouncedPhone?.trim() && debouncedPhone.trim().length >= 7,
    staleTime: 60 * 1000,
  });
  const donorMatch = donorLookupRes?.data?.data;

  const applyDonorSuggestion = () => {
    if (!donorMatch) return;
    if (donorMatch.donorName) setValue('donorName', donorMatch.donorName);
    if (donorMatch.panNumber)  setValue('panNumber', donorMatch.panNumber);
    if (donorMatch.donorId)    setValue('donor', donorMatch.donorId);
    toast.success('Donor details filled in');
  };

  const { data: occasionsRes } = useQuery({ queryKey: ['donation-occasions'],  queryFn: () => getOccasions({ active: true }) });
  const { data: donorsRes }    = useQuery({ queryKey: ['suppliers-donors'],     queryFn: () => getSuppliers({ type: 'donor', active: 'true' }) });
  const { data: deptsRes }     = useQuery({ queryKey: ['departments'],          queryFn: () => getDepartments() });
  const { data: productsRes }  = useQuery({ queryKey: ['products-active'],      queryFn: () => api.get('/products', { params: { isActive: true } }) });

  const occasions = occasionsRes?.data?.data || [];
  const donors    = donorsRes?.data?.data || [];
  const depts     = deptsRes?.data?.data || [];
  const products  = productsRes?.data?.data || [];
  const mainStore = depts.find((d) => d.code === 'STR' || /main store/i.test(d.name));

  const mutation = useMutation({
    mutationFn: createDonation,
    onSuccess: (res) => {
      const donation = res.data?.data;
      toast.success(`Donation ${donation?.donationNumber} recorded`);
      setLastDonation(donation);
      qc.invalidateQueries({ queryKey: ['donations'] });
      qc.invalidateQueries({ queryKey: ['donation-stats'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to record donation'),
  });

  const onSubmit = (data) => {
    mutation.mutate({
      ...data,
      cashAmount: Number(data.cashAmount) || 0,
      kindItems: data.kindItems.map((item) => ({
        ...item,
        quantity:       Number(item.quantity),
        estimatedValue: Number(item.estimatedValue) || 0,
        department:     item.department || mainStore?._id,
      })),
    });
  };

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Record Donation"
        subtitle="Cash (nakad) and kind (vastu) donations"
        breadcrumbs={[{ label: 'Donations' }, { label: 'History', to: '/donations' }, { label: 'New' }]}
      />

      {/* Post-save: receipt option */}
      {lastDonation && (
        <div className="mb-5 rounded-xl border border-green-200 bg-green-50 p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-green-800">
              {lastDonation.donationNumber} recorded ✓
            </p>
            <p className="text-xs text-green-600 mt-0.5">
              Total: ₹{(lastDonation.totalEstimatedValue || 0).toLocaleString('en-IN')}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {lastDonation.donationType !== 'hundi' && (
              <button onClick={() => printDonationReceipt(lastDonation)}
                className="btn-secondary flex items-center gap-2 text-sm">
                <Printer className="h-4 w-4" /> Print Receipt
              </button>
            )}
            <button onClick={() => setLastDonation(null)} className="btn-primary text-sm">
              New Donation
            </button>
          </div>
        </div>
      )}

      {!lastDonation && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

          {/* Donation type */}
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b bg-orange-50">
              <Heart className="h-5 w-5 text-orange-600" />
              <p className="text-sm font-semibold text-gray-800">Donation Type</p>
            </div>
            <div className="p-5 bg-white">
              <div className="flex gap-3">
                {[
                  ['named',     'Named Donor',  'Known donor — generates receipt'],
                  ['hundi',     'Hundi',         'Daily box collection, no receipt'],
                  ['anonymous', 'Anonymous',     'No donor info required'],
                ].map(([val, label, desc]) => (
                  <label key={val} onClick={() => setValue('donationType', val)}
                    className={`flex-1 rounded-xl border-2 p-3 cursor-pointer transition-all ${donationType === val ? 'border-orange-400 bg-orange-50' : 'border-gray-100 hover:border-gray-200'}`}>
                    <p className={`text-sm font-semibold ${donationType === val ? 'text-orange-700' : 'text-gray-700'}`}>{label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b bg-purple-50">
              <User className="h-5 w-5 text-purple-600" />
              <p className="text-sm font-semibold text-gray-800">Details</p>
            </div>
            <div className="p-5 bg-white space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Date" required>
                  <div className="relative">
                    <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                    <input type="date" max={new Date().toISOString().split('T')[0]}
                      {...register('date', { required: true })} className="input pl-9" />
                  </div>
                </Field>
                <Field label="Occasion / Purpose">
                  <select {...register('occasion')} className="input">
                    <option value="">— General / Unspecified —</option>
                    {occasions.map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}
                  </select>
                </Field>
              </div>

              {donationType === 'named' && (
                <>
                  <Field label="Donor" hint="Select from list, or leave blank and enter below">
                    <select {...register('donor')} className="input">
                      <option value="">— Walk-in / New donor —</option>
                      {donors.map((d) => (
                        <option key={d._id} value={d._id}>
                          {d.name}{d.phone ? ` · ${d.phone}` : ''}{d.panNumber ? ` · PAN: ${d.panNumber}` : ''}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Donor Name (walk-in)">
                      <input {...register('donorName')} className="input" placeholder="Full name" />
                    </Field>
                    <Field label="Phone">
                      <input {...register('donorPhone')} className="input" type="tel" placeholder="91XXXXXXXXXX" />
                    </Field>
                  </div>

                  {/* Returning donor suggestion */}
                  {donorMatch && !watch('donor') && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-3">
                      <UserCheck className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-blue-800">Returning donor found</p>
                        <p className="text-xs text-blue-600 mt-0.5">
                          <strong>{donorMatch.donorName || 'Unknown name'}</strong>
                          {donorMatch.panNumber && <> · PAN: {donorMatch.panNumber}</>}
                          {' · '}
                          <Clock className="h-3 w-3 inline" />{' '}
                          {donorMatch.donationCount} donation{donorMatch.donationCount !== 1 ? 's' : ''}
                          {' · ₹'}{(donorMatch.totalAmount || 0).toLocaleString('en-IN')} total
                        </p>
                      </div>
                      <button type="button" onClick={applyDonorSuggestion}
                        className="shrink-0 text-xs font-semibold bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
                        Use Details
                      </button>
                    </div>
                  )}

                  <Field label="PAN Number" hint="Required for 80G tax exemption certificate">
                    <input {...register('panNumber')} className="input uppercase" placeholder="ABCDE1234F" />
                  </Field>
                  {panNumber && (
                    <label className={`flex items-center gap-3 rounded-lg border-2 px-4 py-3 cursor-pointer transition-all ${is80G ? 'border-emerald-400 bg-emerald-50' : 'border-gray-100 hover:border-gray-200'}`}>
                      <input type="checkbox" {...register('is80G')} className="sr-only" />
                      <div className={`w-10 h-5 rounded-full flex items-center px-0.5 transition-colors ${is80G ? 'bg-emerald-500' : 'bg-gray-200'}`}>
                        <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${is80G ? 'translate-x-5' : 'translate-x-0'}`} />
                      </div>
                      <div className="flex items-center gap-2">
                        <FileCheck2 className={`h-4 w-4 ${is80G ? 'text-emerald-600' : 'text-gray-400'}`} />
                        <div>
                          <p className={`text-sm font-semibold ${is80G ? 'text-emerald-700' : 'text-gray-600'}`}>80G Eligible Donation</p>
                          <p className="text-xs text-gray-400">Generates an 80G tax exemption receipt for the donor</p>
                        </div>
                      </div>
                    </label>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Cash */}
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b bg-green-50">
              <IndianRupee className="h-5 w-5 text-green-600" />
              <p className="text-sm font-semibold text-gray-800">Cash Donation (Nakad Daan)</p>
            </div>
            <div className="p-5 bg-white space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Amount (₹)">
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                    <input type="number" min="0" step="1" {...register('cashAmount')} className="input pl-9" placeholder="0" />
                  </div>
                </Field>
                <Field label="Payment Mode">
                  <select {...register('paymentMode')} className="input">
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="cheque">Cheque</option>
                    <option value="bank_transfer">Bank Transfer</option>
                  </select>
                </Field>
              </div>
              <Field label="Reference No." hint="UPI transaction ID, cheque number, etc.">
                <input {...register('paymentRef')} className="input" placeholder="Optional" />
              </Field>
            </div>
          </div>

          {/* Kind items */}
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b bg-blue-50">
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-blue-600" />
                <p className="text-sm font-semibold text-gray-800">Kind Donations (Vastu Daan)</p>
                {fields.length > 0 && (
                  <span className="text-xs text-gray-500 bg-white rounded-full px-2 py-0.5 border">
                    {fields.length} item{fields.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <button type="button"
                onClick={() => append({ product: '', quantity: '', estimatedValue: '', department: mainStore?._id || '' })}
                className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900">
                <Plus className="h-3.5 w-3.5" /> Add Item
              </button>
            </div>

            {fields.length === 0 ? (
              <p className="p-5 text-sm text-gray-400 bg-white">No kind items — click "Add Item" to record donated goods.</p>
            ) : (
              <div className="divide-y divide-gray-50 bg-white">
                {fields.map((field, index) => (
                  <div key={field.id} className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Item {index + 1}</p>
                      <button type="button" onClick={() => remove(index)} className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="col-span-2">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Item <span className="text-red-400">*</span></label>
                        <select
                          {...register(`kindItems.${index}.product`, { required: true })}
                          className="input text-sm"
                          onChange={(e) => {
                            const selected = products.find((p) => p._id === e.target.value);
                            if (selected?.unit) setValue(`kindItems.${index}.unit`, selected.unit._id || selected.unit);
                          }}
                        >
                          <option value="">— Select item —</option>
                          {products.map((p) => <option key={p._id} value={p._id}>{p.name} ({p.code})</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Qty <span className="text-red-400">*</span></label>
                        <input type="number" min="0.01" step="0.01"
                          {...register(`kindItems.${index}.quantity`, { required: true, min: 0.01 })}
                          className="input" placeholder="1" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Est. Value (₹)</label>
                        <input type="number" min="0"
                          {...register(`kindItems.${index}.estimatedValue`)}
                          className="input" placeholder="0" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">To Department</label>
                      <select {...register(`kindItems.${index}.department`)} defaultValue={mainStore?._id || ''} className="input">
                        {depts.map((d) => (
                          <option key={d._id} value={d._id}>
                            {d.name}{d._id === mainStore?._id ? ' (Default)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Field label="Notes">
            <textarea {...register('notes')} className="input" rows={2} placeholder="Optional — event details, special instructions, etc." />
          </Field>

          {!cashAmount && fields.length === 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Add a cash amount or at least one kind item to save.
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={mutation.isPending || (!Number(cashAmount) && fields.length === 0)}
              className="btn-primary px-6 disabled:opacity-50">
              {mutation.isPending ? 'Saving…' : 'Record Donation'}
            </button>
            <button type="button" onClick={() => navigate('/donations')} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
};

export default NewDonation;
