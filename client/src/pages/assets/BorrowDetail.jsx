import { useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ShoppingBag, RotateCcw, CalendarPlus, Bell, XCircle,
  CheckCircle2, AlertTriangle, Clock, Hash, Shield, Layers, Printer,
  IndianRupee,
} from 'lucide-react';
import { getBorrowGroup, checkoutGroup, extendGroup, cancelGroup } from '../../api/borrowGroup.api.js';
import {
  getAssetTransaction, checkoutAsset, extendBorrow, cancelBorrow, sendManualReminder,
} from '../../api/assetTransaction.api.js';
import { getApprovers } from '../../api/user.api.js';
import { getSettings } from '../../api/settings.api.js';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import toast from 'react-hot-toast';

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  approved: 'blue', checked_out: 'green', partially_returned: 'yellow',
  returned: 'gray', overdue: 'red', cancelled: 'gray',
};
const STATUS_LABELS = {
  approved: 'Approved', checked_out: 'Checked Out', partially_returned: 'Partially Returned',
  returned: 'Returned', overdue: 'Overdue', cancelled: 'Cancelled',
};
const COND_CLS = {
  good: 'bg-green-100 text-green-700',
  fair: 'bg-yellow-100 text-yellow-700',
  damaged: 'bg-red-100 text-red-700',
};
const REMINDER_LABELS = {
  approved: 'Approval notification', collect: 'Collection reminder',
  due_tomorrow: 'Due tomorrow', due_today: 'Due today', overdue: 'Overdue alert',
};

const fmt     = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

