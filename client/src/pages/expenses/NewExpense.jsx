import { useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createExpense, uploadExpenseReceipt } from '../../api/expense.api.js';
import { getUsers } from '../../api/user.api.js';
import SearchableSelect from '../../components/ui/SearchableSelect.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { FormField, FormRow } from '../../components/ui/FormField.jsx';
import { Paperclip, X } from 'lucide-react';
import toast from 'react-hot-toast';

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

      <form onSubmit={handleSubmit(onSubmit)} className="card p-6 space-y-4">

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
                <SearchableSelect
                  value={field.value}
                  onChange={field.onChange}
                  options={PM_OPTIONS}
                  placeholder="Select mode…"
                  nullable={false}
                />
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
            accept=".jpg,.jpeg,.png,.pdf"
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
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-secondary flex items-center gap-2 text-sm w-fit"
            >
              <Paperclip className="h-4 w-4" /> Attach Receipt
            </button>
          )}
        </FormField>

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={isSubmitting} className="btn-primary">
            {isSubmitting ? (receiptFile ? 'Uploading…' : 'Submitting…') : 'Submit for Approval'}
          </button>
          <button type="button" onClick={() => navigate('/expenses')} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
