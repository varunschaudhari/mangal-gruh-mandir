import { useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ShoppingBag, RotateCcw, CalendarPlus, Bell, XCircle,
  CheckCircle2, AlertTriangle, Clock, Hash, Shield, Layers, Printer,
  IndianRupee, PackageX, Wrench, BadgeCheck,
} from 'lucide-react';
import { getBorrowGroup, checkoutGroup, extendGroup, cancelGroup } from '../../api/borrowGroup.api.js';
import {
  getAssetTransaction, checkoutAsset, extendBorrow, cancelBorrow, sendManualReminder,
  markAssetLost, settleFine, updateDamageStatus,
} from '../../api/assetTransaction.api.js';
import { getApprovers } from '../../api/user.api.js';
import { getSettings } from '../../api/settings.api.js';
import SearchableSelect from '../../components/ui/SearchableSelect.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import toast from 'react-hot-toast';
import { printHandoverSlip } from '../../utils/handoverSlip.js';
import { useSetAppBarTitle } from '../../components/Layout/AppBarContext.jsx';
import { localDateStr } from '../../utils/formatters.js';
import { useT, tNow } from '../../i18n/index.jsx';

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  approved: 'blue', checked_out: 'green', partially_returned: 'yellow',
  returned: 'gray', overdue: 'red', cancelled: 'gray', lost: 'red',
};
const STATUS_LABELS = {
  approved: 'Approved', checked_out: 'Checked Out', partially_returned: 'Partially Returned',
  returned: 'Returned', overdue: 'Overdue', cancelled: 'Cancelled', lost: 'Lost',
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

// ── Modals ────────────────────────────────────────────────────────────────────
const CheckoutModal = ({ isGroup, id, onClose, onSuccess }) => {
  const t = useT();
  const qc = useQueryClient();
  const [condition, setCondition] = useState('good');
  const mut = useMutation({
    mutationFn: () => isGroup
      ? checkoutGroup(id, { conditionAtCheckout: condition })
      : checkoutAsset(id, { conditionAtCheckout: condition }),
    onSuccess: () => {
      toast.success(isGroup ? t('All items handed over') : t('Asset handed over'));
      qc.invalidateQueries({ queryKey: [isGroup ? 'borrow-group' : 'asset-transaction', id] });
      qc.invalidateQueries({ queryKey: ['asset-transactions'] });
      qc.invalidateQueries({ queryKey: ['asset-counts'] });
      onSuccess();
    },
    onError: (e) => toast.error(e.response?.data?.message || t('Failed')),
  });
  return (
    <Modal open onClose={onClose} title={isGroup ? 'Hand Over All Items' : 'Hand Over Asset'} size="sm">
      <div className="space-y-4">
        {isGroup && <p className="text-sm text-gray-500">{t('All approved items in this group will be handed over together.')}</p>}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('Condition at handover')} <span className="text-red-400">*</span></p>
          <div className="flex gap-2">
            {[['good','Good','border-green-400 bg-green-50 text-green-700'],['fair','Fair','border-yellow-400 bg-yellow-50 text-yellow-700'],['damaged','Damaged','border-red-400 bg-red-50 text-red-700']].map(([v,l,cls]) => (
              <button key={v} type="button" onClick={() => setCondition(v)}
                className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-all ${condition === v ? cls : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">{t('Cancel')}</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending} className="btn-primary">
            {mut.isPending ? t('Processing…') : t('Confirm Handover')}
          </button>
        </div>
      </div>
    </Modal>
  );
};

const ExtendModal = ({ isGroup, id, currentDue, onClose, onSuccess }) => {
  const t = useT();
  const qc = useQueryClient();
  const [newReturnDate, setNewReturnDate] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [notes, setNotes] = useState('');
  const { data: sRes } = useQuery({ queryKey: ['settings'],        queryFn: getSettings });
  const { data: aRes } = useQuery({ queryKey: ['users-approvers'], queryFn: getApprovers });
  const maxDays   = sRes?.data?.data?.assetMaxBorrowDays || 7;
  const approvers = aRes?.data?.data || [];
  const today     = localDateStr();
  const maxDate   = new Date(); maxDate.setDate(maxDate.getDate() + maxDays);
  const mut = useMutation({
    mutationFn: () => isGroup
      ? extendGroup(id, { newReturnDate, approvedBy, notes: notes || undefined })
      : extendBorrow(id, { newReturnDate, approvedBy, notes: notes || undefined }),
    onSuccess: () => {
      toast.success(t('Return date extended'));
      qc.invalidateQueries({ queryKey: [isGroup ? 'borrow-group' : 'asset-transaction', id] });
      qc.invalidateQueries({ queryKey: ['asset-transactions'] });
      onSuccess();
    },
    onError: (e) => toast.error(e.response?.data?.message || t('Failed')),
  });
  return (
    <Modal open onClose={onClose} title={isGroup ? 'Extend Return Date (All Items)' : 'Extend Return Date'}>
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          {t('Current due:')} <span className="font-semibold text-amber-700">{fmt(currentDue)}</span>
          {isGroup && <span className="ml-2 text-xs text-gray-400">{t('All active items will get the new date.')}</span>}
        </p>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('New Return Date')} <span className="text-red-400">*</span></p>
          <input type="date" min={today} max={localDateStr(maxDate)}
            value={newReturnDate} onChange={(e) => setNewReturnDate(e.target.value)} className="input" />
          <p className="mt-1 text-xs text-gray-400">{t('Max')} {maxDays} {t('days from today')}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('Approved By (Trustee)')} <span className="text-red-400">*</span></p>
          <SearchableSelect
            value={approvedBy}
            onChange={setApprovedBy}
            options={approvers.map((u) => ({ value: u._id, label: u.name }))}
            placeholder={t('— Select trustee —')}
          />
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('Reason (optional)')}</p>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="input" placeholder={t('e.g. Event extended')} />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">{t('Cancel')}</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending || !newReturnDate || !approvedBy} className="btn-primary">
            {mut.isPending ? t('Extending…') : isGroup ? t('Extend All') : t('Extend Borrow')}
          </button>
        </div>
      </div>
    </Modal>
  );
};

const CancelModal = ({ isGroup, id, onClose, onSuccess }) => {
  const t = useT();
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const mut = useMutation({
    mutationFn: () => isGroup
      ? cancelGroup(id, { cancellationReason: reason || undefined })
      : cancelBorrow(id, { cancellationReason: reason || undefined }),
    onSuccess: () => {
      toast.success(t('Cancelled'));
      qc.invalidateQueries({ queryKey: [isGroup ? 'borrow-group' : 'asset-transaction', id] });
      qc.invalidateQueries({ queryKey: ['asset-transactions'] });
      qc.invalidateQueries({ queryKey: ['asset-counts'] });
      onSuccess();
    },
    onError: (e) => toast.error(e.response?.data?.message || t('Failed')),
  });
  return (
    <Modal open onClose={onClose} title="Cancel Borrow Request" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          {isGroup
            ? t('All approved items will be cancelled. Items already checked out must be returned individually.')
            : t('This borrow request will be cancelled and the quantity released.')}
        </p>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('Reason (optional)')}</p>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className="input" placeholder={t('e.g. Event cancelled')} />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">{t('Keep')}</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending} className="btn-danger">
            {mut.isPending ? t('Cancelling…') : t('Yes, Cancel')}
          </button>
        </div>
      </div>
    </Modal>
  );
};

