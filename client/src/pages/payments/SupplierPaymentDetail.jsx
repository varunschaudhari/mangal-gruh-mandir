import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, XCircle, Download, Building2, Ban, Clock, UserCircle2, FileCheck, FileX, Trash2 } from 'lucide-react';
import { getPayment, approvePayment, rejectPayment, voidPayment, downloadVoucher } from '../../api/supplierPayment.api.js';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import toast from 'react-hot-toast';

const fmt    = (d)  => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtTs  = (d)  => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtAmt = (n)  => n != null ? `₹${Number(n).toLocaleString('en-IN')}` : '—';
const STATUS_COLORS = { pending_approval: 'yellow', approved: 'green', rejected: 'red', voided: 'gray' };
const STATUS_LABELS = { pending_approval: 'Pending Approval', approved: 'Approved', rejected: 'Rejected', voided: 'Voided' };
const PM_LABELS     = { cash: 'Cash', upi: 'UPI / Online', neft: 'NEFT', rtgs: 'RTGS', cheque: 'Cheque' };

const Row = ({ label, children }) => (
  <div className="flex items-start justify-between gap-4 py-2.5 border-b border-gray-50 last:border-0">
    <span className="text-xs text-gray-400 shrink-0 w-36">{label}</span>
    <span className="text-sm text-gray-800 text-right font-medium">{children}</span>
  </div>
);

const TIMELINE_CONFIG = {
  created:  { icon: Clock,      bg: 'bg-blue-100',  ring: 'ring-blue-200',  text: 'text-blue-600',  label: 'Submitted' },
  approved: { icon: FileCheck,  bg: 'bg-green-100', ring: 'ring-green-200', text: 'text-green-600', label: 'Approved' },
  rejected: { icon: FileX,      bg: 'bg-red-100',   ring: 'ring-red-200',   text: 'text-red-600',   label: 'Rejected' },
  voided:   { icon: Trash2,     bg: 'bg-gray-100',  ring: 'ring-gray-200',  text: 'text-gray-500',  label: 'Voided' },
};

function buildTimeline(payment) {
  const events = [];

  if (payment.createdAt) {
    events.push({
      key:   'created',
      at:    payment.createdAt,
      by:    payment.createdBy?.name,
      note:  payment.notes || null,
    });
  }

  if (payment.approvedAt) {
    events.push({
      key:   'approved',
      at:    payment.approvedAt,
      by:    payment.approvedBy?.name,
      note:  payment.approvalNote || null,
    });
  }

  if (payment.status === 'rejected' && payment.rejectedAt) {
    events.push({
      key:   'rejected',
      at:    payment.rejectedAt,
      by:    payment.rejectedBy?.name,
      note:  payment.rejectionReason || null,
    });
  } else if (payment.status === 'rejected' && !payment.rejectedAt && payment.rejectionReason) {
    // Legacy rejection without rejectedAt — show it as approximate
    events.push({
      key:   'rejected',
      at:    null,
      by:    null,
      note:  payment.rejectionReason,
    });
  }

  if (payment.voidedAt) {
    events.push({
      key:   'voided',
      at:    payment.voidedAt,
      by:    payment.voidedBy?.name,
      note:  payment.voidReason || null,
    });
  }

  return events.sort((a, b) => (a.at && b.at ? new Date(a.at) - new Date(b.at) : 0));
}

