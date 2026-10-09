import { useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createExpense, uploadExpenseReceipt } from '../../api/expense.api.js';
import { getUsers } from '../../api/user.api.js';
import SearchableSelect from '../../components/ui/SearchableSelect.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StickyActionBar from '../../components/ui/StickyActionBar.jsx';
import { FormField, FormRow } from '../../components/ui/FormField.jsx';
import { Paperclip, X, Camera } from 'lucide-react';
import toast from 'react-hot-toast';
import haptics from '../../utils/haptics.js';

// Server accepts .jpg/.png/.pdf only; exact types keep HEIC/WebP out of the picker. No `capture`,
// so phones show the OS chooser with both camera and gallery/files.
const RECEIPT_ACCEPT = 'image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf';

const CATEGORIES = [
  { value: 'electricity',   label: 'Electricity' },
  { value: 'water',         label: 'Water' },
  { value: 'salary',        label: 'Salary' },
  { value: 'priest_fees',   label: 'Priest Fees' },
  { value: 'maintenance',   label: 'Maintenance' },
  { value: 'decoration',    label: 'Decoration' },
  { value: 'printing',      label: 'Printing & Stationery' },
  { value: 'miscellaneous', label: 'Miscellaneous' },
];

const PM_OPTIONS = [
  { value: 'cash',   label: 'Cash' },
  { value: 'upi',    label: 'UPI / Online Transfer' },
  { value: 'cheque', label: 'Cheque' },
];

const monthLabel = () => {
  const d = new Date();
  return d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
};

