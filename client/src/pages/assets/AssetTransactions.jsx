import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import {
  Plus, ShoppingBag, RotateCcw, AlertTriangle, CalendarPlus,
  XCircle, Bell, Search, ChevronLeft, ChevronRight, MoreVertical,
  FileSpreadsheet, FileText, Download, Layers,
} from 'lucide-react';
import { getAssetTransactions, checkoutAsset, extendBorrow, cancelBorrow, sendManualReminder, bulkSendReminders } from '../../api/assetTransaction.api.js';
import { exportAssetExcel, exportAssetPDF } from '../../api/assetReport.api.js';
import { getApprovers } from '../../api/user.api.js';
import { getSettings } from '../../api/settings.api.js';
import DataTable from '../../components/ui/DataTable.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import toast from 'react-hot-toast';

const STATUS_COLORS = { approved: 'blue', checked_out: 'green', returned: 'gray', overdue: 'red', cancelled: 'gray' };
const STATUS_LABELS = { approved: 'Approved', checked_out: 'Checked Out', returned: 'Returned', overdue: 'Overdue', cancelled: 'Cancelled' };
const col = createColumnHelper();

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Checkout Modal ──────────────────────────────────────────────────────────
const CheckoutModal = ({ txn, onClose, onSuccess }) => {
  const qc = useQueryClient();
  const [condition, setCondition] = useState('good');
  const mutation = useMutation({
    mutationFn: () => checkoutAsset(txn._id, { conditionAtCheckout: condition }),
    onSuccess: () => { toast.success('Asset handed over'); qc.invalidateQueries({ queryKey: ['asset-transactions'] }); qc.invalidateQueries({ queryKey: ['asset-counts'] }); onSuccess(); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });
  return (
    <Modal open onClose={onClose} title="Hand Over Asset" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Handing <span className="font-semibold text-gray-900">{txn.asset?.name}</span> × {txn.quantityBorrowed} to{' '}
          <span className="font-semibold text-gray-900">{txn.externalBorrower?.name || txn.borrower?.name}</span>
        </p>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Condition at handover <span className="text-red-400">*</span></p>
          <div className="flex gap-2">
            {[['good','Good','border-green-400 bg-green-50 text-green-700'],['fair','Fair','border-yellow-400 bg-yellow-50 text-yellow-700'],['damaged','Damaged','border-red-400 bg-red-50 text-red-700']].map(([v,l,cls]) => (
              <button key={v} type="button" onClick={() => setCondition(v)}
                className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-all ${condition === v ? cls : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? 'Processing…' : 'Confirm Handover'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

// ── Extend Modal ────────────────────────────────────────────────────────────
const ExtendModal = ({ txn, onClose, onSuccess }) => {
  const qc = useQueryClient();
  const [newReturnDate, setNewReturnDate] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [notes, setNotes] = useState('');
  const { data: settingsRes }  = useQuery({ queryKey: ['settings'],        queryFn: getSettings });
  const { data: approversRes } = useQuery({ queryKey: ['users-approvers'], queryFn: getApprovers });
  const maxDays = settingsRes?.data?.data?.assetMaxBorrowDays || 7;
  const approvers = approversRes?.data?.data || [];
  const today = new Date().toISOString().split('T')[0];
  const maxDate = new Date(); maxDate.setDate(maxDate.getDate() + maxDays);
  const mutation = useMutation({
    mutationFn: () => extendBorrow(txn._id, { newReturnDate, approvedBy, notes: notes || undefined }),
    onSuccess: () => { toast.success('Borrow period extended'); qc.invalidateQueries({ queryKey: ['asset-transactions'] }); onSuccess(); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });
  return (
    <Modal open onClose={onClose} title="Extend Return Date">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{txn.asset?.name}</span> — {txn.externalBorrower?.name || txn.borrower?.name}
          <span className="ml-2 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded px-2 py-0.5">Current due: {fmt(txn.expectedReturnDate)}</span>
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
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !newReturnDate || !approvedBy} className="btn-primary">
            {mutation.isPending ? 'Extending…' : 'Extend Borrow'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

// ── Cancel Modal ────────────────────────────────────────────────────────────
const CancelModal = ({ txn, onClose, onSuccess }) => {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () => cancelBorrow(txn._id, { cancellationReason: reason || undefined }),
    onSuccess: () => { toast.success('Request cancelled'); qc.invalidateQueries({ queryKey: ['asset-transactions'] }); qc.invalidateQueries({ queryKey: ['asset-counts'] }); onSuccess(); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });
  return (
    <Modal open onClose={onClose} title="Cancel Borrow Request" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Cancel <span className="font-semibold text-gray-900">{txn.asset?.name}</span> for <span className="font-semibold text-gray-900">{txn.externalBorrower?.name || txn.borrower?.name}</span>?
        </p>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Reason (optional)</p>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className="input" placeholder="e.g. Staff no longer needs it" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary">Keep</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="btn-danger">
            {mutation.isPending ? 'Cancelling…' : 'Yes, Cancel'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

// ── More Actions Dropdown ───────────────────────────────────────────────────
const MoreMenu = ({ txn, onExtend, onCancel, onReminder, reminderPending }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { status } = txn;
  const isActive = !['returned', 'cancelled'].includes(status);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!isActive) return null;

  return (
    <div ref={ref} className="relative">
      <button onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-40">
          <button onClick={(e) => { e.stopPropagation(); setOpen(false); onExtend(txn); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <CalendarPlus className="h-3.5 w-3.5 text-purple-500" /> Extend
          </button>
          <button onClick={(e) => { e.stopPropagation(); setOpen(false); onReminder(txn._id); }} disabled={reminderPending}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <Bell className="h-3.5 w-3.5 text-orange-500" /> Send Reminder
          </button>
          {status === 'approved' && (
            <>
              <div className="my-1 border-t border-gray-100" />
              <button onClick={(e) => { e.stopPropagation(); setOpen(false); onCancel(txn); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                <XCircle className="h-3.5 w-3.5" /> Cancel Request
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ── Export Dropdown ─────────────────────────────────────────────────────────
const ExportMenu = ({ statusFilter, searchInput }) => {
  const [open, setOpen]   = useState(false);
  const [loading, setLoading] = useState(null); // 'excel' | 'pdf'
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const params = {
    ...(statusFilter  ? { status: statusFilter }   : {}),
    ...(searchInput   ? { search: searchInput }     : {}),
  };

  const doExport = async (format) => {
    setLoading(format);
    setOpen(false);
    try {
      if (format === 'excel') {
        const res = await exportAssetExcel(params);
        downloadBlob(res.data, `borrows-${new Date().toISOString().split('T')[0]}.xlsx`);
      } else {
        const res = await exportAssetPDF(params);
        downloadBlob(res.data, `borrows-${new Date().toISOString().split('T')[0]}.pdf`);
      }
    } catch { toast.error('Export failed'); }
    finally { setLoading(null); }
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} disabled={!!loading}
        className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50">
        {loading ? <div className="h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                 : <Download className="h-4 w-4" />}
        Export
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-36">
          <button onClick={() => doExport('excel')}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <FileSpreadsheet className="h-4 w-4 text-green-600" /> Excel (.xlsx)
          </button>
          <button onClick={() => doExport('pdf')}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <FileText className="h-4 w-4 text-red-500" /> PDF
          </button>
        </div>
      )}
    </div>
  );
};

// ── Main List ───────────────────────────────────────────────────────────────
const AssetTransactions = () => {
  const { can }  = usePermissions();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [searchInput,  setSearchInput]  = useState('');
  const [page,         setPage]         = useState(1);
  const [checkoutTarget, setCheckoutTarget] = useState(null);
  const [extendTarget,   setExtendTarget]   = useState(null);
  const [cancelTarget,   setCancelTarget]   = useState(null);

  const debouncedSearch = useDebounce(searchInput, 400);

  // Keep status in sync when navigated from Dashboard
  useEffect(() => {
    const s = searchParams.get('status') || '';
    setStatusFilter(s);
    setPage(1);
  }, [searchParams]);

  const { data, isLoading } = useQuery({
    queryKey: ['asset-transactions', statusFilter, debouncedSearch, page],
    queryFn: () => getAssetTransactions({
      ...(statusFilter    ? { status: statusFilter }    : {}),
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      page, limit: 20,
    }),
    keepPreviousData: true,
  });

  const reminderMut = useMutation({
    mutationFn: (id) => sendManualReminder(id),
    onSuccess: () => toast.success('Reminder sent'),
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const bulkMut = useMutation({
    mutationFn: bulkSendReminders,
    onSuccess: (res) => {
      const { sent, total } = res.data?.data || {};
      toast.success(`Reminders sent to ${sent} of ${total} overdue borrower(s)`);
      qc.invalidateQueries({ queryKey: ['asset-transactions'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const setFilter = (val) => {
    setPage(1);
    if (val) setSearchParams({ status: val });
    else     setSearchParams({});
  };
  const setSearch = (val) => { setSearchInput(val); setPage(1); };

  const result = data?.data?.data;
  const txns   = result?.data  || [];
  const total  = result?.total || 0;
  const pages  = result?.pages || 1;

  const columns = [
    col.accessor('transactionNumber', {
      header: 'Ref No.', size: 175,
      cell: (i) => {
        const row = i.row.original;
        const grp = row.group;
        const isSubItem = i.getValue()?.includes('/');
        return (
          <div>
            <span className="font-mono text-xs font-bold text-primary-600">{i.getValue() || '—'}</span>
            {grp && isSubItem && (
              <button
                onClick={(e) => { e.stopPropagation(); navigate(`/assets/borrows/groups/${grp._id}`); }}
                className="mt-0.5 flex items-center gap-1 text-xs text-purple-600 hover:underline"
              >
                <Layers className="h-3 w-3" /> View group
              </button>
            )}
          </div>
        );
      },
    }),
    col.display({
      id: 'borrower', header: 'Borrower',
      cell: ({ row }) => {
        const { borrower, externalBorrower, borrowerType, group, transactionNumber } = row.original;
        const isSubItem  = transactionNumber?.includes('/');
        const isExternal = borrowerType === 'external';
        const name       = isExternal ? externalBorrower?.name : borrower?.name;
        return (
          <div>
            {isExternal ? (
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-gray-900">{name}</span>
                <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-1.5 py-0.5 leading-none">External</span>
              </div>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); navigate(`/assets/borrowers/${borrower?._id}?name=${encodeURIComponent(name || '')}`); }}
                className="font-medium text-gray-900 hover:text-primary-600 hover:underline text-left"
              >
                {name}
              </button>
            )}
            {group && isSubItem && (
              <p className="text-xs text-purple-600 font-mono mt-0.5">{group.groupNumber} · multi-item</p>
            )}
          </div>
        );
      },
    }),
    col.accessor('asset.name', {
      header: 'Asset',
      cell: (i) => <span className="text-gray-700">{i.getValue()}</span>,
    }),
    col.accessor('expectedReturnDate', {
      header: 'Return By', size: 115,
      cell: (i) => {
        const isOverdue = i.row.original.status === 'overdue';
        return (
          <span className={`text-sm flex items-center gap-1 ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
            {isOverdue && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
            {fmt(i.getValue())}
          </span>
        );
      },
    }),
    col.accessor('status', {
      header: 'Status', size: 120,
      cell: (i) => <Badge variant={STATUS_COLORS[i.getValue()]}>{STATUS_LABELS[i.getValue()]}</Badge>,
    }),
    col.display({
      id: 'actions', header: '', size: 160,
      cell: ({ row }) => {
        const { status, _id } = row.original;
        const isActive = !['returned', 'cancelled'].includes(status);
        return (
          // stopPropagation so action clicks don't trigger row navigation
          <div className="flex items-center gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
            {can('assets:manage') && status === 'approved' && (
              <button onClick={() => setCheckoutTarget(row.original)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors">
                <ShoppingBag className="h-3.5 w-3.5" /> Hand Over
              </button>
            )}
            {can('assets:manage') && (status === 'checked_out' || status === 'overdue') && (
              <button onClick={() => navigate(`/assets/borrows/${_id}/return`)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                <RotateCcw className="h-3.5 w-3.5" /> Return
              </button>
            )}
            {can('assets:manage') && isActive && (
              <MoreMenu
                txn={row.original}
                onExtend={setExtendTarget}
                onCancel={setCancelTarget}
                onReminder={(id) => reminderMut.mutate(id)}
                reminderPending={reminderMut.isPending}
              />
            )}
          </div>
        );
      },
    }),
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Borrow Requests"
        subtitle="Track asset borrowing and returns"
        breadcrumbs={[{ label: 'Assets' }, { label: 'Borrow Requests' }]}
        actions={
          <div className="flex gap-2 flex-wrap">
            {can('assets:manage') && statusFilter === 'overdue' && total > 0 && (
              <button onClick={() => bulkMut.mutate()} disabled={bulkMut.isPending}
                className="btn-danger flex items-center gap-2 text-sm">
                <Bell className="h-4 w-4" />
                {bulkMut.isPending ? 'Sending…' : `Remind All (${total})`}
              </button>
            )}
            <ExportMenu statusFilter={statusFilter} searchInput={debouncedSearch} />
            {can('assets:manage') && (
              <Link to="/assets/borrows/new" className="btn-primary"><Plus className="h-4 w-4" /> New Request</Link>
            )}
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" value={searchInput} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search borrower, asset or ref no…" className="input pl-9 text-sm" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[['', 'All'], ['approved', 'Approved'], ['checked_out', 'Checked Out'], ['overdue', 'Overdue'], ['returned', 'Returned'], ['cancelled', 'Cancelled']].map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${statusFilter === val ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={txns}
        loading={isLoading}
        onRowClick={(row) => row.group ? navigate(`/assets/borrows/groups/${row.group._id}`) : navigate(`/assets/borrows/${row._id}`)}
      />

      {pages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-gray-500">{total} result{total !== 1 ? 's' : ''} · Page {page} of {pages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary p-1.5 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages} className="btn-secondary p-1.5 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {checkoutTarget && <CheckoutModal txn={checkoutTarget} onClose={() => setCheckoutTarget(null)} onSuccess={() => setCheckoutTarget(null)} />}
      {extendTarget   && <ExtendModal   txn={extendTarget}   onClose={() => setExtendTarget(null)}   onSuccess={() => setExtendTarget(null)} />}
      {cancelTarget   && <CancelModal   txn={cancelTarget}   onClose={() => setCancelTarget(null)}   onSuccess={() => setCancelTarget(null)} />}
    </div>
  );
};

export default AssetTransactions;
