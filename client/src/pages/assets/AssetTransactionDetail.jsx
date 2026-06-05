import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShoppingBag, RotateCcw, CalendarPlus, Shield, Clock,
  AlertTriangle, IndianRupee, Bell, ArrowLeft, XCircle,
  CheckCircle2, Hash, Package, User, Pencil, Printer, Layers,
} from 'lucide-react';
import { getAssetTransaction, checkoutAsset, extendBorrow, cancelBorrow, sendManualReminder } from '../../api/assetTransaction.api.js';
import { getApprovers } from '../../api/user.api.js';
import { getSettings } from '../../api/settings.api.js';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import toast from 'react-hot-toast';

// ── Helpers ─────────────────────────────────────────────────────────────────
const fmt     = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

const STATUS_LABELS = { approved: 'Approved', checked_out: 'Checked Out', returned: 'Returned', overdue: 'Overdue', cancelled: 'Cancelled' };

const STATUS_STYLE = {
  approved:    { pill: 'bg-blue-100 text-blue-700',   bar: 'bg-blue-50 border-blue-200',   dot: 'bg-blue-500' },
  checked_out: { pill: 'bg-green-100 text-green-700', bar: 'bg-green-50 border-green-200', dot: 'bg-green-500' },
  overdue:     { pill: 'bg-red-100 text-red-700',     bar: 'bg-red-50 border-red-200',     dot: 'bg-red-500' },
  returned:    { pill: 'bg-gray-100 text-gray-600',   bar: 'bg-gray-50 border-gray-200',   dot: 'bg-gray-400' },
  cancelled:   { pill: 'bg-gray-100 text-gray-500',   bar: 'bg-gray-50 border-gray-200',   dot: 'bg-gray-400' },
};

const CONDITION_STYLE = {
  good:    'bg-green-100 text-green-700 border border-green-200',
  fair:    'bg-yellow-100 text-yellow-700 border border-yellow-200',
  damaged: 'bg-red-100 text-red-700 border border-red-200',
};

const REMINDER_LABELS = {
  approved: 'Approval notification', collect: 'Collection reminder',
  due_tomorrow: 'Due tomorrow', due_today: 'Due today', overdue: 'Overdue alert',
};

