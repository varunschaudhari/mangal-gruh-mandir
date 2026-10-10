import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, XCircle, Clock, AlertTriangle, Banknote, Paperclip, Trash2, FileText, Upload, Camera } from 'lucide-react';
import { getExpense, approveExpense, rejectExpense, voidExpense, uploadExpenseReceipt, removeExpenseReceipt } from '../../api/expense.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Modal from '../../components/ui/Modal.jsx';
import StickyActionBar from '../../components/ui/StickyActionBar.jsx';
import EntityAuditTrail from '../../components/ui/EntityAuditTrail.jsx';
import { fDate, fDateTime, fCurrency } from '../../utils/formatters.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import toast from 'react-hot-toast';
import { serverUrl, isNative } from '../../utils/platform.js';
import { openFile } from '../../utils/fileSaver.js';
import haptics from '../../utils/haptics.js';
import { useT } from '../../i18n/index.jsx';

// The server only accepts .jpg/.png/.pdf. Listing exact types (not image/*) keeps HEIC/WebP out of
// the picker; no `capture` attribute, so phones keep the OS chooser (camera *and* gallery/files).
const RECEIPT_ACCEPT = 'image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf';

const CATEGORY_LABELS = {
  electricity: 'Electricity', water: 'Water', salary: 'Salary',
  priest_fees: 'Priest Fees', maintenance: 'Maintenance', decoration: 'Decoration',
  printing: 'Printing & Stationery', miscellaneous: 'Miscellaneous',
};

const PM_LABELS = { cash: 'Cash', upi: 'UPI / Online Transfer', cheque: 'Cheque', bank: 'Bank transfer' };

const STATUS_CONFIG = {
  pending_approval: { label: 'Pending Approval', icon: Clock,         cls: 'bg-yellow-100 text-yellow-700' },
  approved:         { label: 'Approved',          icon: CheckCircle2, cls: 'bg-green-100 text-green-700'  },
  rejected:         { label: 'Rejected',          icon: XCircle,      cls: 'bg-red-100 text-red-700'      },
  voided:           { label: 'Voided',            icon: XCircle,      cls: 'bg-gray-100 text-gray-500'    },
};