const MarkLostModal = ({ id, onClose, onSuccess }) => {
  const t = useT();
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const mut = useMutation({
    mutationFn: () => markAssetLost(id, { lostReason: reason || undefined }),
    onSuccess: () => {
      toast.success(t('Asset marked as lost'));
      qc.invalidateQueries({ queryKey: ['asset-transaction', id] });
      qc.invalidateQueries({ queryKey: ['borrow-group'] });
      qc.invalidateQueries({ queryKey: ['asset-transactions'] });
      qc.invalidateQueries({ queryKey: ['asset-counts'] });
      onSuccess();
    },
    onError: (e) => toast.error(e.response?.data?.message || t('Failed')),
  });
  return (
    <Modal open onClose={onClose} title="Mark Asset as Lost" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          {t('Mark this asset as permanently lost. The borrower remains responsible for the loss. This action cannot be undone.')}
        </p>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('Reason (optional)')}</p>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
            className="input" placeholder={t('e.g. Borrower reported stolen, cannot locate…')} />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">{t('Cancel')}</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending}
            className="btn-danger flex items-center gap-2 text-sm">
            <PackageX className="h-4 w-4" />
            {mut.isPending ? t('Marking…') : t('Mark as Lost')}
          </button>
        </div>
      </div>
    </Modal>
  );
};

