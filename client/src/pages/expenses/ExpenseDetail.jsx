import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, XCircle, Clock, AlertTriangle, Banknote, Paperclip, Trash2, FileText, Upload } from 'lucide-react';
import { getExpense, approveExpense, rejectExpense, voidExpense, uploadExpenseReceipt, removeExpenseReceipt } from '../../api/expense.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Modal from '../../components/ui/Modal.jsx';
import EntityAuditTrail from '../../components/ui/EntityAuditTrail.jsx';
import { fDate, fDateTime, fCurrency } from '../../utils/formatters.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import toast from 'react-hot-toast';

const CATEGORY_LABELS = {
  electricity: 'Electricity', water: 'Water', salary: 'Salary',
  priest_fees: 'Priest Fees', maintenance: 'Maintenance', decoration: 'Decoration',
  printing: 'Printing & Stationery', miscellaneous: 'Miscellaneous',
};

const PM_LABELS = { cash: 'Cash', upi: 'UPI / Online Transfer', cheque: 'Cheque' };

const STATUS_CONFIG = {
  pending_approval: { label: 'Pending Approval', icon: Clock,         cls: 'bg-yellow-100 text-yellow-700' },
  approved:         { label: 'Approved',          icon: CheckCircle2, cls: 'bg-green-100 text-green-700'  },
  rejected:         { label: 'Rejected',          icon: XCircle,      cls: 'bg-red-100 text-red-700'      },
  voided:           { label: 'Voided',            icon: XCircle,      cls: 'bg-gray-100 text-gray-500'    },
};