// ── Modals ───────────────────────────────────────────────────────────────────
const CheckoutModal = ({ txn, onClose, onSuccess }) => {
  const qc = useQueryClient();
  const [condition, setCondition] = useState('good');
  const mut = useMutation({
    mutationFn: () => checkoutAsset(txn._id, { conditionAtCheckout: condition }),
    onSuccess: () => { toast.success('Asset handed over'); qc.invalidateQueries({ queryKey: ['asset-transaction', txn._id] }); qc.invalidateQueries({ queryKey: ['asset-transactions'] }); onSuccess(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });
  return (
    <Modal open onClose={onClose} title="Hand Over Asset" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">Handing <strong>{txn.asset?.name}</strong> × {txn.quantityBorrowed} to <strong>{txn.borrower?.name}</strong></p>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Condition at handover <span className="text-red-400">*</span></p>
          <div className="flex gap-2">
            {[['good','Good','border-green-400 bg-green-50 text-green-700'],['fair','Fair','border-yellow-400 bg-yellow-50 text-yellow-700'],['damaged','Damaged','border-red-400 bg-red-50 text-red-700']].map(([v,l,cls]) => (
              <button key={v} type="button" onClick={() => setCondition(v)}
                className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-all ${condition === v ? cls : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending} className="btn-primary">{mut.isPending ? 'Processing…' : 'Confirm Handover'}</button>
        </div>
      </div>
    </Modal>
  );
};

const ExtendModal = ({ txn, onClose, onSuccess }) => {
  const qc = useQueryClient();
  const [newReturnDate, setNewReturnDate] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [notes, setNotes] = useState('');
  const { data: sRes } = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const { data: aRes } = useQuery({ queryKey: ['users-approvers'], queryFn: getApprovers });
  const maxDays = sRes?.data?.data?.assetMaxBorrowDays || 7;
  const approvers = aRes?.data?.data || [];
  const today = new Date().toISOString().split('T')[0];
  const maxDate = new Date(); maxDate.setDate(maxDate.getDate() + maxDays);
  const mut = useMutation({
    mutationFn: () => extendBorrow(txn._id, { newReturnDate, approvedBy, notes: notes || undefined }),
    onSuccess: () => { toast.success('Borrow period extended'); qc.invalidateQueries({ queryKey: ['asset-transaction', txn._id] }); qc.invalidateQueries({ queryKey: ['asset-transactions'] }); onSuccess(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });
  return (
    <Modal open onClose={onClose} title="Extend Return Date">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          <strong>{txn.asset?.name}</strong> — {txn.borrower?.name}
          <span className="ml-2 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded px-2 py-0.5">Currently due: {fmt(txn.expectedReturnDate)}</span>
        </p>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">New Return Date <span className="text-red-400">*</span></p>
          <input type="date" min={today} max={maxDate.toISOString().split('T')[0]} value={newReturnDate} onChange={(e) => setNewReturnDate(e.target.value)} className="input" />
          <p className="mt-1 text-xs text-gray-400">Max {maxDays} days from today</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Approved By (Trustee) <span className="text-red-400">*</span></p>
          <select value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} className="input">
            <option value="">— Select trustee —</option>
            {approvers.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Reason (optional)</p>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="input" placeholder="e.g. Event extended" />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending || !newReturnDate || !approvedBy} className="btn-primary">{mut.isPending ? 'Extending…' : 'Extend Borrow'}</button>
        </div>
      </div>
    </Modal>
  );
};

const CancelModal = ({ txn, onClose, onSuccess }) => {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const mut = useMutation({
    mutationFn: () => cancelBorrow(txn._id, { cancellationReason: reason || undefined }),
    onSuccess: () => { toast.success('Request cancelled'); qc.invalidateQueries({ queryKey: ['asset-transaction', txn._id] }); qc.invalidateQueries({ queryKey: ['asset-transactions'] }); onSuccess(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });
  return (
    <Modal open onClose={onClose} title="Cancel Borrow Request" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">Cancel <strong>{txn.asset?.name}</strong> for <strong>{txn.borrower?.name}</strong>? Reserved quantity will be released.</p>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Reason (optional)</p>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className="input" placeholder="e.g. Staff no longer needs it" />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Keep Request</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending} className="btn-danger">{mut.isPending ? 'Cancelling…' : 'Yes, Cancel'}</button>
        </div>
      </div>
    </Modal>
  );
};

// ── Timeline event ───────────────────────────────────────────────────────────
const Event = ({ icon: Icon, title, time, detail, variant = 'done', isLast }) => {
  const dot = variant === 'done'    ? 'bg-green-500 text-white' :
              variant === 'active'  ? 'bg-primary-500 text-white' :
              variant === 'danger'  ? 'bg-red-500 text-white' :
              variant === 'pending' ? 'bg-gray-200 text-gray-400' :
                                      'bg-gray-200 text-gray-400';
  const title_cls = variant === 'pending' ? 'text-gray-400' : variant === 'danger' ? 'text-red-700 font-semibold' : 'text-gray-800 font-semibold';

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        <div className={`h-7 w-7 rounded-full flex items-center justify-center ${dot}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        {!isLast && <div className="w-px flex-1 bg-gray-200 my-1.5 min-h-[20px]" />}
      </div>
      <div className={`pb-5 min-w-0 ${isLast ? 'pb-0' : ''}`}>
        <p className={`text-sm leading-snug ${title_cls}`}>{title}</p>
        {time   && <p className="text-xs text-gray-400 mt-0.5">{time}</p>}
        {detail && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{detail}</p>}
      </div>
    </div>
  );
};

// ── Stat cell ────────────────────────────────────────────────────────────────
const Stat = ({ label, value, sub, highlight }) => (
  <div className={`px-4 py-3 border-r border-gray-100 last:border-0 ${highlight ? 'bg-red-50' : ''}`}>
    <p className="text-xs text-gray-400 font-medium">{label}</p>
    <p className={`text-sm font-bold mt-0.5 ${highlight ? 'text-red-600' : 'text-gray-800'}`}>{value}</p>
    {sub && <p className="text-xs text-gray-400">{sub}</p>}
  </div>
);

// ── Info row ─────────────────────────────────────────────────────────────────
const Row = ({ label, children }) => (
  <div className="flex items-start justify-between gap-4 py-2.5 border-b border-gray-50 last:border-0">
    <span className="text-xs text-gray-400 shrink-0 w-32">{label}</span>
    <span className="text-sm text-gray-800 text-right font-medium">{children}</span>
  </div>
);

// ── Print Slip ───────────────────────────────────────────────────────────────
function printHandoverSlip(txn) {
  const {
    transactionNumber, asset, borrower, quantityBorrowed,
    expectedReturnDate, checkedOutAt, conditionAtCheckout,
    approvedBy, createdBy, notes,
  } = txn;

  const fmtPrint = (d) => d
    ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Handover Slip — ${transactionNumber || ''}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; padding: 28px; max-width: 580px; margin: 0 auto; }
    .header { text-align: center; padding-bottom: 12px; border-bottom: 2px solid #111; margin-bottom: 16px; }
    .temple  { font-size: 17px; font-weight: bold; letter-spacing: 0.5px; }
    .slip-title { font-size: 13px; font-weight: bold; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px; color: #444; }
    .ref    { font-size: 11px; color: #666; margin-top: 3px; font-family: monospace; }
    .section { margin-bottom: 14px; }
    .section-title { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.8px; color: #555; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 8px; }
    .row    { display: flex; justify-content: space-between; margin-bottom: 5px; line-height: 1.4; }
    .lbl    { color: #666; flex: 0 0 45%; }
    .val    { font-weight: bold; text-align: right; flex: 0 0 53%; }
    .sig-area { display: flex; justify-content: space-between; margin-top: 36px; gap: 20px; }
    .sig-box  { flex: 1; text-align: center; }
    .sig-line { border-top: 1px solid #111; margin-bottom: 6px; height: 40px; }
    .sig-name { font-size: 11px; font-weight: bold; }
    .sig-lbl  { font-size: 10px; color: #777; margin-top: 2px; }
    .footer   { margin-top: 20px; text-align: center; font-size: 10px; color: #aaa; border-top: 1px dashed #ccc; padding-top: 8px; }
    .note-box { background: #f9f9f9; border: 1px solid #eee; border-radius: 4px; padding: 8px 10px; font-size: 11px; color: #555; margin-top: 6px; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="temple">Mangal Grah Mandir, Amalner</div>
    <div class="slip-title">Asset Handover Slip</div>
    <div class="ref">Ref: ${transactionNumber || '—'}</div>
  </div>

  <div class="section">
    <div class="section-title">Asset Details</div>
    <div class="row"><span class="lbl">Asset Name</span><span class="val">${asset?.name || '—'}</span></div>
    <div class="row"><span class="lbl">Category</span><span class="val">${asset?.category || '—'}</span></div>
    <div class="row"><span class="lbl">Quantity</span><span class="val">${quantityBorrowed} unit${quantityBorrowed > 1 ? 's' : ''}</span></div>
  </div>

  <div class="section">
    <div class="section-title">Borrower Details</div>
    <div class="row"><span class="lbl">Borrower Name</span><span class="val">${borrower?.name || '—'}</span></div>
    <div class="row"><span class="lbl">Expected Return Date</span><span class="val">${fmtPrint(expectedReturnDate)}</span></div>
    <div class="row"><span class="lbl">Approved By (Trustee)</span><span class="val">${approvedBy?.name || '—'}</span></div>
    ${checkedOutAt ? `<div class="row"><span class="lbl">Date of Collection</span><span class="val">${fmtPrint(checkedOutAt)}</span></div>` : ''}
    ${conditionAtCheckout ? `<div class="row"><span class="lbl">Condition at Handover</span><span class="val" style="text-transform:capitalize">${conditionAtCheckout}</span></div>` : ''}
    ${createdBy?.name ? `<div class="row"><span class="lbl">Issued By (Help Desk)</span><span class="val">${createdBy.name}</span></div>` : ''}
  </div>

  ${notes ? `<div class="section">
    <div class="section-title">Notes</div>
    <div class="note-box">${notes}</div>
  </div>` : ''}

  <div class="section">
    <div class="section-title">Terms</div>
    <div style="font-size:11px; color:#555; line-height:1.6">
      • The borrower is responsible for the safe custody of the above asset(s) until returned.<br/>
      • Any damage or loss must be reported immediately to the Help Desk.<br/>
      • The asset must be returned by <strong>${fmtPrint(expectedReturnDate)}</strong>.${asset?.finePerDay > 0 ? ` A fine of ₹${asset.finePerDay}/day applies for late returns.` : ''}
    </div>
  </div>

  <div class="sig-area">
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-name">${borrower?.name || '_______________'}</div>
      <div class="sig-lbl">Borrower Signature</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-name">${createdBy?.name || 'Help Desk'}</div>
      <div class="sig-lbl">Issued By (Help Desk)</div>
    </div>
  </div>

  <div class="footer">
    Printed on ${fmtPrint(new Date())} &nbsp;·&nbsp; Mangal Grah Mandir Asset Management System
  </div>

  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=680,height=800');
  if (win) { win.document.write(html); win.document.close(); }
}

// ── Main Page ────────────────────────────────────────────────────────────────
const AssetTransactionDetail = () => {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { can }  = usePermissions();

  const [showCheckout, setShowCheckout] = useState(false);
  const [showExtend,   setShowExtend]   = useState(false);
  const [showCancel,   setShowCancel]   = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ['asset-transaction', id], queryFn: () => getAssetTransaction(id) });

  const reminderMut = useMutation({
    mutationFn: () => sendManualReminder(id),
    onSuccess: () => toast.success('Reminder sent'),
    onError:   (e) => toast.error(e.response?.data?.message || 'Failed to send'),
  });

  if (isLoading) return <PageLoader />;

  const txn = data?.data?.data;
  if (!txn) return <div className="p-6 text-gray-400">Transaction not found.</div>;

  const group = txn.group;

  const {
    status, asset, borrower, quantityBorrowed, transactionNumber,
    expectedReturnDate, actualReturnDate, cancellationReason,
    approvedBy, approvedAt, checkedOutAt, conditionAtCheckout, conditionAtReturn,
    damageNotes, fineApplied, fineWaived, fineAmount, fineWaivedReason, lateDays,
    extensions = [], remindersSent = [], notes, createdBy, createdAt,
  } = txn;

  const isActive  = !['returned', 'cancelled'].includes(status);
  const isOverdue = status === 'overdue';
  const ss        = STATUS_STYLE[status] || STATUS_STYLE.returned;

  // Build timeline events
  const events = [
    { icon: Hash,       title: 'Request logged',   time: fmtTime(createdAt),  detail: createdBy?.name ? `by ${createdBy.name}` : null, variant: 'done' },
    { icon: Shield,     title: 'Approved by trustee', time: fmtTime(approvedAt), detail: approvedBy?.name, variant: 'done' },
    {
      icon: ShoppingBag,
      title: checkedOutAt ? 'Handed over to borrower' : 'Awaiting handover',
      time: fmtTime(checkedOutAt),
      detail: conditionAtCheckout ? `Condition: ${conditionAtCheckout}` : null,
      variant: checkedOutAt ? 'done' : 'pending',
    },
    ...extensions.map((ext, i) => ({
      icon: CalendarPlus,
      title: `Return date extended (${i + 1}${['st','nd','rd'][i] || 'th'} time)`,
      time: fmtTime(ext.approvedAt),
      detail: `${fmt(ext.previousReturnDate)} → ${fmt(ext.newReturnDate)}${ext.approvedBy?.name ? ` · approved by ${ext.approvedBy.name}` : ''}${ext.notes ? ` · ${ext.notes}` : ''}`,
      variant: 'done',
    })),
    status === 'returned' ? {
      icon: CheckCircle2,
      title: 'Returned',
      time: fmtTime(actualReturnDate),
      detail: [conditionAtReturn ? `Condition: ${conditionAtReturn}` : null, lateDays > 0 ? `${lateDays} day(s) late` : null].filter(Boolean).join(' · ') || null,
      variant: 'done',
    } : status === 'overdue' ? {
      icon: AlertTriangle,
      title: `Overdue — ${lateDays || 0} day(s) past due`,
      time: `Was due ${fmt(expectedReturnDate)}`,
      detail: null,
      variant: 'danger',
    } : status === 'cancelled' ? {
      icon: XCircle,
      title: 'Request cancelled',
      time: null,
      detail: cancellationReason || null,
      variant: 'danger',
    } : {
      icon: Clock,
      title: status === 'checked_out' ? 'Awaiting return' : 'Awaiting handover',
      time: `Due ${fmt(expectedReturnDate)}`,
      detail: null,
      variant: 'active',
    },
  ];

  return (
    <div className="max-w-4xl space-y-4">

      {/* ── Back nav ── */}
      <button onClick={() => navigate('/assets/borrows')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors mb-1">
        <ArrowLeft className="h-4 w-4" /> Borrow Requests
      </button>

      {/* ── Group banner ── */}
      {group && (
        <button
          onClick={() => navigate(`/assets/borrows/groups/${group._id}`)}
          className="w-full flex items-center gap-3 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-left hover:bg-purple-100 transition-colors"
        >
          <Layers className="h-4 w-4 text-purple-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-purple-800">Part of a multi-item borrow group</p>
            <p className="text-xs text-purple-500">{group.groupNumber} — click to view all items in this group</p>
          </div>
          <span className="text-xs text-purple-400 shrink-0">View Group →</span>
        </button>
      )}

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 mb-1 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${ss.pill}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${ss.dot}`} />
              {STATUS_LABELS[status]}
            </span>
            <span className="font-mono text-xs text-gray-400">{transactionNumber}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">{asset?.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            <button
              onClick={() => navigate(`/assets/borrowers/${borrower?._id}?name=${encodeURIComponent(borrower?.name || '')}`)}
              className="hover:text-primary-600 hover:underline font-medium">
              {borrower?.name}
            </button>
            {' · '}{asset?.category} · {quantityBorrowed} unit{quantityBorrowed > 1 ? 's' : ''}
          </p>
        </div>
        {notes && (
          <div className="hidden sm:block shrink-0 max-w-[200px]">
            <p className="text-xs text-gray-400 mb-0.5">Note</p>
            <p className="text-xs text-gray-600 italic">"{notes}"</p>
          </div>
        )}
      </div>

      {/* ── Stats strip ── */}
      <div className="bg-white rounded-xl border border-gray-100 grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-gray-100 overflow-hidden">
        <Stat label="Due Date"    value={fmt(expectedReturnDate)} sub={isOverdue ? `${lateDays}d overdue` : null} highlight={isOverdue} />
        <Stat label="Approved By" value={approvedBy?.name || '—'} />
        <Stat label="Logged By"   value={createdBy?.name || '—'}  sub={fmt(createdAt)} />
        <Stat label="Fine / Day"  value={asset?.finePerDay > 0 ? `₹${asset.finePerDay}` : 'No fine'} />
      </div>

      {/* ── Action bar ── */}
      {can('assets:manage') && isActive && (
        <div className={`rounded-xl border px-4 py-3 flex flex-wrap gap-2 items-center ${ss.bar}`}>
          {status === 'approved' && (
            <button onClick={() => setShowCheckout(true)} className="btn-primary flex items-center gap-2 text-sm">
              <ShoppingBag className="h-4 w-4" /> Hand Over to Borrower
            </button>
          )}
          {(status === 'checked_out' || status === 'overdue') && (
            <button onClick={() => navigate(`/assets/borrows/${id}/return`)} className="btn-primary flex items-center gap-2 text-sm">
              <RotateCcw className="h-4 w-4" /> Mark as Returned
            </button>
          )}
          <button onClick={() => setShowExtend(true)} className="btn-secondary flex items-center gap-2 text-sm">
            <CalendarPlus className="h-4 w-4" /> Extend
          </button>
          <button onClick={() => reminderMut.mutate()} disabled={reminderMut.isPending} className="btn-secondary flex items-center gap-2 text-sm">
            <Bell className="h-4 w-4" /> {reminderMut.isPending ? 'Sending…' : 'Remind'}
          </button>
          {status === 'approved' && (
            <button onClick={() => setShowCancel(true)} className="ml-auto btn-danger flex items-center gap-2 text-sm">
              <XCircle className="h-4 w-4" /> Cancel
            </button>
          )}
          <button onClick={() => printHandoverSlip(txn)}
            className={`${status === 'approved' ? '' : 'ml-auto'} btn-secondary flex items-center gap-2 text-sm`}
            title="Print handover slip">
            <Printer className="h-4 w-4" /> Print Slip
          </button>
        </div>
      )}

      {/* ── Body ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* ── Timeline ── */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">Activity</p>
          <div>
            {events.map((ev, i) => (
              <Event key={i} {...ev} isLast={i === events.length - 1} />
            ))}
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="lg:col-span-2 space-y-3">

          {/* Asset card */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-gray-400" />
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Asset</p>
              </div>
              <button onClick={() => navigate(`/assets/${asset?._id}/history`)}
                className="text-xs text-primary-600 hover:underline">History →</button>
            </div>
            <Row label="Name">
              <button onClick={() => navigate(`/assets/${asset?._id}/history`)}
                className="font-medium text-gray-800 hover:text-primary-600 hover:underline">
                {asset?.name}
              </button>
            </Row>
            <Row label="Category">{asset?.category}</Row>
            <Row label="Quantity">{quantityBorrowed} unit{quantityBorrowed > 1 ? 's' : ''}</Row>
            <Row label="Total Available">{asset?.totalQuantity}</Row>
          </div>

          {/* Condition & return */}
          {(conditionAtCheckout || conditionAtReturn || actualReturnDate) && (
            <div className={`rounded-xl border p-4 ${conditionAtReturn === 'damaged' ? 'border-red-200 bg-red-50' : 'bg-white border-gray-100'}`}>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="h-4 w-4 text-gray-400" />
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Condition</p>
              </div>
              {conditionAtCheckout && (
                <Row label="At handover">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${CONDITION_STYLE[conditionAtCheckout]}`}>{conditionAtCheckout}</span>
                </Row>
              )}
              {conditionAtReturn && (
                <Row label="On return">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${CONDITION_STYLE[conditionAtReturn]}`}>{conditionAtReturn}</span>
                </Row>
              )}
              {lateDays > 0 && <Row label="Late by"><span className="text-red-600 font-bold">{lateDays} day{lateDays > 1 ? 's' : ''}</span></Row>}
              {actualReturnDate && <Row label="Returned on">{fmt(actualReturnDate)}</Row>}
              {damageNotes && (
                <div className="mt-3 pt-3 border-t border-red-200">
                  <p className="text-xs text-gray-400 mb-1">Damage notes</p>
                  <p className="text-sm text-red-700">{damageNotes}</p>
                </div>
              )}
            </div>
          )}

          {/* Fine */}
          {(fineApplied || fineWaived || lateDays > 0) && (
            <div className={`rounded-xl border p-4 ${fineApplied ? 'border-amber-200 bg-amber-50' : 'bg-white border-gray-100'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <IndianRupee className="h-4 w-4 text-gray-400" />
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Fine</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  fineApplied ? 'bg-amber-100 text-amber-700' : fineWaived ? 'bg-gray-100 text-gray-500' : 'bg-red-100 text-red-600'
                }`}>
                  {fineApplied ? 'Applied' : fineWaived ? 'Waived' : 'Pending'}
                </span>
              </div>
              {fineApplied && <p className="text-3xl font-black text-amber-700 mb-1">₹{(fineAmount || 0).toLocaleString('en-IN')}</p>}
              {fineWaived && fineWaivedReason && <p className="text-xs text-gray-500 italic">"{fineWaivedReason}"</p>}
              {!fineApplied && !fineWaived && lateDays > 0 && asset?.finePerDay > 0 && (
                <p className="text-sm text-red-600 font-semibold">
                  Est. ₹{(lateDays * asset.finePerDay).toLocaleString('en-IN')}
                  <span className="text-xs font-normal text-gray-400 ml-1">({lateDays}d × ₹{asset.finePerDay})</span>
                </p>
              )}
            </div>
          )}

          {/* Reminders */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-gray-400" />
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Reminders</p>
              </div>
              {remindersSent.length > 0 && (
                <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 font-semibold">{remindersSent.length}</span>
              )}
            </div>
            {remindersSent.length > 0 ? (
              <div className="space-y-0">
                {remindersSent.map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <span className="text-xs text-gray-700">{REMINDER_LABELS[r.reminderType] || r.reminderType}</span>
                    <span className="text-xs text-gray-400 ml-2 shrink-0">{fmtTime(r.sentAt)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No reminders sent yet.</p>
            )}
          </div>

        </div>
      </div>

      {showCheckout && <CheckoutModal txn={txn} onClose={() => setShowCheckout(false)} onSuccess={() => setShowCheckout(false)} />}
      {showExtend   && <ExtendModal   txn={txn} onClose={() => setShowExtend(false)}   onSuccess={() => setShowExtend(false)} />}
      {showCancel   && <CancelModal   txn={txn} onClose={() => setShowCancel(false)}   onSuccess={() => { setShowCancel(false); navigate('/assets/borrows'); }} />}
    </div>
  );
};

export default AssetTransactionDetail;
