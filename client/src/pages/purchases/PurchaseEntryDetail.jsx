import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, AlertTriangle, CheckCircle2, Clock, CircleDot,
  XCircle, Package, CreditCard, Pencil,
} from 'lucide-react';
import { getPurchaseEntry, voidPurchaseEntry } from '../../api/purchaseEntry.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Modal from '../../components/ui/Modal.jsx';
import EntityAuditTrail from '../../components/ui/EntityAuditTrail.jsx';
import { fDate, fDateTime, fCurrency } from '../../utils/formatters.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import toast from 'react-hot-toast';

const STATUS_CONFIG = {
  unpaid:         { label: 'Unpaid',   icon: Clock,        cls: 'bg-red-100 text-red-700' },
  partially_paid: { label: 'Partial',  icon: CircleDot,    cls: 'bg-yellow-100 text-yellow-700' },
  paid:           { label: 'Paid',     icon: CheckCircle2, cls: 'bg-green-100 text-green-700' },
};

function StatusBadge({ status, isOverdue }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.unpaid;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${cfg.cls}`}>
      <Icon size={14} />
      {cfg.label}
      {isOverdue && status !== 'paid' && <AlertTriangle size={13} className="ml-0.5 text-orange-500" />}
    </span>
  );
}

const PM_LABELS = { cash: 'Cash', upi: 'UPI', neft: 'NEFT', rtgs: 'RTGS', cheque: 'Cheque' };

export default function PurchaseEntryDetail() {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const qc           = useQueryClient();
  const { can }      = usePermissions();
  const [showVoid, setShowVoid]   = useState(false);
  const [voidReason, setVoidReason] = useState('');

  const { data: res, isLoading, isError } = useQuery({
    queryKey: ['purchase-entry', id],
    queryFn:  () => getPurchaseEntry(id),
    enabled:  !!id,
  });
  const entry = res?.data?.data;

  const voidMutation = useMutation({
    mutationFn: () => voidPurchaseEntry(id, { voidReason }),
    onSuccess: () => {
      toast.success('Purchase entry voided');
      qc.invalidateQueries({ queryKey: ['purchase-entry', id] });
      qc.invalidateQueries({ queryKey: ['purchase-entries'] });
      setShowVoid(false);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to void'),
  });

  if (isLoading) return <div className="py-16 text-center text-gray-400">Loading…</div>;
  if (isError || !entry) return (
    <div className="py-16 text-center text-gray-400">Entry not found.</div>
  );

  const paymentStatus = entry.paymentStatus || 'unpaid';
  const canVoid = can('transactions:create') && !entry.isVoided && paymentStatus !== 'paid';
  const hasApprovedPayment = (entry.paidSoFar || 0) > 0;
  const canEdit = can('transactions:create') && !entry.isVoided && !hasApprovedPayment;

  return (
    <div className="max-w-4xl space-y-5">
      <button onClick={() => navigate('/purchases')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Purchase Register
      </button>

      <PageHeader
        title={entry.entryNumber || 'Purchase Entry'}
        subtitle={`${entry.supplier?.name || ''} · Invoice: ${entry.invoiceNumber || 'N/A'}`}
        breadcrumbs={[{ label: 'Purchases', to: '/purchases' }, { label: entry.entryNumber || 'Detail' }]}
        actions={
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                onClick={() => navigate(`/purchases/${id}/edit`)}
                className="btn-secondary flex items-center gap-1.5 text-sm">
                <Pencil className="h-4 w-4" /> Edit
              </button>
            )}
            {canVoid && (
              <button
                onClick={() => setShowVoid(true)}
                className="btn-danger flex items-center gap-1.5 text-sm">
                <XCircle className="h-4 w-4" /> Void Entry
              </button>
            )}
          </div>
        }
      />

      {/* Payment-locked banner */}
      {!entry.isVoided && hasApprovedPayment && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
          <CreditCard className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-800">Entry locked — approved payment exists</p>
            <p className="text-xs text-blue-600 mt-0.5">
              This entry has been partially or fully settled. To correct it, void the linked payment(s) first.
            </p>
          </div>
        </div>
      )}

      {/* Void banner */}
      {entry.isVoided && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">Entry Voided</p>
            <p className="text-xs text-red-600 mt-0.5">
              By {entry.voidedBy?.name || 'Unknown'} on {fDateTime(entry.voidedAt)}
              {entry.voidReason && ` · "${entry.voidReason}"`}
            </p>
          </div>
        </div>
      )}

      {/* Header info */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-sm font-semibold text-gray-700">Entry Details</h3>
          <StatusBadge status={paymentStatus} isOverdue={entry.isOverdue} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <InfoItem label="Supplier">
            <Link to={`/masters/suppliers/${entry.supplier?._id}`} className="text-primary-600 hover:underline font-medium text-sm">
              {entry.supplier?.name}
            </Link>
          </InfoItem>
          <InfoItem label="Department">{entry.toDepartment?.name}</InfoItem>
          <InfoItem label="Invoice Number">
            <span className="font-mono">{entry.invoiceNumber || '—'}</span>
          </InfoItem>
          <InfoItem label="Invoice Date">{fDate(entry.invoiceDate)}</InfoItem>
          <InfoItem label="Received Date">{fDate(entry.receivedDate)}</InfoItem>
          <InfoItem label="Due Date">
            <span className={entry.isOverdue && paymentStatus !== 'paid' ? 'text-orange-600 font-semibold' : ''}>
              {fDate(entry.dueDate)}
              {entry.isOverdue && paymentStatus !== 'paid' && ' · Overdue'}
            </span>
          </InfoItem>
          <InfoItem label="Created By">{entry.createdBy?.name}</InfoItem>
          <InfoItem label="Created At">{fDateTime(entry.createdAt)}</InfoItem>
          {entry.notes && <InfoItem label="Notes" className="col-span-2 sm:col-span-3">{entry.notes}</InfoItem>}
        </div>
      </div>

      {/* Payment summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Invoice Total</p>
          <p className="text-lg font-bold text-gray-900">{fCurrency(entry.totalValue)}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Paid</p>
          <p className="text-lg font-bold text-green-600">{fCurrency(entry.paidSoFar)}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Remaining</p>
          <p className={`text-lg font-bold ${entry.remaining > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {fCurrency(entry.remaining)}
          </p>
        </div>
      </div>

      {/* Line items */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Package className="h-4 w-4" /> Items Received ({entry.items?.length || 0})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b bg-gray-50">
                <th className="py-2 px-4 text-left font-semibold">Product</th>
                <th className="py-2 px-4 text-right font-semibold">Qty</th>
                <th className="py-2 px-4 text-right font-semibold">Rate</th>
                <th className="py-2 px-4 text-right font-semibold">Total</th>
                <th className="py-2 px-4 text-left font-semibold">Expiry</th>
                <th className="py-2 px-4 text-left font-semibold">Batch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(entry.items || []).map((item, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium text-gray-800">{item.product?.name || '—'}</td>
                  <td className="py-3 px-4 text-right text-gray-600">{item.quantity}</td>
                  <td className="py-3 px-4 text-right text-gray-600">{fCurrency(item.rate)}</td>
                  <td className="py-3 px-4 text-right font-semibold text-gray-800">{fCurrency(item.totalValue)}</td>
                  <td className="py-3 px-4 text-gray-500">{fDate(item.expiryDate)}</td>
                  <td className="py-3 px-4 text-gray-400 font-mono text-xs">{item.batchRef || '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-orange-50">
                <td colSpan={3} className="py-3 px-4 text-sm font-semibold text-gray-700 text-right">Grand Total</td>
                <td className="py-3 px-4 text-right text-base font-bold text-gray-900">{fCurrency(entry.totalValue)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Payment history */}
      {entry.payments?.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <CreditCard className="h-4 w-4" /> Payments Against This Entry
            </h3>
          </div>
          <div className="divide-y">
            {entry.payments.map((pmt) => (
              <div key={pmt._id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div>
                  <Link to={`/payments/${pmt._id}`} className="text-sm font-mono font-semibold text-primary-600 hover:underline">
                    {pmt.paymentNumber}
                  </Link>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {fDate(pmt.paymentDate)} · {PM_LABELS[pmt.paymentMode] || pmt.paymentMode}
                    {pmt.createdBy?.name && ` · ${pmt.createdBy.name}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-800">
                    {fCurrency(pmt.invoices?.find((inv) => inv.purchaseEntryId?.toString() === id)?.paidAmount || pmt.totalAmount)}
                  </p>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                    pmt.status === 'approved' ? 'bg-green-100 text-green-700'
                      : pmt.status === 'pending_approval' ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {pmt.status === 'approved' ? 'Approved' : pmt.status === 'pending_approval' ? 'Pending' : pmt.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit trail */}
      {entry._id && <EntityAuditTrail entityRef={entry._id} title="Entry History" />}

      {/* Void modal */}
      <Modal open={showVoid} onClose={() => setShowVoid(false)} title="Void Purchase Entry" size="sm">
        <div className="space-y-4">
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">This will void all stock transactions for this entry.</p>
              <p className="text-xs mt-1">Stock balances and FIFO batches will be reversed. This cannot be undone.</p>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Reason *</label>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              rows={3}
              className="input"
              placeholder="Why is this entry being voided?" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowVoid(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => { if (!voidReason.trim()) { toast.error('Reason is required'); return; } voidMutation.mutate(); }}
              disabled={voidMutation.isPending}
              className="btn-danger">
              {voidMutation.isPending ? 'Voiding…' : 'Confirm Void'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function InfoItem({ label, children, className = '' }) {
  return (
    <div className={className}>
      <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-0.5">{label}</p>
      <p className="text-sm text-gray-800">{children || '—'}</p>
    </div>
  );
}