function StatusBadge({ status }) {
  const cfg  = STATUS_CONFIG[status] || STATUS_CONFIG.pending_approval;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${cfg.cls}`}>
      <Icon size={14} />{cfg.label}
    </span>
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

export default function ExpenseDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { can }  = usePermissions();

  const [showReject,   setShowReject]   = useState(false);
  const [showVoid,     setShowVoid]     = useState(false);
  const [reason,       setReason]       = useState('');
  const [uploading,    setUploading]    = useState(false);
  const fileInputRef = useRef(null);

  const { data: res, isLoading } = useQuery({
    queryKey: ['expense', id],
    queryFn:  () => getExpense(id),
    enabled:  !!id,
  });
  const expense = res?.data?.data;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['expense', id] });
    qc.invalidateQueries({ queryKey: ['expenses'] });
  };

  const approveMut = useMutation({
    mutationFn: () => approveExpense(id),
    onSuccess: () => { toast.success('Expense approved'); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const rejectMut = useMutation({
    mutationFn: () => rejectExpense(id, { rejectionReason: reason }),
    onSuccess: () => { toast.success('Expense rejected'); invalidate(); setShowReject(false); setReason(''); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const voidMut = useMutation({
    mutationFn: () => voidExpense(id, { voidReason: reason }),
    onSuccess: () => { toast.success('Expense voided'); invalidate(); setShowVoid(false); setReason(''); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadExpenseReceipt(id, file);
      toast.success('Receipt uploaded');
      invalidate();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeMut = useMutation({
    mutationFn: () => removeExpenseReceipt(id),
    onSuccess: () => { toast.success('Receipt removed'); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  if (isLoading) return <div className="py-16 text-center text-gray-400">Loading…</div>;
  if (!expense)  return <div className="py-16 text-center text-gray-400">Expense not found.</div>;

  const canApprove = can('payments:approve') && expense.status === 'pending_approval';
  const canVoid    = can('payments:approve') && expense.status === 'approved';

  return (
    <div className="max-w-2xl space-y-5">
      <button onClick={() => navigate('/expenses')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Expenses
      </button>

      <PageHeader
        title={expense.expenseNumber}
        subtitle={`${CATEGORY_LABELS[expense.category] || expense.category} · ${fCurrency(expense.amount)}`}
        breadcrumbs={[{ label: 'Expenses', to: '/expenses' }, { label: expense.expenseNumber }]}
        actions={
          <div className="flex items-center gap-2">
            {canApprove && (
              <>
                <button
                  onClick={() => approveMut.mutate()}
                  disabled={approveMut.isPending}
                  className="btn-primary flex items-center gap-1.5 text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  {approveMut.isPending ? 'Approving…' : 'Approve'}
                </button>
                <button
                  onClick={() => { setReason(''); setShowReject(true); }}
                  className="btn-danger flex items-center gap-1.5 text-sm">
                  <XCircle className="h-4 w-4" /> Reject
                </button>
              </>
            )}
            {canVoid && (
              <button
                onClick={() => { setReason(''); setShowVoid(true); }}
                className="btn-danger flex items-center gap-1.5 text-sm">
                <XCircle className="h-4 w-4" /> Void
              </button>
            )}
          </div>
        }
      />

      {/* Status banner for rejected/voided */}
      {expense.status === 'rejected' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">Expense Rejected</p>
            <p className="text-xs text-red-600 mt-0.5">
              By {expense.rejectedBy?.name || 'Unknown'} on {fDateTime(expense.rejectedAt)}
              {expense.rejectionReason && ` · "${expense.rejectionReason}"`}
            </p>
          </div>
        </div>
      )}

      {expense.status === 'voided' && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex items-start gap-3">
          <XCircle className="h-5 w-5 text-gray-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-gray-700">Expense Voided</p>
            <p className="text-xs text-gray-500 mt-0.5">
              By {expense.voidedBy?.name || 'Unknown'} on {fDateTime(expense.voidedAt)}
              {expense.voidReason && ` · "${expense.voidReason}"`}
            </p>
          </div>
        </div>
      )}

      {/* Amount card */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-orange-500" />
            <h3 className="text-sm font-semibold text-gray-700">Expense Details</h3>
          </div>
          <StatusBadge status={expense.status} />
        </div>

        <div className="mb-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Amount</p>
          <p className="text-3xl font-bold text-gray-900">{fCurrency(expense.amount)}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <InfoItem label="Category">{CATEGORY_LABELS[expense.category] || expense.category}</InfoItem>
          <InfoItem label="Date">{fDate(expense.expenseDate)}</InfoItem>
          <InfoItem label="Payment Mode">{PM_LABELS[expense.paymentMode] || expense.paymentMode}</InfoItem>
          {expense.referenceNumber && <InfoItem label="Reference">{expense.referenceNumber}</InfoItem>}
          {expense.payee && <InfoItem label="Payee">{expense.payee}</InfoItem>}
          <InfoItem label="Submitted By">{expense.createdBy?.name}</InfoItem>
          <InfoItem label="Submitted At">{fDateTime(expense.createdAt)}</InfoItem>
          {expense.approvedBy && <InfoItem label="Approved By">{expense.approvedBy.name} · {fDate(expense.approvedAt)}</InfoItem>}
          {expense.notes && <InfoItem label="Notes" className="col-span-2 sm:col-span-3">{expense.notes}</InfoItem>}
          <InfoItem label="Description" className="col-span-2 sm:col-span-3">{expense.description}</InfoItem>
        </div>
      </div>

      {/* Receipt */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-gray-400" /> Bill / Receipt
          </h3>
          {can('payments:write') && (
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="btn-secondary flex items-center gap-1.5 text-xs py-1 px-3">
                <Upload className="h-3.5 w-3.5" />
                {uploading ? 'Uploading…' : expense.receiptPath ? 'Replace' : 'Upload'}
              </button>
              {expense.receiptPath && (
                <button
                  onClick={() => removeMut.mutate()}
                  disabled={removeMut.isPending}
                  className="btn-ghost text-red-400 hover:text-red-600 p-1.5">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {expense.receiptPath ? (
          (() => {
            const isPdf = expense.receiptPath.endsWith('.pdf');
            const url   = `/uploads/expenses/${expense.receiptPath}`;
            return isPdf ? (
              <a href={url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm text-primary-600 hover:underline">
                <FileText className="h-4 w-4" /> View PDF Receipt
              </a>
            ) : (
              <a href={url} target="_blank" rel="noreferrer">
                <img
                  src={url}
                  alt="Receipt"
                  className="max-h-64 rounded-lg border border-gray-200 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                />
              </a>
            );
          })()
        ) : (
          <p className="text-sm text-gray-400 italic">No receipt attached yet.</p>
        )}
        <p className="text-xs text-gray-400 mt-2">Accepted: JPG, PNG, PDF · Max 5 MB</p>
      </div>

      {expense._id && <EntityAuditTrail entityRef={expense._id} title="Expense History" />}

      {/* Reject modal */}
      <Modal open={showReject} onClose={() => setShowReject(false)} title="Reject Expense" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Reason *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="input"
              placeholder="Why is this expense being rejected?" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowReject(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => { if (!reason.trim()) { toast.error('Reason is required'); return; } rejectMut.mutate(); }}
              disabled={rejectMut.isPending}
              className="btn-danger">
              {rejectMut.isPending ? 'Rejecting…' : 'Confirm Reject'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Void modal */}
      <Modal open={showVoid} onClose={() => setShowVoid(false)} title="Void Expense" size="sm">
        <div className="space-y-4">
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>Voiding will mark this approved expense as cancelled. This cannot be undone.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Reason *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="input"
              placeholder="Why is this expense being voided?" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowVoid(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => { if (!reason.trim()) { toast.error('Reason is required'); return; } voidMut.mutate(); }}
              disabled={voidMut.isPending}
              className="btn-danger">
              {voidMut.isPending ? 'Voiding…' : 'Confirm Void'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