const SettleFineModal = ({ txn, onClose, onSuccess }) => {
  const t = useT();
  const qc = useQueryClient();
  const [action, setAction] = useState('paid');
  const [waivedReason, setWaivedReason] = useState('');
  const mut = useMutation({
    mutationFn: () => settleFine(txn._id, { action, waivedReason: action === 'waived' ? waivedReason : undefined }),
    onSuccess: () => {
      toast.success(action === 'waived' ? t('Fine waived') : t('Fine marked as collected'));
      qc.invalidateQueries({ queryKey: ['asset-transaction', txn._id] });
      qc.invalidateQueries({ queryKey: ['borrow-group'] });
      onSuccess();
    },
    onError: (e) => toast.error(e.response?.data?.message || t('Failed')),
  });
  return (
    <Modal open onClose={onClose} title="Settle Fine" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          {t('Fine of')} <strong>₹{(txn.fineAmount || 0).toLocaleString('en-IN')}</strong> {t('— mark it as:')}
        </p>
        <div className="flex gap-2">
          {[['paid', 'Collected', 'border-green-400 bg-green-50 text-green-700'],
            ['waived', 'Waived', 'border-gray-400 bg-gray-50 text-gray-700']].map(([v, l, cls]) => (
            <button key={v} type="button" onClick={() => setAction(v)}
              className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-all ${action === v ? cls : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}>
              {l}
            </button>
          ))}
        </div>
        {action === 'waived' && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('Reason')}</p>
            <input type="text" value={waivedReason} onChange={(e) => setWaivedReason(e.target.value)}
              className="input" placeholder={t('e.g. One-time waiver, financial hardship…')} />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">{t('Cancel')}</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending}
            className="btn-primary flex items-center gap-2 text-sm">
            <BadgeCheck className="h-4 w-4" />
            {mut.isPending ? t('Saving…') : action === 'waived' ? t('Waive Fine') : t('Mark Collected')}
          </button>
        </div>
      </div>
    </Modal>
  );
};

