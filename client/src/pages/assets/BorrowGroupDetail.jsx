import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import {
  ArrowLeft, ShoppingBag, RotateCcw, CalendarPlus, XCircle,
  Bell, AlertTriangle, Package, CheckCircle2, Clock, Layers,
  Phone, MapPin, CreditCard, Users,
} from 'lucide-react';
import { getBorrowGroup, checkoutGroup, extendGroup, cancelGroup } from '../../api/borrowGroup.api.js';
import { sendManualReminder } from '../../api/assetTransaction.api.js';
import { getApprovers } from '../../api/user.api.js';
import { getSettings } from '../../api/settings.api.js';
import DataTable from '../../components/ui/DataTable.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import toast from 'react-hot-toast';

const STATUS_COLORS = { approved: 'blue', checked_out: 'green', partially_returned: 'yellow', returned: 'gray', overdue: 'red', cancelled: 'gray' };
const STATUS_LABELS = { approved: 'Approved', checked_out: 'Checked Out', partially_returned: 'Partially Returned', returned: 'Returned', overdue: 'Overdue', cancelled: 'Cancelled' };
const CONDITION_STYLE = { good: 'bg-green-100 text-green-700', fair: 'bg-yellow-100 text-yellow-700', damaged: 'bg-red-100 text-red-700' };
const col = createColumnHelper();

