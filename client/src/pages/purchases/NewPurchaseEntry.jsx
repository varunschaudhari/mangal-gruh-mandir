import { useEffect } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2, Package } from 'lucide-react';
import { getSuppliers, getSupplier } from '../../api/supplier.api.js';
import { getDepartments } from '../../api/department.api.js';
import { createPurchaseEntry } from '../../api/purchaseEntry.api.js';
import ProductSearchSelect from '../../components/transactions/ProductSearchSelect.jsx';
import SearchableSelect from '../../components/ui/SearchableSelect.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import toast from 'react-hot-toast';

const today = () => new Date().toISOString().split('T')[0];

function addDays(dateStr, days) {
  if (!dateStr || !days) return '';
  const d = new Date(dateStr);
  d.setDate(d.getDate() + Number(days));
  return d.toISOString().split('T')[0];
}

export default function NewPurchaseEntry() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm({
    defaultValues: {
      supplier:      '',
      invoiceNumber: '',
      invoiceDate:   today(),
      receivedDate:  today(),
      dueDate:       '',
      toDepartment:  '',
      notes:         '',
      items: [{ product: '', quantity: '', rate: '', expiryDate: '', batchRef: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchedItems = watch('items');
  const supplierId   = watch('supplier');
  const invoiceDate  = watch('invoiceDate');

  const { data: supRes } = useQuery({
    queryKey: ['suppliers-all'],
    queryFn:  () => getSuppliers({ type: 'vendor' }),
  });
  const suppliers = supRes?.data?.data || [];

  const { data: selSupRes } = useQuery({
    queryKey: ['supplier', supplierId],
    queryFn:  () => getSupplier(supplierId),
    enabled:  !!supplierId,
  });
  const selectedSupplier = selSupRes?.data?.data;

  const { data: deptsRes } = useQuery({
    queryKey: ['departments'],
    queryFn:  () => getDepartments(),
  });
  const departments = deptsRes?.data?.data || [];

  // Auto-compute due date when supplier or invoice date changes
  useEffect(() => {
    if (selectedSupplier?.creditDays && invoiceDate) {
      setValue('dueDate', addDays(invoiceDate, selectedSupplier.creditDays));
    }
  }, [supplierId, invoiceDate, selectedSupplier?.creditDays]);

  const grandTotal = watchedItems.reduce((sum, item) => {
    return sum + (Number(item.quantity) || 0) * (Number(item.rate) || 0);
  }, 0);

  const mutation = useMutation({
    mutationFn: createPurchaseEntry,
    onSuccess: (res) => {
      toast.success('Purchase entry created');
      qc.invalidateQueries({ queryKey: ['purchase-entries'] });
      qc.invalidateQueries({ queryKey: ['supplier-invoices'] });
      navigate(`/purchases/${res.data.data._id}`);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to create entry'),
  });

  const onSubmit = (data) => {
    const payload = {
      supplier:      data.supplier,
      invoiceNumber: data.invoiceNumber || undefined,
      invoiceDate:   data.invoiceDate   || undefined,
      receivedDate:  data.receivedDate,
      dueDate:       data.dueDate       || undefined,
      toDepartment:  data.toDepartment,
      notes:         data.notes         || undefined,
      items: data.items.map((item) => ({
        product:    item.product,
        quantity:   Number(item.quantity),
        rate:       Number(item.rate) || 0,
        expiryDate: item.expiryDate || undefined,
        batchRef:   item.batchRef   || undefined,
      })),
    };
    mutation.mutate(payload);
  };

  const fmtAmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

  return (
    <div className="max-w-4xl space-y-4">
      <button onClick={() => navigate('/purchases')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Purchase Register
      </button>

      <PageHeader
        title="New Purchase Entry"
        subtitle="Record a purchase invoice with line items"
        breadcrumbs={[{ label: 'Purchases', to: '/purchases' }, { label: 'New Entry' }]}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

        {/* ── Invoice Details ── */}
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
              {selectedSupplier?.creditDays && (
                <p className="mt-1 text-xs text-gray-400">Credit: {selectedSupplier.creditDays} days</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Department *</label>
              <Controller
                name="toDepartment"
                control={control}
                rules={{ required: 'Required' }}
                render={({ field }) => (
                  <SearchableSelect
                    value={field.value || ''}
                    onChange={field.onChange}
                    options={departments.map((d) => ({ value: d._id, label: d.name }))}
                    placeholder="Select department…"
                    error={errors.toDepartment?.message}
                  />
                )}
              />
              {errors.toDepartment && <p className="mt-1 text-xs text-red-500">{errors.toDepartment.message}</p>}
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
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Received Date *</label>
              <input {...register('receivedDate', { required: 'Required' })} type="date" className="input" />
              {errors.receivedDate && <p className="mt-1 text-xs text-red-500">{errors.receivedDate.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Due Date</label>
              <input {...register('dueDate')} type="date" className="input" />
              {selectedSupplier?.creditDays && (
                <p className="mt-1 text-xs text-gray-400">Auto-set from {selectedSupplier.creditDays}-day credit term</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Notes</label>
            <textarea {...register('notes')} rows={2} className="input" placeholder="Optional notes" />
          </div>
        </div>

        {/* ── Line Items ── */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Items Received</h3>
            <button
              type="button"
              onClick={() => append({ product: '', quantity: '', rate: '', expiryDate: '', batchRef: '' })}
              className="btn-secondary text-xs flex items-center gap-1">
              <Plus className="h-3.5 w-3.5" /> Add Item
            </button>
          </div>

          {/* Column headers — desktop only */}
          <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            <div className="col-span-4">Product</div>
            <div className="col-span-2">Qty</div>
            <div className="col-span-2">Rate (₹)</div>
            <div className="col-span-2">Total</div>
            <div className="col-span-2"></div>
          </div>

          {fields.map((field, idx) => {
            const qty   = Number(watchedItems[idx]?.quantity) || 0;
            const rate  = Number(watchedItems[idx]?.rate)     || 0;
            const total = qty * rate;

            return (
              <div key={field.id} className="bg-orange-50 rounded-lg p-3 border border-orange-100 space-y-2">

                {/* Row 1: Product · Qty · Rate · Total · Delete */}
                <div className="grid grid-cols-12 gap-2 items-start">

                  {/* Product — searchable */}
                  <div className="col-span-12 sm:col-span-4">
                    <label className="block text-xs text-gray-500 mb-1 sm:hidden">Product *</label>
                    <Controller
                      name={`items.${idx}.product`}
                      control={control}
                      rules={{ required: 'Product is required' }}
                      render={({ field: f }) => (
                        <ProductSearchSelect
                          value={f.value}
                          onChange={f.onChange}
                          onSelect={(prod) => {
                            if (prod?.standardRate) setValue(`items.${idx}.rate`, prod.standardRate);
                          }}
                          error={errors.items?.[idx]?.product?.message}
                        />
                      )}
                    />
                  </div>

                  {/* Qty */}
                  <div className="col-span-4 sm:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1 sm:hidden">Qty *</label>
                    <input
                      {...register(`items.${idx}.quantity`, { required: true, min: 0.001, valueAsNumber: true })}
                      type="number" step="0.001" min="0.001"
                      placeholder="0"
                      className="input text-sm" />
                  </div>

                  {/* Rate */}
                  <div className="col-span-4 sm:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1 sm:hidden">Rate (₹)</label>
                    <input
                      {...register(`items.${idx}.rate`, { valueAsNumber: true, min: 0 })}
                      type="number" step="0.01" min="0"
                      placeholder="0.00"
                      className="input text-sm" />
                  </div>

                  {/* Total (read-only) */}
                  <div className="col-span-3 sm:col-span-2 flex items-end pb-1">
                    <span className="text-sm font-semibold text-gray-800">{total > 0 ? fmtAmt(total) : '—'}</span>
                  </div>

                  {/* Delete */}
                  <div className="col-span-1 sm:col-span-2 flex items-start justify-end">
                    <button
                      type="button"
                      onClick={() => remove(idx)}
                      disabled={fields.length === 1}
                      className="p-1.5 rounded hover:bg-red-50 text-red-400 disabled:opacity-30 mt-0.5">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Row 2: Batch Ref · Expiry Date */}
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-12 sm:col-span-7">
                    <input
                      {...register(`items.${idx}.batchRef`)}
                      className="input text-xs"
                      placeholder="Batch / lot reference (optional)" />
                  </div>

                  <div className="col-span-12 sm:col-span-5">
                    <label className="block text-xs text-gray-400 mb-1">
                      Expiry Date <span className="text-gray-300">(optional · DD/MM/YYYY)</span>
                    </label>
                    <input
                      {...register(`items.${idx}.expiryDate`)}
                      type="date"
                      className="input text-sm w-full"
                      title="Expiry date (DD/MM/YYYY)"
                    />
                  </div>
                </div>

              </div>
            );
          })}

          {fields.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-400 bg-gray-50 rounded-lg p-3">
              <Package className="h-4 w-4 shrink-0" />
              Add at least one item.
            </div>
          )}

          {/* Grand total */}
          <div className="flex items-center justify-between pt-3 border-t border-dashed">
            <span className="text-sm font-semibold text-gray-700">Grand Total</span>
            <span className="text-xl font-bold text-gray-900">{fmtAmt(grandTotal)}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? 'Saving…' : 'Save Purchase Entry'}
          </button>
          <button type="button" onClick={() => navigate('/purchases')} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  );
}
