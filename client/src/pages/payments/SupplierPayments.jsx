import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, CheckCircle2, XCircle, Eye, Download, FileDown, Ban } from 'lucide-react';
import {
  getPayments, approvePayment, rejectPayment,
  bulkApprovePayments, exportPayments, voidPayment,
} from '../../api/supplierPayment.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import toast from 'react-hot-toast';

const fmt    = (d)  => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtAmt = (n)  => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const STATUS_COLORS = { pending_approval: 'yellow', approved: 'green', rejected: 'red', voided: 'gray' };
const STATUS_LABELS = { pending_approval: 'Pending', approved: 'Approved', rejected: 'Rejected', voided: 'Voided' };
const PM_LABELS     = { cash: 'Cash', upi: 'UPI', neft: 'NEFT', rtgs: 'RTGS', cheque: 'Cheque' };

const FILTER_TABS = [
  { label: 'All',      value: '' },
  { label: 'Pending',  value: 'pending_approval' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
];

export default function SupplierPayments() {
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { can, user } = usePermissions();

  const [statusFilter, setStatusFilter] = useState('');

  // Approve modal — { id, paymentNumber } for single | null when closed
  const [approveModal, setApproveModal] = useState(null);
  const [approvalNote, setApprovalNote] = useState('');

  // Reject modal
  const [rejectModal,  setRejectModal]  = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  // Bulk selection (only pending payments)
  const [selected, setSelected] = useState(new Set());

  // Bulk approve modal
  const [bulkModal,     setBulkModal]     = useState(false);
  const [bulkNote,      setBulkNote]      = useState('');

  // Void modal
  const [voidModal,  setVoidModal]  = useState(null); // { id, paymentNumber }
  const [voidReason, setVoidReason] = useState('');

  // Export modal
  const [exportModal, setExportModal] = useState(false);
  const [exportFrom,  setExportFrom]  = useState('');
  const [exportTo,    setExportTo]    = useState('');
  const [exporting,   setExporting]   = useState(false);

  const params = { status: statusFilter || undefined };
  const { data, isLoading } = useQuery({
    queryKey: ['payments', params],
    queryFn:  () => getPayments(params),
  });
  const payments     = data?.data?.data?.data  || [];
  const pendingCount = data?.data?.data?.pendingCount || 0;

  const pendingPayments = payments.filter((p) => p.status === 'pending_approval');

  const canApprove = can('payments:approve') && user?.canApprovePayments;

  // ── Mutations ──────────────────────────────────────────────────────────────

  const approveMut = useMutation({
    mutationFn: ({ id, note }) => approvePayment(id, note ? { approvalNote: note } : undefined),
    onSuccess: () => {
      toast.success('Payment approved');
      qc.invalidateQueries({ queryKey: ['payments'] });
      setApproveModal(null);
      setApprovalNote('');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to approve'),
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }) => rejectPayment(id, { rejectionReason: reason }),
    onSuccess: () => {
      toast.success('Payment rejected');
      qc.invalidateQueries({ queryKey: ['payments'] });
      setRejectModal(null);
      setRejectReason('');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to reject'),
  });

  const voidMut = useMutation({
    mutationFn: ({ id, reason }) => voidPayment(id, { voidReason: reason }),
    onSuccess: () => {
      toast.success('Payment voided');
      qc.invalidateQueries({ queryKey: ['payments'] });
      setVoidModal(null);
      setVoidReason('');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to void'),
  });

  const bulkMut = useMutation({
    mutationFn: ({ ids, note }) => bulkApprovePayments({ ids, approvalNote: note || undefined }),
    onSuccess: (res) => {
      const count = res?.data?.data?.approved || selected.size;
      toast.success(`${count} payment(s) approved`);
      qc.invalidateQueries({ queryKey: ['payments'] });
      setSelected(new Set());
      setBulkModal(false);
      setBulkNote('');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Bulk approval failed'),
  });

  // ── Selection helpers ──────────────────────────────────────────────────────

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const allPendingSelected = pendingPayments.length > 0 && pendingPayments.every((p) => selected.has(p._id));

  const toggleAll = () => {
    if (allPendingSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendingPayments.map((p) => p._id)));
    }
  };

  const handleTabChange = (val) => {
    setStatusFilter(val);
    setSelected(new Set());
  };

  // ── Export ─────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportPayments({
        from:   exportFrom || undefined,
        to:     exportTo   || undefined,
        status: statusFilter || undefined,
      });
      const url = URL.createObjectURL(res.data);
      const a   = document.createElement('a');
      const from = exportFrom ? exportFrom : 'all';
      a.href = url;
      a.download = `payments-${from}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setExportModal(false);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <PageHeader
        title="Supplier Payments"
        subtitle={pendingCount > 0 ? `${pendingCount} payment${pendingCount > 1 ? 's' : ''} awaiting approval` : 'Payment vouchers and approvals'}
        breadcrumbs={[{ label: 'Payments' }]}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExportModal(true)}
              className="btn-secondary flex items-center gap-2 text-sm">
              <FileDown className="h-4 w-4" /> Export
            </button>
            {can('payments:write') && (
              <button onClick={() => navigate('/payments/new')} className="btn-primary flex items-center gap-2 text-sm">
                <Plus className="h-4 w-4" /> Record Payment
              </button>
            )}
          </div>
        }
      />

      {/* Filter tabs + bulk action bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-1 bg-white rounded-xl border border-gray-100 p-1 w-fit">
          {FILTER_TABS.map((f) => (
            <button key={f.value} onClick={() => handleTabChange(f.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === f.value ? 'bg-primary-50 text-primary-700' : 'text-gray-500 hover:text-gray-700'}`}>
              {f.label}
              {f.value === 'pending_approval' && pendingCount > 0 && (
                <span className="ml-1.5 bg-yellow-100 text-yellow-700 rounded-full px-1.5 py-0.5 text-xs">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>

        {canApprove && selected.size > 0 && (
          <button
            onClick={() => { setBulkNote(''); setBulkModal(true); }}
            className="btn-primary flex items-center gap-2 text-sm bg-green-600 hover:bg-green-700">
            <CheckCircle2 className="h-4 w-4" />
            Approve {selected.size} Selected
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : payments.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No payments found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50">
                  {canApprove && (
                    <th className="table-th w-10">
                      {pendingPayments.length > 0 && (
                        <input
                          type="checkbox"
                          checked={allPendingSelected}
                          onChange={toggleAll}
                          className="rounded border-gray-300 text-primary-600"
                          title="Select all pending"
                        />
                      )}
                    </th>
                  )}
                  {['Voucher No.', 'Supplier', 'Date', 'Mode', 'Amount', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payments.map((p) => {
                  const isPending = p.status === 'pending_approval';
                  const isSelected = selected.has(p._id);
                  return (
                    <tr key={p._id} className={`hover:bg-gray-50 ${isSelected ? 'bg-green-50' : ''}`}>
                      {canApprove && (
                        <td className="table-td w-10">
                          {isPending && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleOne(p._id)}
                              className="rounded border-gray-300 text-primary-600"
                            />
                          )}
                        </td>
                      )}
                      <td className="table-td">
                        <Link to={`/payments/${p._id}`} className="font-mono text-xs text-primary-600 hover:underline">
                          {p.paymentNumber}
                        </Link>
                      </td>
                      <td className="table-td font-medium text-gray-900">
                        <Link to={`/masters/suppliers/${p.supplier?._id}`} className="hover:text-primary-600 transition-colors">
                          {p.supplier?.name || '—'}
                        </Link>
                      </td>
                      <td className="table-td text-sm text-gray-500">{fmt(p.paymentDate)}</td>
                      <td className="table-td text-sm">{PM_LABELS[p.paymentMode] || p.paymentMode}</td>
                      <td className="table-td text-right font-semibold">{fmtAmt(p.totalAmount)}</td>
                      <td className="table-td">
                        <Badge variant={STATUS_COLORS[p.status]}>{STATUS_LABELS[p.status]}</Badge>
                      </td>
                      <td className="table-td">
                        <div className="flex items-center gap-1">
                          <button onClick={() => navigate(`/payments/${p._id}`)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="View">
                            <Eye className="h-4 w-4" />
                          </button>
                          {canApprove && isPending && (
                            <>
                              <button
                                onClick={() => { setApprovalNote(''); setApproveModal({ id: p._id, paymentNumber: p.paymentNumber }); }}
                                className="p-1.5 rounded-lg hover:bg-green-50 text-green-600" title="Approve">
                                <CheckCircle2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => { setRejectReason(''); setRejectModal({ id: p._id, paymentNumber: p.paymentNumber }); }}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" title="Reject">
                                <XCircle className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          {canApprove && p.status === 'approved' && (
                            <button
                              onClick={() => { setVoidReason(''); setVoidModal({ id: p._id, paymentNumber: p.paymentNumber }); }}
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-red-500" title="Void">
                              <Ban className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Approve modal (single) ── */}
      <Modal open={!!approveModal} onClose={() => setApproveModal(null)} title="Approve Payment" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Approve <strong>{approveModal?.paymentNumber}</strong>?
          </p>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Approval Note <span className="normal-case font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              value={approvalNote}
              onChange={(e) => setApprovalNote(e.target.value)}
              rows={2}
              className="input"
              placeholder="e.g. Cross-checked with bank statement…"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setApproveModal(null)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => approveMut.mutate({ id: approveModal.id, note: approvalNote })}
              disabled={approveMut.isPending}
              className="btn-primary flex items-center gap-2 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50">
              <CheckCircle2 className="h-4 w-4" />
              {approveMut.isPending ? 'Approving…' : 'Approve'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Reject modal ── */}
      <Modal open={!!rejectModal} onClose={() => setRejectModal(null)} title="Reject Payment" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Reject <strong>{rejectModal?.paymentNumber}</strong>?</p>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Reason *</label>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              rows={3} className="input" placeholder="e.g. Invoice mismatch, duplicate entry…" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setRejectModal(null)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => rejectMut.mutate({ id: rejectModal.id, reason: rejectReason })}
              disabled={!rejectReason.trim() || rejectMut.isPending}
              className="btn-danger">
              {rejectMut.isPending ? 'Rejecting…' : 'Reject'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Bulk approve modal ── */}
      <Modal open={bulkModal} onClose={() => setBulkModal(false)} title="Bulk Approve Payments" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Approve <strong>{selected.size} payment{selected.size !== 1 ? 's' : ''}</strong>?
          </p>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Shared Note <span className="normal-case font-normal text-gray-400">(optional — applies to all)</span>
            </label>
            <textarea
              value={bulkNote}
              onChange={(e) => setBulkNote(e.target.value)}
              rows={2}
              className="input"
              placeholder="e.g. Verified against March bank statement…"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setBulkModal(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => bulkMut.mutate({ ids: [...selected], note: bulkNote })}
              disabled={bulkMut.isPending}
              className="btn-primary flex items-center gap-2 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50">
              <CheckCircle2 className="h-4 w-4" />
              {bulkMut.isPending ? 'Approving…' : `Approve ${selected.size}`}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Void modal ── */}
      <Modal open={!!voidModal} onClose={() => setVoidModal(null)} title="Void Payment" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Void <strong>{voidModal?.paymentNumber}</strong>? This will remove it from the supplier ledger and outstanding balance.
          </p>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Reason *</label>
            <textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)}
              rows={3} className="input" placeholder="e.g. Entered in error, duplicate payment…" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setVoidModal(null)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => voidMut.mutate({ id: voidModal.id, reason: voidReason })}
              disabled={!voidReason.trim() || voidMut.isPending}
              className="btn-danger flex items-center gap-2 text-sm">
              <Ban className="h-4 w-4" />
              {voidMut.isPending ? 'Voiding…' : 'Void Payment'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Export modal ── */}
      <Modal open={exportModal} onClose={() => setExportModal(false)} title="Export Payments" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Leave dates blank to export all records.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">From</label>
              <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} className="input" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">To</label>
              <input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} className="input" />
            </div>
          </div>
          {statusFilter && (
            <p className="text-xs text-gray-400">
              Active filter <strong className="text-gray-600">{STATUS_LABELS[statusFilter] || statusFilter}</strong> will be applied to the export.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => setExportModal(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50">
              <Download className="h-4 w-4" />
              {exporting ? 'Generating…' : 'Download Excel'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