// ── Print Slip (single item only) ─────────────────────────────────────────────
function printHandoverSlip(txn) {
  const { transactionNumber, asset, borrower, externalBorrower, borrowerType, quantityBorrowed, expectedReturnDate, checkedOutAt, conditionAtCheckout, approvedBy, createdBy, notes } = txn;
  const borrowerName = borrowerType === 'external' ? (externalBorrower?.name || '—') : (borrower?.name || '—');
  const p = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Handover Slip</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;padding:28px;max-width:580px;margin:0 auto}
  .header{text-align:center;padding-bottom:12px;border-bottom:2px solid #111;margin-bottom:16px}.temple{font-size:17px;font-weight:bold}
  .slip-title{font-size:13px;font-weight:bold;margin-top:4px;text-transform:uppercase;letter-spacing:1px;color:#444}.ref{font-size:11px;color:#666;margin-top:3px;font-family:monospace}
  .section{margin-bottom:14px}.section-title{font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:.8px;color:#555;border-bottom:1px solid #ddd;padding-bottom:4px;margin-bottom:8px}
  .row{display:flex;justify-content:space-between;margin-bottom:5px}.lbl{color:#666;flex:0 0 45%}.val{font-weight:bold;text-align:right;flex:0 0 53%}
  .sig-area{display:flex;justify-content:space-between;margin-top:36px;gap:20px}.sig-box{flex:1;text-align:center}.sig-line{border-top:1px solid #111;margin-bottom:6px;height:40px}
  .sig-name{font-size:11px;font-weight:bold}.footer{margin-top:20px;text-align:center;font-size:10px;color:#aaa;border-top:1px dashed #ccc;padding-top:8px}
  @media print{body{padding:16px}}</style></head><body>
  <div class="header"><div class="temple">Mangal Grah Mandir, Amalner</div><div class="slip-title">Asset Handover Slip</div><div class="ref">Ref: ${transactionNumber||'—'}</div></div>
  <div class="section"><div class="section-title">Asset Details</div>
  <div class="row"><span class="lbl">Asset Name</span><span class="val">${asset?.name||'—'}</span></div>
  <div class="row"><span class="lbl">Category</span><span class="val">${asset?.category||'—'}</span></div>
  <div class="row"><span class="lbl">Quantity</span><span class="val">${quantityBorrowed}</span></div></div>
  <div class="section"><div class="section-title">Borrower Details</div>
  <div class="row"><span class="lbl">Borrower</span><span class="val">${borrowerName}</span></div>
  <div class="row"><span class="lbl">Expected Return</span><span class="val">${p(expectedReturnDate)}</span></div>
  <div class="row"><span class="lbl">Approved By</span><span class="val">${approvedBy?.name||'—'}</span></div>
  ${checkedOutAt?`<div class="row"><span class="lbl">Date of Collection</span><span class="val">${p(checkedOutAt)}</span></div>`:''}
  ${conditionAtCheckout?`<div class="row"><span class="lbl">Condition</span><span class="val" style="text-transform:capitalize">${conditionAtCheckout}</span></div>`:''}
  </div>${notes?`<div class="section"><div class="section-title">Notes</div><p style="font-size:11px;color:#555">${notes}</p></div>`:''}
  <div class="section"><div class="section-title">Terms</div>
  <div style="font-size:11px;color:#555;line-height:1.6">• The borrower is responsible for safe custody until returned.<br/>
  • Any damage must be reported immediately.<br/>• Asset must be returned by <strong>${p(expectedReturnDate)}</strong>.${asset?.finePerDay>0?` Fine of ₹${asset.finePerDay}/day applies.`:''}</div></div>
  <div class="sig-area"><div class="sig-box"><div class="sig-line"></div><div class="sig-name">${borrowerName}</div><div style="font-size:10px;color:#777">Borrower Signature</div></div>
  <div class="sig-box"><div class="sig-line"></div><div class="sig-name">${createdBy?.name||'Help Desk'}</div><div style="font-size:10px;color:#777">Issued By</div></div></div>
  <div class="footer">Printed on ${p(new Date())} · Mangal Grah Mandir Asset Management</div>
  <script>window.onload=()=>{window.print()}<\/script></body></html>`;
  const win = window.open('', '_blank', 'width=680,height=800');
  if (win) { win.document.write(html); win.document.close(); }
}

// ── Modals ────────────────────────────────────────────────────────────────────
const CheckoutModal = ({ isGroup, id, onClose, onSuccess }) => {
  const qc = useQueryClient();
  const [condition, setCondition] = useState('good');
  const mut = useMutation({
    mutationFn: () => isGroup
      ? checkoutGroup(id, { conditionAtCheckout: condition })
      : checkoutAsset(id, { conditionAtCheckout: condition }),
    onSuccess: () => {
      toast.success(isGroup ? 'All items handed over' : 'Asset handed over');
      qc.invalidateQueries({ queryKey: [isGroup ? 'borrow-group' : 'asset-transaction', id] });
      qc.invalidateQueries({ queryKey: ['asset-transactions'] });
      qc.invalidateQueries({ queryKey: ['asset-counts'] });
      onSuccess();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });
  return (
    <Modal open onClose={onClose} title={isGroup ? 'Hand Over All Items' : 'Hand Over Asset'} size="sm">
      <div className="space-y-4">
        {isGroup && <p className="text-sm text-gray-500">All approved items in this group will be handed over together.</p>}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Condition at handover <span className="text-red-400">*</span></p>
          <div className="flex gap-2">
            {[['good','Good','border-green-400 bg-green-50 text-green-700'],['fair','Fair','border-yellow-400 bg-yellow-50 text-yellow-700'],['damaged','Damaged','border-red-400 bg-red-50 text-red-700']].map(([v,l,cls]) => (
              <button key={v} type="button" onClick={() => setCondition(v)}
                className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-all ${condition === v ? cls : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending} className="btn-primary">
            {mut.isPending ? 'Processing…' : 'Confirm Handover'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

const ExtendModal = ({ isGroup, id, currentDue, onClose, onSuccess }) => {
  const qc = useQueryClient();
  const [newReturnDate, setNewReturnDate] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [notes, setNotes] = useState('');
  const { data: sRes } = useQuery({ queryKey: ['settings'],        queryFn: getSettings });
  const { data: aRes } = useQuery({ queryKey: ['users-approvers'], queryFn: getApprovers });
  const maxDays   = sRes?.data?.data?.assetMaxBorrowDays || 7;
  const approvers = aRes?.data?.data || [];
  const today     = new Date().toISOString().split('T')[0];
  const maxDate   = new Date(); maxDate.setDate(maxDate.getDate() + maxDays);
  const mut = useMutation({
    mutationFn: () => isGroup
      ? extendGroup(id, { newReturnDate, approvedBy, notes: notes || undefined })
      : extendBorrow(id, { newReturnDate, approvedBy, notes: notes || undefined }),
    onSuccess: () => {
      toast.success('Return date extended');
      qc.invalidateQueries({ queryKey: [isGroup ? 'borrow-group' : 'asset-transaction', id] });
      qc.invalidateQueries({ queryKey: ['asset-transactions'] });
      onSuccess();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });
  return (
    <Modal open onClose={onClose} title={isGroup ? 'Extend Return Date (All Items)' : 'Extend Return Date'}>
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Current due: <span className="font-semibold text-amber-700">{fmt(currentDue)}</span>
          {isGroup && <span className="ml-2 text-xs text-gray-400">All active items will get the new date.</span>}
        </p>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">New Return Date <span className="text-red-400">*</span></p>
          <input type="date" min={today} max={maxDate.toISOString().split('T')[0]}
            value={newReturnDate} onChange={(e) => setNewReturnDate(e.target.value)} className="input" />
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
          <button onClick={() => mut.mutate()} disabled={mut.isPending || !newReturnDate || !approvedBy} className="btn-primary">
            {mut.isPending ? 'Extending…' : isGroup ? 'Extend All' : 'Extend Borrow'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

const CancelModal = ({ isGroup, id, onClose, onSuccess }) => {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const mut = useMutation({
    mutationFn: () => isGroup
      ? cancelGroup(id, { cancellationReason: reason || undefined })
      : cancelBorrow(id, { cancellationReason: reason || undefined }),
    onSuccess: () => {
      toast.success('Cancelled');
      qc.invalidateQueries({ queryKey: [isGroup ? 'borrow-group' : 'asset-transaction', id] });
      qc.invalidateQueries({ queryKey: ['asset-transactions'] });
      qc.invalidateQueries({ queryKey: ['asset-counts'] });
      onSuccess();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });
  return (
    <Modal open onClose={onClose} title="Cancel Borrow Request" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          {isGroup
            ? 'All approved items will be cancelled. Items already checked out must be returned individually.'
            : 'This borrow request will be cancelled and the quantity released.'}
        </p>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Reason (optional)</p>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className="input" placeholder="e.g. Event cancelled" />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Keep</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending} className="btn-danger">
            {mut.isPending ? 'Cancelling…' : 'Yes, Cancel'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

// ── Timeline ──────────────────────────────────────────────────────────────────
const TimelineEvent = ({ icon: Icon, title, time, detail, variant = 'done', isLast }) => {
  const dot =
    variant === 'done'    ? 'bg-green-500 text-white' :
    variant === 'active'  ? 'bg-primary-500 text-white' :
    variant === 'danger'  ? 'bg-red-500 text-white' :
    'bg-gray-200 text-gray-400';
  const titleCls =
    variant === 'pending' ? 'text-gray-400' :
    variant === 'danger'  ? 'text-red-700 font-semibold' :
    'text-gray-800 font-semibold';
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        <div className={`h-7 w-7 rounded-full flex items-center justify-center ${dot}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        {!isLast && <div className="w-px flex-1 bg-gray-200 my-1.5 min-h-[20px]" />}
      </div>
      <div className={`pb-5 min-w-0 ${isLast ? 'pb-0' : ''}`}>
        <p className={`text-sm leading-snug ${titleCls}`}>{title}</p>
        {time   && <p className="text-xs text-gray-400 mt-0.5">{time}</p>}
        {detail && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{detail}</p>}
      </div>
    </div>
  );
};

function buildTimeline(group, transactions, isSingle) {
  const { status, createdAt, createdBy, approvedAt, approvedBy, expectedReturnDate, extensions = [], cancellationReason } = group;
  const events = [];

  events.push({ icon: Hash, title: 'Request logged', time: fmtTime(createdAt), detail: createdBy?.name ? `by ${createdBy.name}` : null, variant: 'done' });
  events.push({ icon: Shield, title: 'Approved by trustee', time: fmtTime(approvedAt), detail: approvedBy?.name || null, variant: 'done' });

  const checkedOutTxns = transactions.filter((t) => t.checkedOutAt);
  if (checkedOutTxns.length > 0) {
    const firstMs  = Math.min(...checkedOutTxns.map((t) => new Date(t.checkedOutAt).getTime()));
    const label    = !isSingle && checkedOutTxns.length < transactions.length
      ? `${checkedOutTxns.length} of ${transactions.length} items handed over`
      : 'Handed over to borrower';
    const detail   = isSingle && checkedOutTxns[0]?.conditionAtCheckout
      ? `Condition: ${checkedOutTxns[0].conditionAtCheckout}`
      : (!isSingle ? checkedOutTxns.map((t) => `${t.asset?.name} (${t.conditionAtCheckout || '—'})`).join(', ') : null);
    events.push({ icon: ShoppingBag, title: label, time: fmtTime(new Date(firstMs)), detail, variant: 'done' });
  } else {
    events.push({ icon: ShoppingBag, title: 'Awaiting handover', time: `Due ${fmt(expectedReturnDate)}`, variant: 'pending' });
  }

  for (const ext of extensions) {
    events.push({
      icon: CalendarPlus,
      title: 'Return date extended',
      time: fmtTime(ext.approvedAt),
      detail: `${fmt(ext.previousReturnDate)} → ${fmt(ext.newReturnDate)}${ext.approvedBy?.name ? ` · approved by ${ext.approvedBy.name}` : ''}${ext.notes ? ` · ${ext.notes}` : ''}`,
      variant: 'done',
    });
  }

  if (!isSingle) {
    transactions.filter((t) => t.status === 'returned').forEach((t) => {
      events.push({
        icon: CheckCircle2,
        title: `${t.asset?.name} returned`,
        time: fmtTime(t.actualReturnDate),
        detail: t.conditionAtReturn ? `Condition: ${t.conditionAtReturn}${t.lateDays > 0 ? ` · ${t.lateDays}d late` : ''}` : null,
        variant: 'done',
      });
    });
  }

  if (status === 'returned') {
    if (isSingle) {
      const t = transactions[0];
      events.push({
        icon: CheckCircle2, title: 'Returned', time: fmtTime(t?.actualReturnDate),
        detail: [t?.conditionAtReturn ? `Condition: ${t.conditionAtReturn}` : null, t?.lateDays > 0 ? `${t.lateDays} day(s) late` : null].filter(Boolean).join(' · ') || null,
        variant: 'done',
      });
    } else {
      events.push({ icon: CheckCircle2, title: 'All items returned', variant: 'done' });
    }
  } else if (status === 'partially_returned') {
    const rem = transactions.filter((t) => t.status !== 'returned').length;
    events.push({ icon: Clock, title: `${rem} item(s) still pending return`, time: `Due ${fmt(expectedReturnDate)}`, variant: 'active' });
  } else if (status === 'overdue') {
    const t = transactions[0];
    events.push({ icon: AlertTriangle, title: `Overdue${isSingle && t?.lateDays ? ` — ${t.lateDays} day(s) past due` : ''}`, time: `Was due ${fmt(expectedReturnDate)}`, variant: 'danger' });
  } else if (status === 'cancelled') {
    events.push({ icon: XCircle, title: 'Cancelled', detail: cancellationReason || null, variant: 'danger' });
  } else if (status === 'checked_out') {
    events.push({ icon: Clock, title: 'Awaiting return', time: `Due ${fmt(expectedReturnDate)}`, variant: 'active' });
  }

  return events;
}

// ── Condition pill ────────────────────────────────────────────────────────────
const CondPill = ({ value }) => value
  ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${COND_CLS[value] || ''}`}>{value}</span>
  : <span className="text-gray-300">—</span>;

// ── Main page ─────────────────────────────────────────────────────────────────
const BorrowDetail = () => {
  const { groupId, txnId } = useParams();
  const navigate  = useNavigate();
  const { can }   = usePermissions();
  const qc        = useQueryClient();
  const isGroup   = !!groupId;

  const [showCheckout, setShowCheckout] = useState(false);
  const [showExtend,   setShowExtend]   = useState(false);
  const [showCancel,   setShowCancel]   = useState(false);

  const groupQuery = useQuery({
    queryKey: ['borrow-group', groupId],
    queryFn: () => getBorrowGroup(groupId),
    enabled: isGroup,
  });

  const txnQuery = useQuery({
    queryKey: ['asset-transaction', txnId],
    queryFn: () => getAssetTransaction(txnId),
    enabled: !isGroup && !!txnId,
  });

  const reminderMut = useMutation({
    mutationFn: (id) => sendManualReminder(id),
    onSuccess: () => toast.success('Reminder sent'),
    onError:   (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  if (groupQuery.isLoading || txnQuery.isLoading) return <PageLoader />;

  const singleTxn = txnQuery.data?.data?.data;

  // Single txn that belongs to a group → redirect to group page
  if (!isGroup && singleTxn?.group?._id) {
    return <Navigate to={`/assets/borrows/groups/${singleTxn.group._id}`} replace />;
  }

  // Normalize both cases to unified shape
  let group, transactions;
  if (isGroup) {
    const res  = groupQuery.data?.data?.data;
    group      = res?.group;
    transactions = res?.transactions || [];
  } else {
    group = singleTxn ? {
      _id: singleTxn._id,
      groupNumber: singleTxn.transactionNumber,
      borrowerType: singleTxn.borrowerType,
      borrower: singleTxn.borrower,
      externalBorrower: singleTxn.externalBorrower,
      approvedBy: singleTxn.approvedBy,
      approvedAt: singleTxn.approvedAt,
      expectedReturnDate: singleTxn.expectedReturnDate,
      status: singleTxn.status,
      extensions: singleTxn.extensions || [],
      remindersSent: singleTxn.remindersSent || [],
      notes: singleTxn.notes,
      createdBy: singleTxn.createdBy,
      createdAt: singleTxn.createdAt,
      cancellationReason: singleTxn.cancellationReason,
    } : null;
    transactions = singleTxn ? [singleTxn] : [];
  }

  if (!group) return <div className="p-6 text-gray-400">Not found.</div>;

  const { status, borrowerType, borrower, externalBorrower, approvedBy, expectedReturnDate, extensions = [], remindersSent = [], notes, cancellationReason } = group;
  const isExternal   = borrowerType === 'external';
  const borrowerName = isExternal ? externalBorrower?.name : borrower?.name;
  const isSingle     = transactions.length === 1;
  const isActive     = !['returned', 'cancelled'].includes(status);
  const hasApproved  = transactions.some((t) => t.status === 'approved');
  const hasCheckedOut = transactions.some((t) => ['checked_out', 'overdue'].includes(t.status));
  const activeTargets = transactions.filter((t) => ['approved', 'checked_out', 'overdue'].includes(t.status));
  const totalFines   = transactions.reduce((s, t) => s + (t.fineApplied ? (t.fineAmount || 0) : 0), 0);
  const actionId     = isGroup ? groupId : txnId;

  const ss           = STATUS_COLORS[status] || 'gray';
  const timelineEvents = buildTimeline(group, transactions, isSingle);

  return (
    <div className="max-w-5xl space-y-4">

      {/* Back nav */}
      <button onClick={() => navigate('/assets/borrows')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Borrow Requests
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant={ss}>{STATUS_LABELS[status]}</Badge>
            <span className="font-mono text-xs text-gray-400">{group.groupNumber}</span>
            {!isSingle && (
              <span className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-600 border border-purple-200 rounded-full px-2 py-0.5">
                <Layers className="h-3 w-3" /> {transactions.length} items
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{borrowerName}</h1>
            {isExternal && (
              <span className="text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">External</span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            Approved by {approvedBy?.name || '—'} · Due {fmt(expectedReturnDate)}
            {notes && <> · <span className="italic">"{notes}"</span></>}
          </p>
        </div>
      </div>

      {/* Stats strip */}
      {isSingle ? (
        <div className="bg-white rounded-xl border border-gray-100 grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-100 overflow-hidden">
          {[
            { label: 'Due Date',    value: fmt(expectedReturnDate) },
            { label: 'Approved By', value: approvedBy?.name || '—' },
            { label: 'Asset',       value: transactions[0]?.asset?.name || '—' },
            { label: 'Fine / Day',  value: transactions[0]?.asset?.finePerDay > 0 ? `₹${transactions[0].asset.finePerDay}` : 'No fine' },
          ].map(({ label, value }) => (
            <div key={label} className="px-4 py-3">
              <p className="text-xs text-gray-400 font-medium">{label}</p>
              <p className="text-sm font-bold text-gray-800 mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-100 overflow-hidden">
          {[
            { label: 'Total Items',    value: transactions.length,                                                        color: 'text-gray-700' },
            { label: 'Pending Return', value: transactions.filter((t) => ['checked_out','overdue'].includes(t.status)).length, color: 'text-blue-600' },
            { label: 'Overdue Items',  value: transactions.filter((t) => t.status === 'overdue').length,                 color: 'text-red-600' },
            { label: 'Returned',       value: transactions.filter((t) => t.status === 'returned').length,                color: 'text-green-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="px-4 py-3 text-center">
              <p className={`text-2xl font-black ${color}`}>{value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Action bar */}
      {can('assets:manage') && isActive && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex flex-wrap gap-2 items-center">
          {hasApproved && (
            <button onClick={() => setShowCheckout(true)} className="btn-primary flex items-center gap-2 text-sm">
              <ShoppingBag className="h-4 w-4" /> Hand Over{!isSingle ? ' All' : ''}
            </button>
          )}
          {(hasApproved || hasCheckedOut) && (
            <button onClick={() => setShowExtend(true)} className="btn-secondary flex items-center gap-2 text-sm">
              <CalendarPlus className="h-4 w-4" /> Extend{!isSingle ? ' All' : ''}
            </button>
          )}
          {activeTargets.length > 0 && (
            <button
              onClick={() => activeTargets.forEach((t) => reminderMut.mutate(t._id))}
              disabled={reminderMut.isPending}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <Bell className="h-4 w-4" /> {reminderMut.isPending ? 'Sending…' : 'Send Reminder'}
            </button>
          )}
          {isSingle && transactions[0]?.checkedOutAt && (
            <button onClick={() => printHandoverSlip(transactions[0])} className="btn-secondary flex items-center gap-2 text-sm">
              <Printer className="h-4 w-4" /> Print Slip
            </button>
          )}
          {hasApproved && (
            <button onClick={() => setShowCancel(true)} className="btn-danger flex items-center gap-2 text-sm ml-auto">
              <XCircle className="h-4 w-4" /> Cancel
            </button>
          )}
        </div>
      )}

      {/* Cancellation notice */}
      {status === 'cancelled' && cancellationReason && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700"><span className="font-semibold">Cancelled:</span> {cancellationReason}</p>
        </div>
      )}

      {/* Items table */}
      <div className="card overflow-hidden">
        <div className="px-4 py-2.5 border-b bg-gray-50">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Items ({transactions.length})
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="table-th">Asset</th>
                <th className="table-th text-center">Qty</th>
                <th className="table-th">Status</th>
                <th className="table-th">Cond. Out</th>
                <th className="table-th">Cond. Return</th>
                <th className="table-th text-right">Late</th>
                <th className="table-th text-right">Fine</th>
                {can('assets:manage') && <th className="table-th w-24" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {transactions.map((t) => (
                <tr key={t._id} className="hover:bg-gray-50">
                  <td className="table-td">
                    <button
                      onClick={() => navigate(`/assets/${t.asset?._id}/history`)}
                      className="font-medium text-gray-900 hover:text-primary-600 hover:underline text-left"
                    >
                      {t.asset?.name}
                    </button>
                    <p className="text-xs text-gray-400">{t.asset?.category}</p>
                  </td>
                  <td className="table-td text-center font-semibold">{t.quantityBorrowed}</td>
                  <td className="table-td">
                    <Badge variant={STATUS_COLORS[t.status] || 'gray'} size="sm">{STATUS_LABELS[t.status]}</Badge>
                  </td>
                  <td className="table-td"><CondPill value={t.conditionAtCheckout} /></td>
                  <td className="table-td"><CondPill value={t.conditionAtReturn} /></td>
                  <td className="table-td text-right">
                    {t.lateDays > 0
                      ? <span className="text-red-600 font-semibold">{t.lateDays}d</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="table-td text-right">
                    {t.fineApplied
                      ? <span className="text-amber-700 font-semibold">₹{t.fineAmount}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  {can('assets:manage') && (
                    <td className="table-td">
                      {(t.status === 'checked_out' || t.status === 'overdue') && (
                        <button
                          onClick={() => navigate(`/assets/borrows/${t._id}/return`)}
                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        >
                          <RotateCcw className="h-3 w-3" /> Return
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {totalFines > 0 && (
              <tfoot>
                <tr className="bg-amber-50 border-t border-amber-100">
                  <td className="table-td font-semibold text-amber-800" colSpan={6}>Total Fines</td>
                  <td className="table-td text-right font-black text-amber-700">₹{totalFines.toLocaleString('en-IN')}</td>
                  {can('assets:manage') && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Timeline + Reminders */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Timeline */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">Activity</p>
          <div>
            {timelineEvents.map((ev, i) => (
              <TimelineEvent key={i} {...ev} isLast={i === timelineEvents.length - 1} />
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-2 space-y-3">

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
              <div>
                {remindersSent.map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <span className="text-xs text-gray-700">{REMINDER_LABELS[r.reminderType] || r.reminderType}</span>
                    <span className="text-xs text-gray-400 shrink-0 ml-2">{fmtTime(r.sentAt)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No reminders sent yet.</p>
            )}
          </div>

          {/* Fine summary (single item) */}
          {isSingle && (transactions[0]?.fineApplied || transactions[0]?.fineWaived || (transactions[0]?.lateDays > 0 && transactions[0]?.asset?.finePerDay > 0)) && (() => {
            const t = transactions[0];
            return (
              <div className={`rounded-xl border p-4 ${t.fineApplied ? 'border-amber-200 bg-amber-50' : 'bg-white border-gray-100'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <IndianRupee className="h-4 w-4 text-gray-400" />
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Fine</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${t.fineApplied ? 'bg-amber-100 text-amber-700' : t.fineWaived ? 'bg-gray-100 text-gray-500' : 'bg-red-100 text-red-600'}`}>
                    {t.fineApplied ? 'Applied' : t.fineWaived ? 'Waived' : 'Pending'}
                  </span>
                </div>
                {t.fineApplied && <p className="text-3xl font-black text-amber-700 mb-1">₹{(t.fineAmount || 0).toLocaleString('en-IN')}</p>}
                {t.fineWaived && t.fineWaivedReason && <p className="text-xs text-gray-500 italic">"{t.fineWaivedReason}"</p>}
                {!t.fineApplied && !t.fineWaived && t.lateDays > 0 && t.asset?.finePerDay > 0 && (
                  <p className="text-sm text-red-600 font-semibold">
                    Est. ₹{(t.lateDays * t.asset.finePerDay).toLocaleString('en-IN')}
                    <span className="text-xs font-normal text-gray-400 ml-1">({t.lateDays}d × ₹{t.asset.finePerDay})</span>
                  </p>
                )}
              </div>
            );
          })()}

        </div>
      </div>

      {/* Modals */}
      {showCheckout && <CheckoutModal isGroup={isGroup} id={actionId} onClose={() => setShowCheckout(false)} onSuccess={() => setShowCheckout(false)} />}
      {showExtend   && <ExtendModal   isGroup={isGroup} id={actionId} currentDue={expectedReturnDate} onClose={() => setShowExtend(false)} onSuccess={() => setShowExtend(false)} />}
      {showCancel   && <CancelModal   isGroup={isGroup} id={actionId} onClose={() => setShowCancel(false)} onSuccess={() => { setShowCancel(false); navigate('/assets/borrows'); }} />}
    </div>
  );
};

export default BorrowDetail;