const fmt     = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtTime = (d) => d ? new Date(d).toLocaleString('en-IN',   { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

// ── Checkout All Modal ────────────────────────────────────────────────────────
const CheckoutModal = ({ groupId, onClose, onSuccess }) => {
  const qc = useQueryClient();
  const [condition, setCondition] = useState('good');
  const mut = useMutation({
    mutationFn: () => checkoutGroup(groupId, { conditionAtCheckout: condition }),
    onSuccess: () => { toast.success('All items handed over'); qc.invalidateQueries({ queryKey: ['borrow-group', groupId] }); qc.invalidateQueries({ queryKey: ['asset-transactions'] }); onSuccess(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });
  return (
    <Modal open onClose={onClose} title="Hand Over All Items" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">All approved items in this group will be handed over.</p>
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

// ── Extend Modal ──────────────────────────────────────────────────────────────
const ExtendModal = ({ groupId, currentDue, onClose, onSuccess }) => {
  const qc = useQueryClient();
  const [newReturnDate, setNewReturnDate] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [notes, setNotes] = useState('');
  const { data: sRes } = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const { data: aRes } = useQuery({ queryKey: ['users-approvers'], queryFn: getApprovers });
  const maxDays   = sRes?.data?.data?.assetMaxBorrowDays || 7;
  const approvers = aRes?.data?.data || [];
  const today     = new Date().toISOString().split('T')[0];
  const maxDate   = new Date(); maxDate.setDate(maxDate.getDate() + maxDays);
  const mut = useMutation({
    mutationFn: () => extendGroup(groupId, { newReturnDate, approvedBy, notes: notes || undefined }),
    onSuccess: () => { toast.success('Group extended'); qc.invalidateQueries({ queryKey: ['borrow-group', groupId] }); onSuccess(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });
  return (
    <Modal open onClose={onClose} title="Extend Return Date (All Items)">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          All active items will get the new return date.
          <span className="ml-2 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded px-2 py-0.5">Current due: {fmt(currentDue)}</span>
        </p>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">New Return Date <span className="text-red-400">*</span></p>
          <input type="date" min={today} max={maxDate.toISOString().split('T')[0]} value={newReturnDate} onChange={(e) => setNewReturnDate(e.target.value)} className="input" />
          <p className="mt-1 text-xs text-gray-400">Max {maxDays} days from today</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Approved By <span className="text-red-400">*</span></p>
          <select value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} className="input">
            <option value="">— Select trustee —</option>
            {approvers.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Reason</p>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="input" placeholder="Optional" />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending || !newReturnDate || !approvedBy} className="btn-primary">{mut.isPending ? 'Extending…' : 'Extend All'}</button>
        </div>
      </div>
    </Modal>
  );
};

// ── Cancel Modal ──────────────────────────────────────────────────────────────
const CancelModal = ({ groupId, onClose, onSuccess }) => {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const mut = useMutation({
    mutationFn: () => cancelGroup(groupId, { cancellationReason: reason || undefined }),
    onSuccess: () => { toast.success('Group cancelled'); qc.invalidateQueries({ queryKey: ['borrow-group', groupId] }); qc.invalidateQueries({ queryKey: ['asset-transactions'] }); onSuccess(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });
  return (
    <Modal open onClose={onClose} title="Cancel Borrow Group" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">All approved items in this group will be cancelled. Items already checked out must be returned individually.</p>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Reason (optional)</p>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className="input" placeholder="e.g. Event cancelled" />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Keep</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending} className="btn-danger">{mut.isPending ? 'Cancelling…' : 'Yes, Cancel'}</button>
        </div>
      </div>
    </Modal>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
const BorrowGroupDetail = () => {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { can }  = usePermissions();
  const qc       = useQueryClient();

  const [showCheckout, setShowCheckout] = useState(false);
  const [showExtend,   setShowExtend]   = useState(false);
  const [showCancel,   setShowCancel]   = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['borrow-group', id],
    queryFn: () => getBorrowGroup(id),
  });

  const reminderMut = useMutation({
    mutationFn: (txnId) => sendManualReminder(txnId),
    onSuccess: () => toast.success('Reminder sent'),
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  if (isLoading) return <PageLoader />;

  const result = data?.data?.data;
  if (!result) return <div className="text-gray-400 p-4">Group not found.</div>;

  const { group, transactions = [] } = result;
  const { status, groupNumber, borrowerType, borrower, externalBorrower, approvedBy, expectedReturnDate, extensions = [], remindersSent = [], notes, createdBy, createdAt, cancellationReason } = group;
  const isExternal    = borrowerType === 'external';
  const borrowerName  = isExternal ? externalBorrower?.name : borrower?.name;

  const isActive       = !['returned', 'cancelled'].includes(status);
  const hasApproved    = transactions.some((t) => t.status === 'approved');
  const totalItems     = transactions.length;
  const returnedItems  = transactions.filter((t) => t.status === 'returned').length;
  const ss             = STATUS_COLORS[status] || 'gray';

  const columns = [
    col.accessor('asset.name', {
      header: 'Asset',
      cell: (i) => (
        <button onClick={() => navigate(`/assets/${i.row.original.asset?._id}/history`)}
          className="font-medium text-gray-900 hover:text-primary-600 hover:underline text-left">
          {i.getValue()}
        </button>
      ),
    }),
    col.accessor('asset.category', { header: 'Category', size: 110, cell: (i) => <span className="text-gray-500 text-sm">{i.getValue()}</span> }),
    col.accessor('quantityBorrowed', { header: 'Qty', size: 55, cell: (i) => <span className="font-semibold">{i.getValue()}</span> }),
    col.accessor('status', {
      header: 'Status', size: 120,
      cell: (i) => <Badge variant={STATUS_COLORS[i.getValue()] || 'gray'}>{STATUS_LABELS[i.getValue()] || i.getValue()}</Badge>,
    }),
    col.accessor('conditionAtCheckout', {
      header: 'Condition Out', size: 110,
      cell: (i) => {
        const v = i.getValue();
        if (!v) return <span className="text-gray-400">—</span>;
        return <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${CONDITION_STYLE[v]}`}>{v}</span>;
      },
    }),
    col.accessor('conditionAtReturn', {
      header: 'Condition In', size: 110,
      cell: (i) => {
        const v = i.getValue();
        if (!v) return <span className="text-gray-400">—</span>;
        return <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${CONDITION_STYLE[v]}`}>{v}</span>;
      },
    }),
    col.accessor('lateDays', {
      header: 'Late', size: 70,
      cell: (i) => i.getValue() > 0 ? <span className="text-red-600 font-semibold text-sm">{i.getValue()}d</span> : <span className="text-gray-400">—</span>,
    }),
    col.accessor('fineAmount', {
      header: 'Fine', size: 80,
      cell: (i) => i.row.original.fineApplied ? <span className="text-amber-700 font-semibold">₹{i.getValue()}</span> : <span className="text-gray-400">—</span>,
    }),
    col.display({
      id: 'actions', header: '', size: 120,
      cell: ({ row }) => {
        const { status: s, _id } = row.original;
        if (!can('assets:manage')) return null;
        return (
          <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
            {s === 'checked_out' || s === 'overdue' ? (
              <button onClick={() => navigate(`/assets/borrows/${_id}/return`)}
                className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">
                <RotateCcw className="h-3 w-3" /> Return
              </button>
            ) : null}
          </div>
        );
      },
    }),
  ];

  return (
    <div className="max-w-5xl space-y-4">
      <button onClick={() => navigate('/assets/borrows')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Borrow Requests
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-${ss}-100 text-${ss}-700`}>
              <span className={`h-1.5 w-1.5 rounded-full bg-${ss}-500`} />
              {STATUS_LABELS[status]}
            </span>
            <span className="font-mono text-xs text-gray-400">{groupNumber}</span>
            <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
              <Layers className="h-3 w-3 inline mr-1" />{totalItems} item{totalItems > 1 ? 's' : ''}
              {returnedItems > 0 && returnedItems < totalItems && ` · ${returnedItems} returned`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">{borrowerName}</h1>
            {isExternal && (
              <span className="text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 leading-none flex items-center gap-1">
                <Users className="h-3 w-3" /> External
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400 mt-0.5">
            Approved by {approvedBy?.name} · Due {fmt(expectedReturnDate)}
            {notes && <> · <span className="italic">"{notes}"</span></>}
          </p>
        </div>
      </div>

      {/* Stats strip */}
      <div className="bg-white rounded-xl border border-gray-100 grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-100 overflow-hidden">
        {[
          { label: 'Total Items',     value: totalItems,                                             color: 'text-gray-700' },
          { label: 'Pending Return',  value: transactions.filter((t) => t.status === 'checked_out' || t.status === 'overdue').length, color: 'text-blue-600' },
          { label: 'Overdue Items',   value: transactions.filter((t) => t.status === 'overdue').length, color: 'text-red-600' },
          { label: 'Returned Items',  value: returnedItems,                                           color: 'text-green-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="px-4 py-3 text-center">
            <p className={`text-2xl font-black ${color}`}>{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* External borrower info card */}
      {isExternal && externalBorrower && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
          <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> External Borrower Details
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="flex items-start gap-2">
              <Phone className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-amber-700 font-medium">Phone</p>
                <p className="text-gray-800">{externalBorrower.phone}</p>
              </div>
            </div>
            {externalBorrower.address && (
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-amber-700 font-medium">Address</p>
                  <p className="text-gray-800">{externalBorrower.address}</p>
                </div>
              </div>
            )}
            {externalBorrower.idProofType && (
              <div className="flex items-start gap-2">
                <CreditCard className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-amber-700 font-medium capitalize">{externalBorrower.idProofType.replace(/_/g, ' ')}</p>
                  <p className="text-gray-800 font-mono">{externalBorrower.idProofNumber || '—'}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action bar */}
      {can('assets:manage') && isActive && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex flex-wrap gap-2">
          {hasApproved && (
            <button onClick={() => setShowCheckout(true)} className="btn-primary flex items-center gap-2 text-sm">
              <ShoppingBag className="h-4 w-4" /> Hand Over All
            </button>
          )}
          <button onClick={() => setShowExtend(true)} className="btn-secondary flex items-center gap-2 text-sm">
            <CalendarPlus className="h-4 w-4" /> Extend All
          </button>
          {hasApproved && (
            <button onClick={() => setShowCancel(true)} className="btn-danger flex items-center gap-2 text-sm ml-auto">
              <XCircle className="h-4 w-4" /> Cancel Group
            </button>
          )}
        </div>
      )}

      {/* Items table */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Items</p>
        <DataTable
          columns={columns}
          data={transactions}
          onRowClick={(row) => navigate(`/assets/borrows/${row._id}`)}
        />
      </div>

      {/* Extensions */}
      {extensions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Extensions ({extensions.length})</p>
          <div className="space-y-2">
            {extensions.map((ext, i) => (
              <div key={ext._id || i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="text-sm">
                  <span className="line-through text-gray-400">{fmt(ext.previousReturnDate)}</span>
                  <span className="mx-2 text-gray-400">→</span>
                  <span className="font-semibold text-green-700">{fmt(ext.newReturnDate)}</span>
                  {ext.approvedBy?.name && <span className="ml-2 text-xs text-gray-400">· {ext.approvedBy.name}</span>}
                  {ext.notes && <span className="ml-2 text-xs text-gray-500 italic">"{ext.notes}"</span>}
                </div>
                <span className="text-xs text-gray-400 shrink-0 ml-2">{fmtTime(ext.approvedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cancellation reason */}
      {status === 'cancelled' && cancellationReason && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700"><span className="font-semibold">Cancelled:</span> {cancellationReason}</p>
        </div>
      )}

      {showCheckout && <CheckoutModal groupId={id} onClose={() => setShowCheckout(false)} onSuccess={() => setShowCheckout(false)} />}
      {showExtend   && <ExtendModal   groupId={id} currentDue={expectedReturnDate} onClose={() => setShowExtend(false)} onSuccess={() => setShowExtend(false)} />}
      {showCancel   && <CancelModal   groupId={id} onClose={() => setShowCancel(false)} onSuccess={() => { setShowCancel(false); navigate('/assets/borrows'); }} />}
    </div>
  );
};

export default BorrowGroupDetail;