function StatusBadge({ status }) {
  const t    = useT();
  const cfg  = STATUS_CONFIG[status] || STATUS_CONFIG.pending_approval;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${cfg.cls}`}>
      <Icon size={14} />{t(cfg.label)}
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
  const t        = useT();
  const { id }   = useParams();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { can }  = usePermissions();
  // Below lg the app bar has the back arrow; rendering the link only on desktop keeps the
  // desktop DOM (and its space-y spacing) exactly as before.
  const isDesktop = useMediaQuery('(min-width: 1024px)');

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
    onSuccess: () => { haptics.success(); toast.success(t('Expense approved')); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || t('Failed')),
  });

  const rejectMut = useMutation({
    mutationFn: () => rejectExpense(id, { rejectionReason: reason }),
    onSuccess: () => { toast.success(t('Expense rejected')); invalidate(); setShowReject(false); setReason(''); },
    onError: (e) => toast.error(e.response?.data?.message || t('Failed')),
  });

  const voidMut = useMutation({
    mutationFn: () => voidExpense(id, { voidReason: reason }),
    onSuccess: () => { toast.success(t('Expense voided')); invalidate(); setShowVoid(false); setReason(''); },
    onError: (e) => toast.error(e.response?.data?.message || t('Failed')),
  });

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadExpenseReceipt(id, file);
      toast.success(t('Receipt uploaded'));
      invalidate();
    } catch (err) {
      toast.error(err.response?.data?.message || t('Upload failed'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeMut = useMutation({
    mutationFn: () => removeExpenseReceipt(id),
    onSuccess: () => { toast.success(t('Receipt removed')); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || t('Failed')),
  });

  if (isLoading) return <div className="py-16 text-center text-gray-400">{t('Loading…')}</div>;
  if (!expense)  return <div className="py-16 text-center text-gray-400">{t('Expense not found.')}</div>;

  const canApprove = can('payments:approve') && expense.status === 'pending_approval';
  const canVoid    = can('payments:approve') && expense.status === 'approved';

  const openReject = () => { setReason(''); setShowReject(true); };
  const openVoid   = () => { setReason(''); setShowVoid(true); };

  return (
    <div className="max-w-2xl space-y-4 sm:space-y-5">
      {isDesktop && (
        <button onClick={() => navigate('/expenses')}
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
          <ArrowLeft className="h-4 w-4" /> {t('Expenses')}
        </button>
      )}

      <PageHeader
        title={expense.expenseNumber}
        subtitle={`${t(CATEGORY_LABELS[expense.category]) || expense.category} · ${fCurrency(expense.amount)}`}
        breadcrumbs={[{ label: 'Expenses', to: '/expenses' }, { label: expense.expenseNumber }]}
        actions={
          // Phones get Approve / Reject in the pinned bar below and Void at the end of the page
          (canApprove || canVoid) && (
          <div className="hidden sm:flex items-center gap-2">
            {canApprove && (
              <>
                <button
                  onClick={() => approveMut.mutate()}
                  disabled={approveMut.isPending}
                  className="btn-primary flex items-center gap-1.5 text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  {approveMut.isPending ? t('Approving…') : t('Approve')}
                </button>
                <button
                  onClick={openReject}
                  className="btn-danger flex items-center gap-1.5 text-sm">
                  <XCircle className="h-4 w-4" /> {t('Reject')}
                </button>
              </>
            )}
            {canVoid && (
              <button
                onClick={openVoid}
                className="btn-danger flex items-center gap-1.5 text-sm">
                <XCircle className="h-4 w-4" /> {t('Void')}
              </button>
            )}
          </div>
          )
        }
      />


      {/* Status banner for rejected/voided */}
      {expense.status === 'rejected' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">{t('Expense Rejected')}</p>
            <p className="text-xs text-red-600 mt-0.5">
              {t('By {name} on {date}', { name: expense.rejectedBy?.name || t('Unknown'), date: fDateTime(expense.rejectedAt) })}
              {expense.rejectionReason && ` · "${expense.rejectionReason}"`}
            </p>
          </div>
        </div>
      )}

      {expense.status === 'voided' && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex items-start gap-3">
          <XCircle className="h-5 w-5 text-gray-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-gray-700">{t('Expense Voided')}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {t('By {name} on {date}', { name: expense.voidedBy?.name || t('Unknown'), date: fDateTime(expense.voidedAt) })}
              {expense.voidReason && ` · "${expense.voidReason}"`}
            </p>
          </div>
        </div>
      )}

      {/* Amount card */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-orange-500" />
            <h3 className="text-sm font-semibold text-gray-700">{t('Expense Details')}</h3>
          </div>
          <StatusBadge status={expense.status} />
        </div>

        <div className="mb-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-0.5">{t('Amount')}</p>
          <p className="text-3xl font-bold text-gray-900">{fCurrency(expense.amount)}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <InfoItem label={t('Category')}>{t(CATEGORY_LABELS[expense.category]) || expense.category}</InfoItem>
          <InfoItem label={t('Date')}>{fDate(expense.expenseDate)}</InfoItem>
          <InfoItem label={t('Payment Mode')}>{t(PM_LABELS[expense.paymentMode]) || expense.paymentMode}</InfoItem>
          {expense.referenceNumber && <InfoItem label={t('Reference')}>{expense.referenceNumber}</InfoItem>}
          {expense.payee && <InfoItem label={t('Payee')}>{expense.payee}</InfoItem>}
          <InfoItem label={t('Submitted By')}>{expense.createdBy?.name}</InfoItem>
          <InfoItem label={t('Submitted At')}>{fDateTime(expense.createdAt)}</InfoItem>
          {expense.approvedBy && <InfoItem label={t('Approved By')}>{expense.approvedBy.name} · {fDate(expense.approvedAt)}</InfoItem>}
          {expense.notes && <InfoItem label={t('Notes')} className="col-span-2 sm:col-span-3">{expense.notes}</InfoItem>}
          <InfoItem label={t('Description')} className="col-span-2 sm:col-span-3">{expense.description}</InfoItem>
        </div>
      </div>

      {/* Receipt */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-gray-400" /> {t('Bill / Receipt')}
          </h3>
          {can('payments:write') && (
            <div className={`items-center gap-2 ${expense.receiptPath ? 'flex' : 'hidden sm:flex'}`}>
              <input
                ref={fileInputRef}
                type="file"
                accept={RECEIPT_ACCEPT}
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="btn-secondary flex items-center gap-1.5 text-xs py-1 px-3">
                <Upload className="h-3.5 w-3.5" />
                {uploading ? t('Uploading…') : expense.receiptPath ? t('Replace') : t('Upload')}
              </button>
              {expense.receiptPath && (
                <button
                  onClick={() => removeMut.mutate()}
                  disabled={removeMut.isPending}
                  className="btn-ghost text-red-400 hover:text-red-600 p-2 sm:p-1.5"
                  aria-label={t('Remove receipt')}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {expense.receiptPath ? (
          (() => {
            const isPdf = expense.receiptPath.endsWith('.pdf');
            const url   = serverUrl(`/api/uploads/expenses/${expense.receiptPath}`);
            // The mobile apps have no browser tabs — fetch the file and hand it to the share sheet.
            const openNative = (e) => {
              if (!isNative) return;
              e.preventDefault();
              fetch(url)
                .then((r) => r.blob())
                .then((blob) => openFile(blob, expense.receiptPath))
                .catch(() => toast.error(t('Could not open receipt')));
            };
            return isPdf ? (
              <a href={url} target="_blank" rel="noreferrer" onClick={openNative}
                className="inline-flex items-center gap-2 text-sm text-primary-600 hover:underline">
                <FileText className="h-4 w-4" /> {t('View PDF Receipt')}
              </a>
            ) : (
              <a href={url} target="_blank" rel="noreferrer" onClick={openNative}>
                <img
                  src={url}
                  alt={t('Receipt')}
                  className="max-h-64 max-w-full rounded-lg border border-gray-200 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                />
              </a>
            );
          })()
        ) : (
          <>
            <p className={`text-sm text-gray-400 italic ${can('payments:write') ? 'hidden sm:block' : ''}`}>{t('No receipt attached yet.')}</p>
            {/* Phones: a big tap target that opens the OS chooser (camera, photos or files) */}
            {can('payments:write') && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center active:bg-gray-100 disabled:opacity-60 sm:hidden"
              >
                <Camera className="h-6 w-6 text-primary-500" />
                <span className="text-sm font-medium text-gray-700">{uploading ? t('Uploading…') : t('Add bill photo or PDF')}</span>
                <span className="text-xs text-gray-400">{t('Take a photo or pick from your phone')}</span>
              </button>
            )}
          </>
        )}
        <p className="text-xs text-gray-400 mt-2">{t('Accepted: JPG, PNG, PDF · Max 5 MB')}</p>
      </div>

      {/* Phones: voiding is rare and destructive, so it stays out of the pinned bar */}
      {canVoid && (
        <button onClick={openVoid} className="btn-secondary w-full border-red-200 text-red-600 sm:hidden">
          <XCircle className="h-4 w-4" /> {t('Void Expense')}
        </button>
      )}

      {expense._id && <EntityAuditTrail entityRef={expense._id} title={t('Expense History')} />}

      {/* Phones: Approve / Reject pinned in thumb reach (Approve on the right) */}
      {canApprove && (
        <div className="sm:hidden">
          <StickyActionBar>
            <button onClick={openReject} className="btn-secondary border-red-200 text-red-600">
              <XCircle className="h-4 w-4" /> {t('Reject')}
            </button>
            <button onClick={() => approveMut.mutate()} disabled={approveMut.isPending} className="btn-primary bg-green-600 hover:bg-green-700">
              <CheckCircle2 className="h-4 w-4" />
              {approveMut.isPending ? t('Approving…') : t('Approve')}
            </button>
          </StickyActionBar>
        </div>
      )}

      {/* Reject modal */}
      <Modal open={showReject} onClose={() => setShowReject(false)} title={t('Reject Expense')} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('Reason')} *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="input"
              placeholder={t('Why is this expense being rejected?')} />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => setShowReject(false)} className="btn-secondary">{t('Cancel')}</button>
            <button
              onClick={() => { if (!reason.trim()) { toast.error(t('Reason is required')); return; } rejectMut.mutate(); }}
              disabled={rejectMut.isPending}
              className="btn-danger">
              {rejectMut.isPending ? t('Rejecting…') : t('Confirm Reject')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Void modal */}
      <Modal open={showVoid} onClose={() => setShowVoid(false)} title={t('Void Expense')} size="sm">
        <div className="space-y-4">
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>{t('Voiding will mark this approved expense as cancelled. This cannot be undone.')}</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('Reason')} *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="input"
              placeholder={t('Why is this expense being voided?')} />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => setShowVoid(false)} className="btn-secondary">{t('Cancel')}</button>
            <button
              onClick={() => { if (!reason.trim()) { toast.error(t('Reason is required')); return; } voidMut.mutate(); }}
              disabled={voidMut.isPending}
              className="btn-danger">
              {voidMut.isPending ? t('Voiding…') : t('Confirm Void')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