function ActivityTimeline({ payment }) {
  const events = buildTimeline(payment);
  if (!events.length) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
        <Clock className="h-4 w-4 text-gray-400" />
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Activity Timeline</p>
      </div>
      <div className="p-4">
        <ol className="relative space-y-0">
          {events.map((ev, idx) => {
            const cfg = TIMELINE_CONFIG[ev.key];
            const Icon = cfg.icon;
            const isLast = idx === events.length - 1;
            return (
              <li key={ev.key} className="relative flex gap-4">
                {/* Vertical line */}
                {!isLast && (
                  <div className="absolute left-[17px] top-9 bottom-0 w-px bg-gray-100" />
                )}
                {/* Icon bubble */}
                <div className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${cfg.bg}`}>
                  <Icon className={`h-4 w-4 ${cfg.text}`} />
                </div>
                {/* Content */}
                <div className={`flex-1 pb-6 ${isLast ? 'pb-0' : ''}`}>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className={`text-sm font-semibold ${cfg.text}`}>{cfg.label}</span>
                    {ev.by && (
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <UserCircle2 className="h-3 w-3" /> {ev.by}
                      </span>
                    )}
                    {ev.at && (
                      <span className="text-xs text-gray-400 ml-auto">{fmtTs(ev.at)}</span>
                    )}
                  </div>
                  {ev.note && (
                    <p className="mt-1 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                      {ev.note}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

export default function SupplierPaymentDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { can, user } = usePermissions();

  const [approveModal, setApproveModal] = useState(false);
  const [approvalNote, setApprovalNote] = useState('');
  const [rejectModal,  setRejectModal]  = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [voidModal,    setVoidModal]    = useState(false);
  const [voidReason,   setVoidReason]   = useState('');
  const [downloading,  setDownloading]  = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ['payment', id], queryFn: () => getPayment(id) });

  const approveMut = useMutation({
    mutationFn: (note) => approvePayment(id, note ? { approvalNote: note } : undefined),
    onSuccess:  () => {
      toast.success('Payment approved');
      qc.invalidateQueries({ queryKey: ['payment', id] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      setApproveModal(false);
      setApprovalNote('');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const rejectMut = useMutation({
    mutationFn: () => rejectPayment(id, { rejectionReason: rejectReason }),
    onSuccess:  () => { toast.success('Payment rejected'); qc.invalidateQueries({ queryKey: ['payment', id] }); qc.invalidateQueries({ queryKey: ['payments'] }); setRejectModal(false); },
    onError:    (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const voidMut = useMutation({
    mutationFn: () => voidPayment(id, { voidReason }),
    onSuccess:  () => {
      toast.success('Payment voided');
      qc.invalidateQueries({ queryKey: ['payment', id] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      setVoidModal(false);
      setVoidReason('');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const handleDownloadVoucher = async () => {
    setDownloading(true);
    try {
      const res = await downloadVoucher(id);
      const url = URL.createObjectURL(res.data);
      const a   = document.createElement('a');
      a.href = url; a.download = `VOUCHER-${payment.paymentNumber}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Failed to download voucher'); }
    finally   { setDownloading(false); }
  };

  if (isLoading) return <PageLoader />;
  const payment = data?.data?.data;
  if (!payment)  return <div className="text-gray-400 p-6">Payment not found.</div>;

  const canApprove = can('payments:approve') && user?.canApprovePayments;
  const isPending  = payment.status === 'pending_approval';
  const isApproved = payment.status === 'approved';

  return (
    <div className="max-w-3xl space-y-4">
      <button onClick={() => navigate('/payments')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Payments
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Badge variant={STATUS_COLORS[payment.status]}>{STATUS_LABELS[payment.status]}</Badge>
            <span className="font-mono text-xs text-gray-400">{payment.paymentNumber}</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            Payment to{' '}
            <Link to={`/masters/suppliers/${payment.supplier?._id}`} className="hover:text-primary-600 transition-colors">
              {payment.supplier?.name || '—'}
            </Link>
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">{fmt(payment.paymentDate)}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isApproved && (
            <>
              <button onClick={handleDownloadVoucher} disabled={downloading}
                className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50">
                <Download className="h-4 w-4" />
                {downloading ? 'Generating…' : 'Voucher PDF'}
              </button>
              {canApprove && (
                <button onClick={() => { setVoidReason(''); setVoidModal(true); }}
                  className="btn-secondary flex items-center gap-2 text-sm text-red-500 hover:text-red-600 border-red-200 hover:border-red-300">
                  <Ban className="h-4 w-4" /> Void
                </button>
              )}
            </>
          )}
          {canApprove && isPending && (
            <>
              <button
                onClick={() => { setApprovalNote(''); setApproveModal(true); }}
                className="btn-primary flex items-center gap-2 text-sm bg-green-600 hover:bg-green-700">
                <CheckCircle2 className="h-4 w-4" /> Approve
              </button>
              <button onClick={() => { setRejectModal(true); setRejectReason(''); }}
                className="btn-danger flex items-center gap-2 text-sm">
                <XCircle className="h-4 w-4" /> Reject
              </button>
            </>
          )}
        </div>
      </div>

      {/* Amount strip */}
      <div className="bg-white rounded-xl border border-gray-100 px-6 py-4 text-center">
        <p className="text-3xl font-black text-primary-600">{fmtAmt(payment.totalAmount)}</p>
        <p className="text-sm text-gray-400 mt-0.5">{PM_LABELS[payment.paymentMode] || payment.paymentMode}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Payment info */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="h-4 w-4 text-gray-400" />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Payment Info</p>
          </div>
          <Row label="Mode">{PM_LABELS[payment.paymentMode] || payment.paymentMode}</Row>
          {payment.referenceNumber && <Row label="Reference No.">{payment.referenceNumber}</Row>}
          {payment.bankName        && <Row label="Bank">{payment.bankName}</Row>}
          {payment.notes           && <Row label="Notes">{payment.notes}</Row>}
          <Row label="Submitted By">{payment.createdBy?.name || '—'}</Row>
        </div>

        {/* Supplier info */}
        {payment.supplier && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-4 w-4 text-gray-400" />
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Supplier</p>
            </div>
            <Row label="Name">{payment.supplier.name}</Row>
            {payment.bankName && <Row label="Paid To">{payment.bankName}</Row>}
            {!payment.bankName && (() => {
              const acc = payment.supplier.bankAccounts?.find((a) => a.isDefault) || payment.supplier.bankAccounts?.[0];
              if (!acc) return null;
              return (
                <>
                  {acc.bankName      && <Row label="Bank">{acc.bankName}</Row>}
                  {acc.accountNumber && <Row label="Account No.">{acc.accountNumber}</Row>}
                  {acc.ifscCode      && <Row label="IFSC">{acc.ifscCode}</Row>}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Invoice allocation */}
      {payment.invoices?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b bg-orange-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Invoice Allocation</p>
          </div>
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-50">
                {['Invoice No.', 'Invoice Date', 'Invoice Total', 'Amount Paid'].map((h) => (
                  <th key={h} className="table-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payment.invoices.map((inv, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="table-td font-mono text-xs">{inv.invoiceNumber || 'Advance'}</td>
                  <td className="table-td text-sm">{fmt(inv.invoiceDate)}</td>
                  <td className="table-td text-right">{fmtAmt(inv.invoiceTotal)}</td>
                  <td className="table-td text-right font-semibold text-primary-600">{fmtAmt(inv.paidAmount)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-bold">
                <td className="table-td" colSpan={3}>Total</td>
                <td className="table-td text-right text-primary-700">{fmtAmt(payment.totalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Activity timeline */}
      <ActivityTimeline payment={payment} />

      {/* Void modal */}
      <Modal open={voidModal} onClose={() => setVoidModal(false)} title="Void Payment" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Void <strong>{payment.paymentNumber}</strong> of <strong>{fmtAmt(payment.totalAmount)}</strong>?
            This will remove it from the supplier's outstanding balance.
          </p>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Reason *</label>
            <textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)}
              rows={3} className="input" placeholder="e.g. Entered in error, duplicate payment…" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setVoidModal(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => voidMut.mutate()}
              disabled={!voidReason.trim() || voidMut.isPending}
              className="btn-danger flex items-center gap-2 text-sm">
              <Ban className="h-4 w-4" />
              {voidMut.isPending ? 'Voiding…' : 'Void Payment'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Approve modal */}
      <Modal open={approveModal} onClose={() => setApproveModal(false)} title="Approve Payment" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Approve <strong>{payment.paymentNumber}</strong> of{' '}
            <strong>{fmtAmt(payment.totalAmount)}</strong>?
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
            <button onClick={() => setApproveModal(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => approveMut.mutate(approvalNote)}
              disabled={approveMut.isPending}
              className="btn-primary flex items-center gap-2 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50">
              <CheckCircle2 className="h-4 w-4" />
              {approveMut.isPending ? 'Approving…' : 'Approve'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Reject modal */}
      <Modal open={rejectModal} onClose={() => setRejectModal(false)} title="Reject Payment" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Reject <strong>{payment.paymentNumber}</strong>?</p>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Reason *</label>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              rows={3} className="input" placeholder="e.g. Invoice mismatch, duplicate entry…" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setRejectModal(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => rejectMut.mutate()}
              disabled={!rejectReason.trim() || rejectMut.isPending}
              className="btn-danger">
              {rejectMut.isPending ? 'Rejecting…' : 'Reject'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
