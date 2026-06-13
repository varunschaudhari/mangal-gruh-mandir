import { useEffect } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Package } from 'lucide-react';
import { getPurchaseEntry, updatePurchaseEntry } from '../../api/purchaseEntry.api.js';
import { getSuppliers } from '../../api/supplier.api.js';
import SearchableSelect from '../../components/ui/SearchableSelect.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { fCurrency } from '../../utils/formatters.js';
import toast from 'react-hot-toast';

const toDateStr = (d) => d ? new Date(d).toISOString().split('T')[0] : '';

export default function PurchaseEntryEdit() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const qc       = useQueryClient();

  const { data: res, isLoading } = useQuery({
    queryKey: ['purchase-entry', id],
    queryFn:  () => getPurchaseEntry(id),
    enabled:  !!id,
  });
  const { data: supRes } = useQuery({
    queryKey: ['suppliers-all'],
    queryFn:  () => getSuppliers({ type: 'vendor' }),
  });

  const entry     = res?.data?.data;
  const suppliers = supRes?.data?.data || [];

  const { register, handleSubmit, control, watch, reset, formState: { errors } } = useForm({
    defaultValues: { supplier: '', invoiceNumber: '', invoiceDate: '', receivedDate: '', dueDate: '', notes: '', items: [] },
  });

  const { fields } = useFieldArray({ control, name: 'items' });
  const watchedItems = watch('items');

  useEffect(() => {
    if (!entry) return;
    reset({
      supplier:      entry.supplier?._id || '',
      invoiceNumber: entry.invoiceNumber || '',
      invoiceDate:   toDateStr(entry.invoiceDate),
      receivedDate:  toDateStr(entry.receivedDate),
      dueDate:       toDateStr(entry.dueDate),
      notes:         entry.notes || '',
      items: (entry.items || []).map((item) => ({
        rate:       item.rate ?? 0,
        batchRef:   item.batchRef || '',
        expiryDate: toDateStr(item.expiryDate),
        // read-only refs kept for display
        _productName: item.product?.name || '—',
        _quantity:    item.quantity,
        _unitSymbol:  item.unit?.symbol || '',
        _totalValue:  item.totalValue,
      })),
    });
  }, [entry]);

  const mutation = useMutation({
    mutationFn: (data) => updatePurchaseEntry(id, {
      supplier:      data.supplier,
      invoiceNumber: data.invoiceNumber || undefined,
      invoiceDate:   data.invoiceDate   || undefined,
      receivedDate:  data.receivedDate  || undefined,
      dueDate:       data.dueDate       || undefined,
      notes:         data.notes         || undefined,
      items: data.items.map((item) => ({
        rate:       Number(item.rate) || 0,
        batchRef:   item.batchRef   || undefined,
        expiryDate: item.expiryDate || undefined,
      })),
    }),
    onSuccess: () => {
      toast.success('Purchase entry updated');
      qc.invalidateQueries({ queryKey: ['purchase-entry', id] });
      qc.invalidateQueries({ queryKey: ['purchase-entries'] });
      navigate(`/purchases/${id}`);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to update'),
  });

  const grandTotal = (watchedItems || []).reduce((sum, item, idx) => {
    const qty = entry?.items?.[idx]?.quantity || 0;
    return sum + (Number(item.rate) || 0) * qty;
  }, 0);

  if (isLoading) return <PageLoader />;
  if (!entry)    return <div className="py-16 text-center text-gray-400">Entry not found.</div>;
  if (entry.isVoided) return <div className="py-16 text-center text-gray-400">Cannot edit a voided entry.</div>;
  if ((entry.paidSoFar || 0) > 0) return (
    <div className="py-16 text-center text-gray-400">
      This entry is locked — an approved payment exists. Void the payment first to make changes.
    </div>
  );

  return (
    <div className="max-w-4xl space-y-4">
      <button onClick={() => navigate(`/purchases/${id}`)}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
        <ArrowLeft className="h-4 w-4" /> {entry.entryNumber}
      </button>

      <PageHeader
        title="Edit Purchase Entry"
        subtitle={`${entry.entryNumber} · Stock quantities and products cannot be changed`}
        breadcrumbs={[{ label: 'Purchases', to: '/purchases' }, { label: entry.entryNumber, to: `/purchases/${id}` }, { label: 'Edit' }]}
      />

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">

        {/* Header metadata */}
        <div className="card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Invoice Details</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Supplier *</label>
              <Controller
                name="supplier"
                control={control}
                rules={{ required: 'Required' }}
                render={({ field }) => (
                  <SearchableSelect
                    value={field.value || ''}
                    onChange={field.onChange}
                    options={suppliers.map((s) => ({ value: s._id, label: s.name }))}
                    placeholder="Select supplier…"
                    error={errors.supplier?.message}
                  />
                )}
              />
              {errors.supplier && <p className="mt-1 text-xs text-red-500">{errors.supplier.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Department (read-only)</label>
              <div className="input bg-gray-50 text-gray-500 cursor-not-allowed">{entry.toDepartment?.name || '—'}</div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Invoice Number</label>
              <input {...register('invoiceNumber')} className="input font-mono" placeholder="e.g. INV-2025-001" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Invoice Date</label>
              <input {...register('invoiceDate')} type="date" className="input" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Received Date</label>
              <input {...register('receivedDate')} type="date" className="input" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Due Date</label>
              <input {...register('dueDate')} type="date" className="input" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Notes</label>
            <textarea {...register('notes')} rows={2} className="input" placeholder="Optional notes" />
          </div>
        </div>

        {/* Items — product & qty read-only, rate/batch/expiry editable */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">Items Received</h3>
            <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">qty &amp; product locked</span>
          </div>

          {/* Column headers */}
          <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            <div className="col-span-4">Product</div>
            <div className="col-span-2 text-right">Qty</div>
            <div className="col-span-2">Rate (₹)</div>
            <div className="col-span-2 text-right">Total</div>
            <div className="col-span-2">Batch Ref</div>
          </div>

          {fields.map((field, idx) => {
            const original = entry.items?.[idx];
            const qty      = original?.quantity || 0;
            const rate     = Number(watchedItems?.[idx]?.rate) || 0;
            const total    = rate * qty;

            return (
              <div key={field.id} className="bg-orange-50 rounded-lg p-3 border border-orange-100 space-y-2">
                <div className="grid grid-cols-12 gap-2 items-start">
                  {/* Product (read-only) */}
                  <div className="col-span-12 sm:col-span-4">
                    <label className="block text-xs text-gray-400 mb-1 sm:hidden">Product</label>
                    <div className="input bg-white text-gray-600 cursor-not-allowed text-sm">
                      {original?.product?.name || '—'}
                      <span className="ml-1.5 text-xs text-gray-400 font-mono">{original?.product?.code}</span>
                    </div>
                  </div>

                  {/* Qty (read-only) */}
                  <div className="col-span-4 sm:col-span-2 flex items-end sm:justify-end pb-1">
                    <span className="text-sm font-semibold text-gray-700">
                      {qty} <span className="text-xs text-gray-400">{original?.unit?.symbol}</span>
                    </span>
                  </div>

                  {/* Rate (editable) */}
                  <div className="col-span-4 sm:col-span-2">
                    <label className="block text-xs text-gray-400 mb-1 sm:hidden">Rate (₹)</label>
                    <input
                      {...register(`items.${idx}.rate`, { valueAsNumber: true, min: 0 })}
                      type="number" step="0.01" min="0"
                      placeholder="0.00"
                      className="input text-sm" />
                  </div>

                  {/* Total (computed) */}
                  <div className="col-span-4 sm:col-span-2 flex items-end pb-1 sm:justify-end">
                    <span className="text-sm font-semibold text-gray-800">{total > 0 ? fCurrency(total) : '—'}</span>
                  </div>

                  {/* Batch Ref */}
                  <div className="col-span-12 sm:col-span-2">
                    <label className="block text-xs text-gray-400 mb-1 sm:hidden">Batch Ref</label>
                    <input
                      {...register(`items.${idx}.batchRef`)}
                      className="input text-xs font-mono"
                      placeholder="Optional" />
                  </div>
                </div>

                {/* Expiry date row */}
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-12 sm:col-span-5">
                    <label className="block text-xs text-gray-400 mb-1">Expiry Date</label>
                    <input {...register(`items.${idx}.expiryDate`)} type="date" className="input text-sm" />
                  </div>
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-between pt-3 border-t border-dashed">
            <span className="text-sm font-semibold text-gray-700">Grand Total</span>
            <span className="text-xl font-bold text-gray-900">{fCurrency(grandTotal)}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
          <button type="button" onClick={() => navigate(`/purchases/${id}`)} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
