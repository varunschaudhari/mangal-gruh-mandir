import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, CheckCircle2, XCircle, Eye, Download, FileDown, Ban, CreditCard } from 'lucide-react';
import {
  getPayments, approvePayment, rejectPayment,
  bulkApprovePayments, exportPayments, voidPayment,
} from '../../api/supplierPayment.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import StickyActionBar from '../../components/ui/StickyActionBar.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import { useIsMobile } from '../../hooks/useMediaQuery.js';
import toast from 'react-hot-toast';
import { saveFile } from '../../utils/fileSaver.js';
import haptics from '../../utils/haptics.js';
import { useT, rich } from '../../i18n/index.jsx';

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

// Phone layout: one card per voucher, amount + status up top, Approve / Reject in thumb reach.
function PaymentCard({ p, showCheckbox, isSelected, onToggle, showApprove, onApprove, onReject, onOpen }) {
  const t = useT();
  return (
    <div
      onClick={onOpen}
      className={`card cursor-pointer p-3.5 active:bg-gray-50 ${isSelected ? 'border-green-300 bg-green-50' : ''}`}
    >
      <div className="flex items-start gap-3">
        {showCheckbox && (
          <label onClick={(e) => e.stopPropagation()} className="-m-2 shrink-0 p-2">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggle}
              className="h-5 w-5 rounded border-gray-300 text-green-600"
              aria-label={t('Select {number}', { number: p.paymentNumber })}
            />
          </label>
        )}
        <div className="min-w-0 flex-1">
          <p className="break-words text-[15px] font-medium text-gray-900">{p.supplier?.name || '—'}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            <span className="font-mono">{p.paymentNumber}</span>
            {' · '}{fmt(p.paymentDate)}
            {' · '}{t(PM_LABELS[p.paymentMode]) || p.paymentMode}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-bold text-gray-900">{fmtAmt(p.totalAmount)}</p>
          <Badge variant={STATUS_COLORS[p.status]} className="mt-1">{t(STATUS_LABELS[p.status])}</Badge>
        </div>
      </div>
      {showApprove && (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3" onClick={(e) => e.stopPropagation()}>
          <button onClick={onReject} className="btn-secondary border-red-200 text-red-600">
            <XCircle className="h-4 w-4" /> {t('Reject')}
          </button>
          <button onClick={onApprove} className="btn-primary bg-green-600 hover:bg-green-700">
            <CheckCircle2 className="h-4 w-4" /> {t('Approve')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function SupplierPayments() {
  const t        = useT();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { can, user } = usePermissions();
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();

  // Dashboard tiles deep-link here with ?status=pending_approval
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');

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
      haptics.success();
      toast.success(t('Payment approved'));
      qc.invalidateQueries({ queryKey: ['payments'] });
      setApproveModal(null);
      setApprovalNote('');
    },
    onError: (e) => toast.error(e.response?.data?.message || t('Failed to approve')),
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }) => rejectPayment(id, { rejectionReason: reason }),
    onSuccess: () => {
      toast.success(t('Payment rejected'));
      qc.invalidateQueries({ queryKey: ['payments'] });
      setRejectModal(null);
      setRejectReason('');
    },
    onError: (e) => toast.error(e.response?.data?.message || t('Failed to reject')),
  });

  const voidMut = useMutation({
    mutationFn: ({ id, reason }) => voidPayment(id, { voidReason: reason }),
    onSuccess: () => {
      toast.success(t('Payment voided'));
      qc.invalidateQueries({ queryKey: ['payments'] });
      setVoidModal(null);
      setVoidReason('');
    },
    onError: (e) => toast.error(e.response?.data?.message || t('Failed to void')),
  });

  const bulkMut = useMutation({
    mutationFn: ({ ids, note }) => bulkApprovePayments({ ids, approvalNote: note || undefined }),
    onSuccess: (res) => {
      haptics.success();
      const count = res?.data?.data?.approved || selected.size;
      toast.success(t('{n} payment(s) approved', { n: count }));
      qc.invalidateQueries({ queryKey: ['payments'] });
      setSelected(new Set());
      setBulkModal(false);
      setBulkNote('');
    },
    onError: (e) => toast.error(e.response?.data?.message || t('Bulk approval failed')),
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
      await saveFile(res.data, `payments-${exportFrom || 'all'}.xlsx`);
      setExportModal(false);
    } catch {
      toast.error(t('Export failed'));
    } finally {
      setExporting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <PageHeader
        title="Supplier Payments"
        subtitle={pendingCount > 0
          ? t(pendingCount > 1 ? '{n} payments awaiting approval' : '{n} payment awaiting approval', { n: pendingCount })
          : t('Payment vouchers and approvals')}
        breadcrumbs={[{ label: 'Payments' }]}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExportModal(true)}
              className="btn-secondary flex items-center gap-2 text-sm px-3 sm:px-4"
              aria-label={t('Export')}>
              <FileDown className="h-4 w-4" /> <span className="hidden sm:inline">{t('Export')}</span>
            </button>
            {can('payments:write') && (
              <button onClick={() => navigate('/payments/new')} className="btn-primary flex items-center gap-2 text-sm">
                <Plus className="h-4 w-4" /> {t('Record Payment')}
              </button>
            )}
          </div>
        }
      />

      {/* Filter tabs + bulk action bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
        {/* Scrolls sideways on narrow phones instead of overflowing the page */}
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0">
          <div className="flex w-max gap-1 rounded-xl border border-gray-100 bg-white p-1">
            {FILTER_TABS.map((f) => (
              <button key={f.value} onClick={() => { haptics.select(); handleTabChange(f.value); }}
                className={`whitespace-nowrap px-3 py-2 sm:py-1.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === f.value ? 'bg-primary-50 text-primary-700' : 'text-gray-500 hover:text-gray-700'}`}>
                {t(f.label)}
                {f.value === 'pending_approval' && pendingCount > 0 && (
                  <span className="ml-1.5 bg-yellow-100 text-yellow-700 rounded-full px-1.5 py-0.5 text-xs">{pendingCount}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {canApprove && selected.size > 0 && !isMobile && (
          <button
            onClick={() => { setBulkNote(''); setBulkModal(true); }}
            className="btn-primary flex items-center gap-2 text-sm bg-green-600 hover:bg-green-700">
            <CheckCircle2 className="h-4 w-4" />
            {t('Approve {n} Selected', { n: selected.size })}
          </button>
        )}
      </div>

      {isMobile ? (
        isLoading ? (
          <div className="card p-8 text-center text-gray-400 text-sm">{t('Loading…')}</div>
        ) : payments.length === 0 ? (
          <div className="card px-4 py-12 text-center">
            <CreditCard className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            <p className="text-sm text-gray-400">{t('No payments found')}</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {canApprove && pendingPayments.length > 1 && (
              <div className="flex items-center justify-between px-1 text-xs text-gray-500">
                <span>{t('{n} awaiting approval', { n: pendingPayments.length })}</span>
                <button onClick={toggleAll} className="-my-2 py-2 font-semibold text-primary-600">
                  {allPendingSelected ? t('Clear selection') : t('Select all pending')}
                </button>
              </div>
            )}
            {payments.map((p) => {
              const isPending = p.status === 'pending_approval';
              return (
                <PaymentCard
                  key={p._id}
                  p={p}
                  showCheckbox={canApprove && isPending}
                  isSelected={selected.has(p._id)}
                  onToggle={() => { haptics.select(); toggleOne(p._id); }}
                  showApprove={canApprove && isPending}
                  onApprove={() => { setApprovalNote(''); setApproveModal({ id: p._id, paymentNumber: p.paymentNumber, amount: p.totalAmount }); }}
                  onReject={() => { setRejectReason(''); setRejectModal({ id: p._id, paymentNumber: p.paymentNumber }); }}
                  onOpen={() => navigate(`/payments/${p._id}`)}
                />
              );
            })}
          </div>
        )
      ) : (
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">{t('Loading…')}</div>
        ) : payments.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">{t('No payments found')}</div>
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
                          title={t('Select all pending')}
                        />
                      )}
                    </th>
                  )}
                  {['Voucher No.', 'Supplier', 'Date', 'Mode', 'Amount', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="table-th">{t(h)}</th>
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
                      <td className="table-td text-sm">{t(PM_LABELS[p.paymentMode]) || p.paymentMode}</td>
                      <td className="table-td text-right font-semibold">{fmtAmt(p.totalAmount)}</td>
                      <td className="table-td">
                        <Badge variant={STATUS_COLORS[p.status]}>{t(STATUS_LABELS[p.status])}</Badge>
                      </td>
                      <td className="table-td">
                        <div className="flex items-center gap-1">
                          <button onClick={() => navigate(`/payments/${p._id}`)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title={t('View')}>
                            <Eye className="h-4 w-4" />
                          </button>
                          {canApprove && isPending && (
                            <>
                              <button
                                onClick={() => { setApprovalNote(''); setApproveModal({ id: p._id, paymentNumber: p.paymentNumber }); }}
                                className="p-1.5 rounded-lg hover:bg-green-50 text-green-600" title={t('Approve')}>
                                <CheckCircle2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => { setRejectReason(''); setRejectModal({ id: p._id, paymentNumber: p.paymentNumber }); }}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" title={t('Reject')}>
                                <XCircle className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          {canApprove && p.status === 'approved' && (
                            <button
                              onClick={() => { setVoidReason(''); setVoidModal({ id: p._id, paymentNumber: p.paymentNumber }); }}
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-red-500" title={t('Void')}>
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
      )}

      {/* Phones: pinned bulk-approve bar while vouchers are selected */}
      {canApprove && selected.size > 0 && isMobile && (
        <StickyActionBar>
          <button onClick={() => setSelected(new Set())} className="btn-secondary">{t('Clear')}</button>
          <button
            onClick={() => { setBulkNote(''); setBulkModal(true); }}
            className="btn-primary bg-green-600 hover:bg-green-700">
            <CheckCircle2 className="h-4 w-4" /> {t('Approve {n}', { n: selected.size })}
          </button>
        </StickyActionBar>
      )}

      {/* ── Approve modal (single) ── */}
      <Modal open={!!approveModal} onClose={() => setApproveModal(null)} title={t('Approve Payment')} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {approveModal?.amount != null
              ? rich(t('Approve {number} of {amount}?'), {
                number: <strong>{approveModal?.paymentNumber}</strong>,
                amount: <strong>{fmtAmt(approveModal.amount)}</strong>,
              })
              : rich(t('Approve {number}?'), { number: <strong>{approveModal?.paymentNumber}</strong> })}
          </p>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              {t('Approval Note')} <span className="normal-case font-normal text-gray-400">{t('(optional)')}</span>
            </label>
            <textarea
              value={approvalNote}
              onChange={(e) => setApprovalNote(e.target.value)}
              rows={2}
              className="input"
              placeholder={t('e.g. Cross-checked with bank statement…')}
            />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => setApproveModal(null)} className="btn-secondary">{t('Cancel')}</button>
            <button
              onClick={() => approveMut.mutate({ id: approveModal.id, note: approvalNote })}
              disabled={approveMut.isPending}
              className="btn-primary flex items-center gap-2 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50">
              <CheckCircle2 className="h-4 w-4" />
              {approveMut.isPending ? t('Approving…') : t('Approve')}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Reject modal ── */}
      <Modal open={!!rejectModal} onClose={() => setRejectModal(null)} title={t('Reject Payment')} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{rich(t('Reject {number}?'), { number: <strong>{rejectModal?.paymentNumber}</strong> })}</p>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('Reason')} *</label>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              rows={3} className="input" placeholder={t('e.g. Invoice mismatch, duplicate entry…')} />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => setRejectModal(null)} className="btn-secondary">{t('Cancel')}</button>
            <button
              onClick={() => rejectMut.mutate({ id: rejectModal.id, reason: rejectReason })}
              disabled={!rejectReason.trim() || rejectMut.isPending}
              className="btn-danger">
              {rejectMut.isPending ? t('Rejecting…') : t('Reject')}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Bulk approve modal ── */}
      <Modal open={bulkModal} onClose={() => setBulkModal(false)} title={t('Bulk Approve Payments')} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {rich(t('Approve {payments}?'), {
              payments: <strong>{t(selected.size !== 1 ? '{n} payments' : '{n} payment', { n: selected.size })}</strong>,
            })}
          </p>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              {t('Shared Note')} <span className="normal-case font-normal text-gray-400">{t('(optional — applies to all)')}</span>
            </label>
            <textarea
              value={bulkNote}
              onChange={(e) => setBulkNote(e.target.value)}
              rows={2}
              className="input"
              placeholder={t('e.g. Verified against March bank statement…')}
            />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => setBulkModal(false)} className="btn-secondary">{t('Cancel')}</button>
            <button
              onClick={() => bulkMut.mutate({ ids: [...selected], note: bulkNote })}
              disabled={bulkMut.isPending}
              className="btn-primary flex items-center gap-2 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50">
              <CheckCircle2 className="h-4 w-4" />
              {bulkMut.isPending ? t('Approving…') : t('Approve {n}', { n: selected.size })}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Void modal ── */}
      <Modal open={!!voidModal} onClose={() => setVoidModal(null)} title={t('Void Payment')} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {rich(t('Void {number}? This will remove it from the supplier ledger and outstanding balance.'), {
              number: <strong>{voidModal?.paymentNumber}</strong>,
            })}
          </p>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('Reason')} *</label>
            <textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)}
              rows={3} className="input" placeholder={t('e.g. Entered in error, duplicate payment…')} />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => setVoidModal(null)} className="btn-secondary">{t('Cancel')}</button>
            <button
              onClick={() => voidMut.mutate({ id: voidModal.id, reason: voidReason })}
              disabled={!voidReason.trim() || voidMut.isPending}
              className="btn-danger flex items-center gap-2 text-sm">
              <Ban className="h-4 w-4" />
              {voidMut.isPending ? t('Voiding…') : t('Void Payment')}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Export modal ── */}
      <Modal open={exportModal} onClose={() => setExportModal(false)} title={t('Export Payments')} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">{t('Leave dates blank to export all records.')}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('From')}</label>
              <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} className="input" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('To')}</label>
              <input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} className="input" />
            </div>
          </div>
          {statusFilter && (
            <p className="text-xs text-gray-400">
              {rich(t('Active filter {status} will be applied to the export.'), {
                status: <strong className="text-gray-600">{t(STATUS_LABELS[statusFilter]) || statusFilter}</strong>,
              })}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => setExportModal(false)} className="btn-secondary">{t('Cancel')}</button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50">
              <Download className="h-4 w-4" />
              {exporting ? t('Generating…') : t('Download Excel')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