const DamageStatusModal = ({ txn, onClose, onSuccess }) => {
  const t = useT();
  const qc = useQueryClient();
  const DAMAGE_OPTS = [
    { value: 'reported',  label: t('Reported'),  desc: 'Damage noted, assessment pending' },
    { value: 'assessed',  label: t('Assessed'),  desc: 'Damage assessed, repair in progress' },
    { value: 'repaired',  label: t('Repaired'),  desc: 'Asset repaired and back in service' },
  ];
  const [status, setStatus] = useState(txn.damageStatus || 'reported');
  const mut = useMutation({
    mutationFn: () => updateDamageStatus(txn._id, { damageStatus: status }),
    onSuccess: () => {
      toast.success(t('Damage status updated'));
      qc.invalidateQueries({ queryKey: ['asset-transaction', txn._id] });
      qc.invalidateQueries({ queryKey: ['borrow-group'] });
      onSuccess();
    },
    onError: (e) => toast.error(e.response?.data?.message || t('Failed')),
  });
  return (
    <Modal open onClose={onClose} title="Update Damage Status" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">{t('Track the repair/assessment progress for this damaged asset.')}</p>
        <div className="space-y-2">
          {DAMAGE_OPTS.map(({ value, label, desc }) => (
            <label key={value}
              className={`flex items-start gap-3 rounded-lg border-2 p-3 cursor-pointer transition-all ${status === value ? 'border-amber-400 bg-amber-50' : 'border-gray-100 hover:border-gray-200'}`}>
              <input type="radio" className="mt-0.5 accent-amber-500" checked={status === value} onChange={() => setStatus(value)} />
              <div>
                <p className={`text-sm font-semibold ${status === value ? 'text-amber-800' : 'text-gray-700'}`}>{t(label)}</p>
                <p className="text-xs text-gray-400">{desc}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">{t('Cancel')}</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending}
            className="btn-primary flex items-center gap-2 text-sm">
            <Wrench className="h-4 w-4" />
            {mut.isPending ? t('Saving…') : t('Update Status')}
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

  events.push({ icon: Hash, title: tNow('Request logged'), time: fmtTime(createdAt), detail: createdBy?.name ? `by ${createdBy.name}` : null, variant: 'done' });
  events.push({ icon: Shield, title: tNow('Approved by trustee'), time: fmtTime(approvedAt), detail: approvedBy?.name || null, variant: 'done' });

  const checkedOutTxns = transactions.filter((item) => item.checkedOutAt);
  if (checkedOutTxns.length > 0) {
    const firstMs  = Math.min(...checkedOutTxns.map((item) => new Date(item.checkedOutAt).getTime()));
    const label    = !isSingle && checkedOutTxns.length < transactions.length
      ? tNow('{n} of {total} items handed over', { n: checkedOutTxns.length, total: transactions.length })
      : 'Handed over to borrower';
    const detail   = isSingle && checkedOutTxns[0]?.conditionAtCheckout
      ? `Condition: ${checkedOutTxns[0].conditionAtCheckout}`
      : (!isSingle ? checkedOutTxns.map((item) => `${item.asset?.name} (${item.conditionAtCheckout || '—'})`).join(', ') : null);
    events.push({ icon: ShoppingBag, title: label, time: fmtTime(new Date(firstMs)), detail, variant: 'done' });
  } else {
    events.push({ icon: ShoppingBag, title: tNow('Awaiting handover'), time: `Due ${fmt(expectedReturnDate)}`, variant: 'pending' });
  }

  for (const ext of extensions) {
    events.push({
      icon: CalendarPlus,
      title: tNow('Return date extended'),
      time: fmtTime(ext.approvedAt),
      detail: `${fmt(ext.previousReturnDate)} → ${fmt(ext.newReturnDate)}${ext.approvedBy?.name ? ` · approved by ${ext.approvedBy.name}` : ''}${ext.notes ? ` · ${ext.notes}` : ''}`,
      variant: 'done',
    });
  }

  if (!isSingle) {
    transactions.filter((item) => item.status === 'returned').forEach((item) => {
      events.push({
        icon: CheckCircle2,
        title: `${item.asset?.name} returned`,
        time: fmtTime(item.actualReturnDate),
        detail: item.conditionAtReturn ? `Condition: ${item.conditionAtReturn}${item.lateDays > 0 ? ` · ${item.lateDays}d late` : ''}` : null,
        variant: 'done',
      });
    });
  }

  if (status === 'returned') {
    if (isSingle) {
      const entry = transactions[0];
      events.push({
        icon: CheckCircle2, title: tNow('Returned'), time: fmtTime(entry?.actualReturnDate),
        detail: [entry?.conditionAtReturn ? `Condition: ${entry.conditionAtReturn}` : null, entry?.lateDays > 0 ? `${entry.lateDays} day(s) late` : null].filter(Boolean).join(' · ') || null,
        variant: 'done',
      });
    } else {
      events.push({ icon: CheckCircle2, title: tNow('All items returned'), variant: 'done' });
    }
  } else if (status === 'partially_returned') {
    const rem = transactions.filter((item) => item.status !== 'returned').length;
    events.push({ icon: Clock, title: tNow('{n} item(s) still pending return', { n: rem }), time: tNow('Due {date}', { date: fmt(expectedReturnDate) }), variant: 'active' });
  } else if (status === 'overdue') {
    const entry = transactions[0];
    events.push({ icon: AlertTriangle, title: isSingle && entry?.lateDays ? tNow('Overdue — {n} day(s) past due', { n: entry.lateDays }) : tNow('Overdue'), time: tNow('Was due {date}', { date: fmt(expectedReturnDate) }), variant: 'danger' });
  } else if (status === 'cancelled') {
    events.push({ icon: XCircle, title: tNow('Cancelled'), detail: cancellationReason || null, variant: 'danger' });
  } else if (status === 'lost') {
    const entry = transactions[0];
    events.push({ icon: PackageX, title: tNow('Reported as Lost'), detail: entry?.lostReason || null, variant: 'danger' });
  } else if (status === 'checked_out') {
    events.push({ icon: Clock, title: tNow('Awaiting return'), time: `Due ${fmt(expectedReturnDate)}`, variant: 'active' });
  }

  return events;
}

// ── Condition pill ────────────────────────────────────────────────────────────
const CondPill = ({ value }) => value
  ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${COND_CLS[value] || ''}`}>{value}</span>
  : <span className="text-gray-300">—</span>;

// ── Main page ─────────────────────────────────────────────────────────────────
const BorrowDetail = () => {
  const t = useT();
  useSetAppBarTitle('Borrow Request');
  const { groupId, txnId } = useParams();
  const navigate  = useNavigate();
  const { can }   = usePermissions();
  const qc        = useQueryClient();
  const isGroup   = !!groupId;

  const [showCheckout,    setShowCheckout]    = useState(false);
  const [showExtend,      setShowExtend]      = useState(false);
  const [showCancel,      setShowCancel]      = useState(false);
  const [showMarkLost,    setShowMarkLost]    = useState(false);
  const [showSettleFine,  setShowSettleFine]  = useState(false);
  const [showDamage,      setShowDamage]      = useState(false);

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
    onSuccess: () => toast.success(t('Reminder sent')),
    onError:   (e) => toast.error(e.response?.data?.message || t('Failed')),
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

  if (!group) return <div className="p-6 text-gray-400">{t('Not found.')}</div>;

  const { status, borrowerType, borrower, externalBorrower, approvedBy, expectedReturnDate, extensions = [], remindersSent = [], notes, cancellationReason } = group;
  const isExternal   = borrowerType === 'external';
  const borrowerName = isExternal ? externalBorrower?.name : borrower?.name;
  const isSingle     = transactions.length === 1;
  const isActive     = !['returned', 'cancelled', 'lost'].includes(status);
  const hasApproved  = transactions.some((item) => item.status === 'approved');
  const hasCheckedOut = transactions.some((item) => ['checked_out', 'overdue'].includes(item.status));
  const activeTargets = transactions.filter((item) => ['approved', 'checked_out', 'overdue'].includes(item.status));
  const totalFines   = transactions.reduce((s, item) => s + (item.fineApplied ? (item.fineAmount || 0) : 0), 0);
  const actionId     = isGroup ? groupId : txnId;

  const ss           = STATUS_COLORS[status] || 'gray';
  const timelineEvents = buildTimeline(group, transactions, isSingle);

  return (
    <div className="max-w-5xl space-y-4">

      {/* Back nav */}
      <button onClick={() => navigate('/assets/borrows')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
        <ArrowLeft className="h-4 w-4" /> {t('Borrow Requests')}
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant={ss}>{STATUS_LABELS[status]}</Badge>
            <span className="font-mono text-xs text-gray-400">{group.groupNumber}</span>
            {!isSingle && (
              <span className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-600 border border-purple-200 rounded-full px-2 py-0.5">
                <Layers className="h-3 w-3" /> {transactions.length} {t('items')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{borrowerName}</h1>
            {isExternal && (
              <span className="text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">{t('External')}</span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {t('Approved by')} {approvedBy?.name || '—'} {t('· Due')} {fmt(expectedReturnDate)}
            {notes && <> · <span className="italic">"{notes}"</span></>}
          </p>
        </div>
      </div>

      {/* Stats strip */}
      {isSingle ? (
        <div className="bg-white rounded-xl border border-gray-100 grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-100 overflow-hidden">
          {[
            { label: t('Due Date'),    value: fmt(expectedReturnDate) },
            { label: t('Approved By'), value: approvedBy?.name || '—' },
            { label: t('Asset'),       value: transactions[0]?.asset?.name || '—' },
            { label: t('Fine / Day'),  value: transactions[0]?.asset?.finePerDay > 0 ? `₹${transactions[0].asset.finePerDay}` : 'No fine' },
          ].map(({ label, value }) => (
            <div key={label} className="px-4 py-3">
              <p className="text-xs text-gray-400 font-medium">{t(label)}</p>
              <p className="text-sm font-bold text-gray-800 mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-100 overflow-hidden">
          {[
            { label: t('Total Items'),    value: transactions.length,                                                        color: 'text-gray-700' },
            { label: t('Pending Return'), value: transactions.filter((item) => ['checked_out','overdue'].includes(item.status)).length, color: 'text-blue-600' },
            { label: t('Overdue Items'),  value: transactions.filter((item) => item.status === 'overdue').length,                 color: 'text-red-600' },
            { label: t('Returned'),       value: transactions.filter((item) => item.status === 'returned').length,                color: 'text-green-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="px-4 py-3 text-center">
              <p className={`text-2xl font-black ${color}`}>{value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{t(label)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Action bar */}
      {can('assets:manage') && isActive && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex flex-wrap gap-2 items-center">
          {hasApproved && (
            <button onClick={() => setShowCheckout(true)} className="btn-primary flex items-center gap-2 text-sm">
              <ShoppingBag className="h-4 w-4" /> {t('Hand Over')}{!isSingle ? t(' All') : ''}
            </button>
          )}
          {(hasApproved || hasCheckedOut) && (
            <button onClick={() => setShowExtend(true)} className="btn-secondary flex items-center gap-2 text-sm">
              <CalendarPlus className="h-4 w-4" /> {t('Extend')}{!isSingle ? t(' All') : ''}
            </button>
          )}
          {activeTargets.length > 0 && (
            <button
              onClick={() => activeTargets.forEach((item) => reminderMut.mutate(item._id))}
              disabled={reminderMut.isPending}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <Bell className="h-4 w-4" /> {reminderMut.isPending ? t('Sending…') : t('Send Reminder')}
            </button>
          )}
          {isSingle && transactions[0]?.checkedOutAt && (
            <button onClick={() => printHandoverSlip(transactions[0])} className="btn-secondary flex items-center gap-2 text-sm">
              <Printer className="h-4 w-4" /> {t('Print Slip')}
            </button>
          )}
          {hasApproved && (
            <button onClick={() => setShowCancel(true)} className="btn-danger flex items-center gap-2 text-sm ml-auto">
              <XCircle className="h-4 w-4" /> {t('Cancel')}
            </button>
          )}
          {hasCheckedOut && (
            <button onClick={() => setShowMarkLost(true)}
              className="btn-secondary flex items-center gap-2 text-sm text-red-600 border-red-200 hover:border-red-300">
              <PackageX className="h-4 w-4" /> {t('Mark Lost')}
            </button>
          )}
        </div>
      )}

      {/* Cancellation notice */}
      {status === 'cancelled' && cancellationReason && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700"><span className="font-semibold">{t('Cancelled:')}</span> {cancellationReason}</p>
        </div>
      )}

      {/* Items table */}
      <div className="card overflow-hidden">
        <div className="px-4 py-2.5 border-b bg-gray-50">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {t('Items (')}{transactions.length})
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="table-th">{t('Asset')}</th>
                <th className="table-th text-center">{t('Qty')}</th>
                <th className="table-th">{t('Status')}</th>
                <th className="table-th">{t('Cond. Out')}</th>
                <th className="table-th">{t('Cond. Return')}</th>
                <th className="table-th text-right">{t('Late')}</th>
                <th className="table-th text-right">{t('Fine')}</th>
                {can('assets:manage') && <th className="table-th w-24" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {transactions.map((txn) => (
                <tr key={txn._id} className="hover:bg-gray-50">
                  <td className="table-td">
                    <button
                      onClick={() => navigate(`/assets/${txn.asset?._id}/history`)}
                      className="font-medium text-gray-900 hover:text-primary-600 hover:underline text-left"
                    >
                      {txn.asset?.name}
                    </button>
                    <p className="text-xs text-gray-400">{txn.asset?.category}</p>
                  </td>
                  <td className="table-td text-center font-semibold">{txn.quantityBorrowed}</td>
                  <td className="table-td">
                    <Badge variant={STATUS_COLORS[txn.status] || 'gray'} size="sm">{STATUS_LABELS[txn.status]}</Badge>
                  </td>
                  <td className="table-td"><CondPill value={txn.conditionAtCheckout} /></td>
                  <td className="table-td"><CondPill value={txn.conditionAtReturn} /></td>
                  <td className="table-td text-right">
                    {txn.lateDays > 0
                      ? <span className="text-red-600 font-semibold">{txn.lateDays}d</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="table-td text-right">
                    {txn.fineApplied
                      ? <span className="text-amber-700 font-semibold">₹{txn.fineAmount}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  {can('assets:manage') && (
                    <td className="table-td">
                      {(txn.status === 'checked_out' || txn.status === 'overdue') && (
                        <button
                          onClick={() => navigate(`/assets/borrows/${txn._id}/return`)}
                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        >
                          <RotateCcw className="h-3 w-3" /> {t('Return')}
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
                  <td className="table-td font-semibold text-amber-800" colSpan={6}>{t('Total Fines')}</td>
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
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">{t('Activity')}</p>
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
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('Reminders')}</p>
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
              <p className="text-xs text-gray-400">{t('No reminders sent yet.')}</p>
            )}
          </div>

          {/* Fine summary (single item) */}
          {isSingle && (transactions[0]?.fineApplied || transactions[0]?.fineWaived || (transactions[0]?.lateDays > 0 && transactions[0]?.asset?.finePerDay > 0)) && (() => {
            const entry = transactions[0];
            const fineSettled = entry.finePaid || entry.fineWaived;
            return (
              <div className={`rounded-xl border p-4 ${entry.fineApplied && !fineSettled ? 'border-amber-200 bg-amber-50' : 'bg-white border-gray-100'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <IndianRupee className="h-4 w-4 text-gray-400" />
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('Fine')}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    entry.finePaid   ? 'bg-green-100 text-green-700' :
                    entry.fineWaived ? 'bg-gray-100 text-gray-500'  :
                    entry.fineApplied ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-600'
                  }`}>
                    {entry.finePaid ? t('Collected') : entry.fineWaived ? t('Waived') : entry.fineApplied ? t('Pending collection') : t('Pending')}
                  </span>
                </div>
                {entry.fineApplied && (
                  <p className="text-3xl font-black text-amber-700 mb-1">₹{(entry.fineAmount || 0).toLocaleString('en-IN')}</p>
                )}
                {entry.fineWaived && entry.fineWaivedReason && (
                  <p className="text-xs text-gray-500 italic mb-2">"{entry.fineWaivedReason}"</p>
                )}
                {entry.finePaid && entry.finePaidAt && (
                  <p className="text-xs text-gray-500 mb-2">
                    {t('Collected on')} {new Date(entry.finePaidAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                )}
                {!entry.fineApplied && !entry.fineWaived && entry.lateDays > 0 && entry.asset?.finePerDay > 0 && (
                  <p className="text-sm text-red-600 font-semibold">
                    {t('Est. ₹')}{(entry.lateDays * entry.asset.finePerDay).toLocaleString('en-IN')}
                    <span className="text-xs font-normal text-gray-400 ml-1">({entry.lateDays}d × ₹{entry.asset.finePerDay})</span>
                  </p>
                )}
                {can('assets:manage') && entry.fineApplied && !fineSettled && entry.status === 'returned' && (
                  <button onClick={() => setShowSettleFine(true)}
                    className="mt-3 text-xs font-semibold text-primary-600 hover:underline flex items-center gap-1">
                    <BadgeCheck className="h-3.5 w-3.5" /> {t('Settle Fine')}
                  </button>
                )}
              </div>
            );
          })()}

          {/* Damage tracking (single item, returned with damage) */}
          {isSingle && transactions[0]?.status === 'returned' &&
           (transactions[0]?.conditionAtReturn === 'damaged' || (transactions[0]?.damageStatus && transactions[0]?.damageStatus !== 'none')) && (() => {
            const entry = transactions[0];
            const DS_LABEL = { reported: 'Damage Reported', assessed: 'Being Assessed', repaired: 'Repaired' };
            const DS_COLOR = { reported: 'text-red-700 bg-red-50 border-red-200', assessed: 'text-amber-700 bg-amber-50 border-amber-200', repaired: 'text-green-700 bg-green-50 border-green-200' };
            const ds = entry.damageStatus || 'reported';
            return (
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-orange-500" />
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('Damage')}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${DS_COLOR[ds] || DS_COLOR.reported}`}>
                    {DS_LABEL[ds] || ds}
                  </span>
                </div>
                {entry.damageNotes && <p className="text-xs text-gray-600 italic mb-2">"{entry.damageNotes}"</p>}
                {can('assets:manage') && ds !== 'repaired' && (
                  <button onClick={() => setShowDamage(true)}
                    className="text-xs font-semibold text-primary-600 hover:underline flex items-center gap-1">
                    <Wrench className="h-3.5 w-3.5" /> {t('Update Assessment')}
                  </button>
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
      {showMarkLost && <MarkLostModal id={isSingle ? transactions[0]?._id : actionId} onClose={() => setShowMarkLost(false)} onSuccess={() => setShowMarkLost(false)} />}
      {showSettleFine && isSingle && <SettleFineModal txn={transactions[0]} onClose={() => setShowSettleFine(false)} onSuccess={() => setShowSettleFine(false)} />}
      {showDamage && isSingle && <DamageStatusModal txn={transactions[0]} onClose={() => setShowDamage(false)} onSuccess={() => setShowDamage(false)} />}
    </div>
  );
};

export default BorrowDetail;