export default function NewExpense() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fileInputRef = useRef(null);
  const [receiptFile, setReceiptFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: usersRes } = useQuery({
    queryKey: ['users', 'active'],
    queryFn:  () => getUsers({ active: true }),
  });
  const staffList = usersRes?.data?.data || [];

  const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm({
    defaultValues: {
      category: '', description: '', amount: '', payee: '',
      expenseDate: new Date().toISOString().split('T')[0],
      paymentMode: '', referenceNumber: '', notes: '',
    },
  });

  const category    = watch('category');
  const paymentMode = watch('paymentMode');
  const isSalary    = category === 'salary';
  const showRef     = paymentMode === 'cheque' || paymentMode === 'upi';

  const handleStaffSelect = (staffId) => {
    const member = staffList.find((s) => s._id === staffId);
    if (!member) return;
    setValue('payee', member.name);
    if (member.monthlySalary > 0) setValue('amount', member.monthlySalary);
    setValue('description', `Salary — ${monthLabel()} — ${member.name}`);
  };

  const mutation = useMutation({
    mutationFn: createExpense,
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to create expense'),
  });

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    try {
      const res = await mutation.mutateAsync({
        ...data,
        amount:          Number(data.amount),
        referenceNumber: data.referenceNumber || undefined,
        payee:           data.payee           || undefined,
        notes:           data.notes           || undefined,
      });
      const id = res.data.data._id;
      qc.invalidateQueries({ queryKey: ['expenses'] });
      if (receiptFile) {
        try {
          await uploadExpenseReceipt(id, receiptFile);
          toast.success('Expense submitted with receipt');
        } catch {
          toast.success('Expense submitted for approval');
          toast.error('Receipt upload failed — you can attach it from the detail page');
        }
      } else {
        toast.success('Expense submitted for approval');
      }
      navigate(`/expenses/${id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl space-y-4">
      <PageHeader
        title="New Expense"
        breadcrumbs={[{ label: 'Expenses', to: '/expenses' }, { label: 'New' }]}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="card p-4 sm:p-6 space-y-4">

        <FormRow>
          <FormField label="Category" required error={errors.category?.message}>
            <Controller
              name="category"
              control={control}
              rules={{ required: 'Category is required' }}
              render={({ field }) => (
                <SearchableSelect
                  value={field.value}
                  onChange={(val) => { field.onChange(val); }}
                  options={CATEGORIES}
                  placeholder="Select category…"
                  nullable={false}
                />
              )}
            />
          </FormField>

          <FormField label="Expense Date" required error={errors.expenseDate?.message}>
            <input
              type="date"
              {...register('expenseDate', { required: 'Date is required' })}
              className="input"
            />
          </FormField>
        </FormRow>

        {/* Staff picker — only visible when category = salary */}
        {isSalary && (
          <FormField label="Staff Member" hint="Select to auto-fill name and salary amount">
            <SearchableSelect
              value=""
              onChange={handleStaffSelect}
              options={staffList.map((s) => ({
                value: s._id,
                label: s.name,
                sub:   s.monthlySalary > 0
                  ? `${s.role} · ₹${s.monthlySalary.toLocaleString('en-IN')}`
                  : s.role,
              }))}
              placeholder="Pick a staff member…"
            />
          </FormField>
        )}

        <FormField label="Description" required error={errors.description?.message}>
          <input
            {...register('description', { required: 'Description is required' })}
            className="input"
            placeholder={isSalary ? 'e.g. Salary — June 2025 — Pandit Ramesh' : 'e.g. Electricity bill for May 2025'}
          />
        </FormField>

        <FormRow>
          <FormField label="Amount (₹)" required error={errors.amount?.message}>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              {...register('amount', { required: 'Amount is required', min: { value: 0.01, message: 'Must be > 0' } })}
              className="input"
              placeholder="0.00"
            />
          </FormField>

          <FormField label={isSalary ? 'Staff Name' : 'Payee'}>
            <input
              {...register('payee')}
              className="input"
              placeholder={isSalary ? 'Auto-filled from staff picker' : 'e.g. MSEDCL, Pandit Ramesh…'}
            />
          </FormField>
        </FormRow>

        <FormRow>
          <FormField label="Payment Mode" required error={errors.paymentMode?.message}>
            <Controller
              name="paymentMode"
              control={control}
              rules={{ required: 'Payment mode is required' }}
              render={({ field }) => (
                <>
                  <div className="hidden sm:block">
                    <SearchableSelect
                      value={field.value}
                      onChange={field.onChange}
                      options={PM_OPTIONS}
                      placeholder="Select mode…"
                      nullable={false}
                    />
                  </div>
                  {/* Phones: three options fit as a one-tap segmented control */}
                  <div className="grid grid-cols-3 gap-2 sm:hidden" role="radiogroup" aria-label="Payment mode">
                    {PM_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={field.value === o.value}
                        onClick={() => { haptics.select(); field.onChange(o.value); }}
                        className={`min-h-[44px] rounded-lg border px-2 text-sm font-medium transition-colors ${
                          field.value === o.value
                            ? 'border-primary-500 bg-primary-50 text-primary-700'
                            : 'border-gray-300 bg-white text-gray-700'
                        }`}
                      >
                        {o.value === 'upi' ? 'UPI' : o.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            />
          </FormField>

          {showRef && (
            <FormField label={paymentMode === 'cheque' ? 'Cheque Number' : 'UTR / Reference'}>
              <input
                {...register('referenceNumber')}
                className="input font-mono"
                placeholder={paymentMode === 'cheque' ? 'e.g. 001234' : 'e.g. T2025123456'}
              />
            </FormField>
          )}
        </FormRow>

        <FormField label="Notes">
          <textarea
            {...register('notes')}
            rows={2}
            className="input"
            placeholder="Optional notes"
          />
        </FormField>

        <FormField label="Receipt / Bill" hint="Optional · JPG, PNG or PDF · Max 5 MB">
          <input
            ref={fileInputRef}
            type="file"
            accept={RECEIPT_ACCEPT}
            className="hidden"
            onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
          />
          {receiptFile ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
              <Paperclip className="h-4 w-4 text-gray-400 shrink-0" />
              <span className="flex-1 truncate text-gray-700">{receiptFile.name}</span>
              <button
                type="button"
                onClick={() => { setReceiptFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                className="-m-2 p-2 sm:m-0 sm:p-0 text-gray-400 hover:text-red-500 transition-colors"
                aria-label="Remove receipt"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-secondary flex items-center gap-2 text-sm w-full sm:w-fit"
            >
              <Camera className="h-4 w-4 sm:hidden" />
              <Paperclip className="hidden h-4 w-4 sm:block" /> Attach Receipt
            </button>
          )}
        </FormField>

        {/* Pinned to the bottom on phones (Submit on the right); unchanged left-aligned row from sm up */}
        <StickyActionBar className="flex-row-reverse sm:flex-row sm:items-center sm:!justify-start sm:gap-3 sm:pt-2">
          <button type="submit" disabled={isSubmitting} className="btn-primary">
            {isSubmitting ? (receiptFile ? 'Uploading…' : 'Submitting…') : 'Submit for Approval'}
          </button>
          <button type="button" onClick={() => navigate('/expenses')} className="btn-secondary max-sm:!flex-none max-sm:px-5">
            Cancel
          </button>
        </StickyActionBar>
      </form>
    </div>
  );
}
