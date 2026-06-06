import { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2, AlertTriangle, CreditCard } from 'lucide-react';
import { getSuppliers, getSupplier } from '../../api/supplier.api.js';
import { createPayment, getSupplierInvoices } from '../../api/supplierPayment.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import toast from 'react-hot-toast';

const fmt    = (d)  => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtAmt = (n)  => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const PM_OPTIONS = [
  { value: 'cash',   label: 'Cash' },
  { value: 'upi',    label: 'UPI / Online' },
  { value: 'neft',   label: 'NEFT' },
  { value: 'rtgs',   label: 'RTGS' },
  { value: 'cheque', label: 'Cheque' },
];

export default function NewSupplierPayment() {
  const navigate       = useNavigate();
  const qc             = useQueryClient();
  const [searchParams] = useSearchParams();
  const preSupplier    = searchParams.get('supplier');

  const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm({
    defaultValues: {
      supplier:             preSupplier || '',
      paymentDate:          new Date().toISOString().split('T')[0],
      paymentMode:          'cash',
      referenceNumber:      '',
      selectedBankAccountId: '',
      notes:                '',
      invoices:             [],
    },
  });

  const { fields: invFields, append: appendInv, remove: removeInv, replace: replaceInv } = useFieldArray({ control, name: 'invoices' });

  const supplierId            = watch('supplier');
  const invoiceItems          = watch('invoices');
  const paymentMode           = watch('paymentMode');
  const selectedBankAccountId = watch('selectedBankAccountId');

  const { data: supRes } = useQuery({
    queryKey: ['suppliers-all'],
    queryFn:  () => getSuppliers({ limit: 200, type: 'vendor' }),
  });
  const suppliers = supRes?.data?.data || [];

  // Fetch selected supplier details (for bank accounts)
  const { data: selSupRes } = useQuery({
    queryKey: ['supplier', supplierId],
    queryFn:  () => getSupplier(supplierId),
    enabled:  !!supplierId,
  });
  const selectedSupplier = selSupRes?.data?.data;
  const bankAccounts     = selectedSupplier?.bankAccounts || [];

  const { data: invRes } = useQuery({
    queryKey: ['supplier-invoices', supplierId],
    queryFn:  () => getSupplierInvoices(supplierId),
    enabled:  !!supplierId,
  });
  const unpaidInvoices = (invRes?.data?.data || []).filter((i) => i.paymentStatus !== 'paid');

  // When supplier changes, reset invoice list and select default bank account
  useEffect(() => {
    replaceInv([]);
    const defaultAcc = bankAccounts.find((a) => a.isDefault) || bankAccounts[0];
    setValue('selectedBankAccountId', defaultAcc?._id || '');
  }, [supplierId, bankAccounts.length]);

  // Calculate running total from invoices
  const invoiceTotal = invoiceItems.reduce((s, i) => s + (Number(i.paidAmount) || 0), 0);

  const addInvoice = (inv) => {
    appendInv({
      invoiceNumber: inv.invoiceNumber || '',
      invoiceDate:   inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().split('T')[0] : '',
      invoiceTotal:  inv.invoiceTotal,
      paidAmount:    inv.remaining,
    });
  };

  const addAdvance = () => {
    appendInv({ invoiceNumber: '', invoiceDate: new Date().toISOString().split('T')[0], invoiceTotal: 0, paidAmount: 0 });
  };

  // Sync total amount with invoice sum when invoices exist
  useEffect(() => {
    if (invFields.length > 0) setValue('totalAmount', String(invoiceTotal));
  }, [invoiceTotal, invFields.length]);

  const mutation = useMutation({
    mutationFn: (data) => createPayment({
      supplier:             data.supplier,
      invoices:             data.invoices.length > 0 ? data.invoices : [],
      totalAmount:          Number(data.totalAmount),
      paymentDate:          data.paymentDate,
      paymentMode:          data.paymentMode,
      referenceNumber:      data.referenceNumber || undefined,
      selectedBankAccountId: data.selectedBankAccountId || undefined,
      notes:                data.notes || undefined,
    }),
    onSuccess: (res) => {
      toast.success('Payment submitted for approval');
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['supplier-invoices'] });
      navigate(`/payments/${res.data.data._id}`);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to submit'),
  });

  const needsRef = ['upi', 'neft', 'rtgs', 'cheque'].includes(paymentMode);

  const selectedAcc = bankAccounts.find((a) => a._id === selectedBankAccountId);

  return (
    <div className="max-w-3xl space-y-4">
      <button onClick={() => navigate('/payments')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Payments
      </button>

      <PageHeader
        title="Record Payment"
        subtitle="Submit a payment for trustee approval"
        breadcrumbs={[{ label: 'Payments', to: '/payments' }, { label: 'New' }]}
      />

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">

        {/* Supplier + Date */}
        <div className="card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Payment Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Supplier *</label>
              <select {...register('supplier', { required: 'Supplier is required' })} className="input">
                <option value="">Select supplier…</option>
                {suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
              {errors.supplier && <p className="mt-1 text-xs text-red-500">{errors.supplier.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Payment Date *</label>
              <input {...register('paymentDate', { required: true })} type="date" className="input" />
            </div>
          </div>

          {/* Bank account selector */}
          {supplierId && bankAccounts.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Pay To Bank Account</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {bankAccounts.map((acc) => {
                  const isSelected = selectedBankAccountId === acc._id;
                  return (
                    <label key={acc._id}
                      className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${isSelected ? 'border-primary-400 bg-orange-50' : 'border-gray-100 hover:border-gray-300'}`}>
                      <input type="radio" value={acc._id} {...register('selectedBankAccountId')}
                        className="mt-0.5 h-4 w-4 text-primary-600" />
                      <div>
                        <p className="text-sm font-semibold text-gray-800">
                          {acc.label || acc.bankName || 'Account'}
                          {acc.isDefault && <span className="ml-1.5 text-xs text-primary-600">(Default)</span>}
                        </p>
                        {acc.bankName && acc.label && <p className="text-xs text-gray-500">{acc.bankName}</p>}
                        {acc.accountNumber && <p className="text-xs font-mono text-gray-500">A/C: {acc.accountNumber}</p>}
                        {acc.ifscCode && <p className="text-xs font-mono text-gray-400">IFSC: {acc.ifscCode}</p>}
                        {acc.upiId && <p className="text-xs font-mono text-gray-400">UPI: {acc.upiId}</p>}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          {supplierId && bankAccounts.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg p-2.5">
              <CreditCard className="h-4 w-4 shrink-0" />
              No bank accounts on file for this supplier. Add them in the supplier profile.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Payment Mode *</label>
              <select {...register('paymentMode')} className="input">
                {PM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {needsRef && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  {paymentMode === 'cheque' ? 'Cheque No.' : 'Reference / UTR No.'} *
                </label>
                <input {...register('referenceNumber', { required: needsRef ? 'Reference number is required' : false })}
                  className="input font-mono" placeholder="Transaction / cheque number" />
                {errors.referenceNumber && <p className="mt-1 text-xs text-red-500">{errors.referenceNumber.message}</p>}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Notes</label>
            <textarea {...register('notes')} rows={2} className="input" placeholder="Optional notes" />
          </div>
        </div>

        {/* Invoice allocation */}
        {supplierId && (
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Invoice Allocation</h3>
              <button type="button" onClick={addAdvance}
                className="btn-secondary text-xs flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> Advance / No Invoice
              </button>
            </div>

            {/* Unpaid invoices selector */}
            {unpaidInvoices.length > 0 && (
              <div className="rounded-lg border border-gray-100 overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Unpaid Invoices — Click to add
                </div>
                <div className="divide-y divide-gray-50">
                  {unpaidInvoices.map((inv, i) => {
                    const alreadyAdded = invFields.some((f) => f.invoiceNumber && f.invoiceNumber === inv.invoiceNumber);
                    return (
                      <div key={i}
                        className={`flex items-center justify-between px-3 py-2.5 ${alreadyAdded ? 'opacity-40' : 'hover:bg-gray-50 cursor-pointer'}`}
                        onClick={() => !alreadyAdded && addInvoice(inv)}>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{inv.invoiceNumber || 'No Invoice No.'}</p>
                          <p className="text-xs text-gray-400">{fmt(inv.invoiceDate)}{inv.isOverdue ? ' · Overdue' : ''}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-gray-800">{fmtAmt(inv.invoiceTotal)}</p>
                          <p className="text-xs text-red-600">Remaining: {fmtAmt(inv.remaining)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Added invoice rows */}
            {invFields.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Payment Allocation</p>
                {invFields.map((field, idx) => (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-end p-3 rounded-lg bg-orange-50 border border-orange-100">
                    <div className="col-span-3">
                      <label className="block text-xs text-gray-500 mb-1">Invoice No.</label>
                      <input {...register(`invoices.${idx}.invoiceNumber`)} className="input text-sm font-mono" placeholder="INV-001" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">Invoice Date</label>
                      <input {...register(`invoices.${idx}.invoiceDate`)} type="date" className="input text-sm" />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs text-gray-500 mb-1">Invoice Total (₹)</label>
                      <input {...register(`invoices.${idx}.invoiceTotal`, { valueAsNumber: true })} type="number" step="0.01" min={0} className="input text-sm" />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs text-gray-500 mb-1">Paying Now (₹) *</label>
                      <input {...register(`invoices.${idx}.paidAmount`, { required: true, valueAsNumber: true, min: 0.01 })}
                        type="number" step="0.01" min={0.01} className="input text-sm font-semibold" />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <button type="button" onClick={() => removeInv(idx)}
                        className="p-1.5 rounded hover:bg-red-50 text-red-400">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {invFields.length === 0 && unpaidInvoices.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-gray-400 bg-gray-50 rounded-lg p-3">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                No unpaid invoices found. Use "Advance / No Invoice" for advance payments.
              </div>
            )}
          </div>
        )}

        {/* Total amount */}
        <div className="card p-5">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Total Payment Amount (₹) *</label>
            <input
              {...register('totalAmount', { required: 'Amount is required', valueAsNumber: true, min: { value: 0.01, message: 'Must be greater than 0' } })}
              type="number" step="0.01" min={0.01}
              className="input text-lg font-semibold max-w-xs"
              readOnly={invFields.length > 0}
              placeholder="0.00"
            />
            {errors.totalAmount && <p className="mt-1 text-xs text-red-500">{errors.totalAmount.message}</p>}
            {invFields.length > 0 && (
              <p className="mt-1 text-xs text-gray-400">Auto-calculated from invoice allocation: {fmtAmt(invoiceTotal)}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? 'Submitting…' : 'Submit for Approval'}
          </button>
          <button type="button" onClick={() => navigate('/payments')} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  );
}
