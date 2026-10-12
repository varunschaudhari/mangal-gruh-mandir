import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, XCircle, Download, Building2, Ban, Clock, UserCircle2, FileCheck, FileX, Trash2, RotateCcw } from 'lucide-react';
import { getPayment, approvePayment, rejectPayment, voidPayment, downloadVoucher, resubmitPayment } from '../../api/supplierPayment.api.js';
import EntityAuditTrail from '../../components/ui/EntityAuditTrail.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import StickyActionBar from '../../components/ui/StickyActionBar.jsx';
import { useSetAppBarTitle } from '../../components/Layout/AppBarContext.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import toast from 'react-hot-toast';
import { saveFile } from '../../utils/fileSaver.js';
import haptics from '../../utils/haptics.js';
import { localDateStr } from '../../utils/formatters.js';
import { useT, rich } from '../../i18n/index.jsx';

const fmt    = (d)  => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtTs  = (d)  => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtAmt = (n)  => n != null ? `₹${Number(n).toLocaleString('en-IN')}` : '—';
const STATUS_COLORS = { pending_approval: 'yellow', approved: 'green', rejected: 'red', voided: 'gray' };
const STATUS_LABELS = { pending_approval: 'Pending Approval', approved: 'Approved', rejected: 'Rejected', voided: 'Voided' };
const PM_LABELS     = { cash: 'Cash', upi: 'UPI / Online', neft: 'NEFT', rtgs: 'RTGS', cheque: 'Cheque' };


const Row = ({ label, children }) => {
  const t = useT();
  return (
  <div className="flex items-start justify-between gap-4 py-2.5 border-b border-gray-50 last:border-0">
    <span className="text-xs text-gray-400 shrink-0 w-28 sm:w-36">{t(label)}</span>
    <span className="min-w-0 break-words text-sm text-gray-800 text-right font-medium">{children}</span>
  </div>
  );
};

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
  const t = useT();
  const events = buildTimeline(payment);
  if (!events.length) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
        <Clock className="h-4 w-4 text-gray-400" />
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('Activity Timeline')}</p>
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
                    <span className={`text-sm font-semibold ${cfg.text}`}>{t(cfg.label)}</span>
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
  const t        = useT();
  const { id }   = useParams();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { can, user } = usePermissions();
  // Below lg the app bar has the back arrow; rendering the link only on desktop keeps the
  // desktop DOM (and its space-y spacing) exactly as before.
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const [approveModal, setApproveModal]     = useState(false);
  const [approvalNote, setApprovalNote]     = useState('');
  const [rejectModal,  setRejectModal]      = useState(false);
  const [rejectReason, setRejectReason]     = useState('');
  const [voidModal,    setVoidModal]        = useState(false);
  const [voidReason,   setVoidReason]       = useState('');
  const [resubmitModal, setResubmitModal]   = useState(false);
  const [rsDate,        setRsDate]          = useState('');
  const [rsMode,        setRsMode]          = useState('');
  const [rsRef,         setRsRef]           = useState('');
  const [rsNotes,       setRsNotes]         = useState('');
  const [downloading,  setDownloading]      = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ['payment', id], queryFn: () => getPayment(id) });

  // No PageHeader here, so name the mobile app bar ourselves.
  useSetAppBarTitle(data?.data?.data?.paymentNumber || t('Payment'));

  const approveMut = useMutation({
    mutationFn: (note) => approvePayment(id, note ? { approvalNote: note } : undefined),
    onSuccess:  () => {
      haptics.success();
      toast.success(t('Payment approved'));
      qc.invalidateQueries({ queryKey: ['payment', id] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      setApproveModal(false);
      setApprovalNote('');
    },
    onError: (e) => toast.error(e.response?.data?.message || t('Failed')),
  });

  const rejectMut = useMutation({
    mutationFn: () => rejectPayment(id, { rejectionReason: rejectReason }),
    onSuccess:  () => { toast.success(t('Payment rejected')); qc.invalidateQueries({ queryKey: ['payment', id] }); qc.invalidateQueries({ queryKey: ['payments'] }); setRejectModal(false); },
    onError:    (e) => toast.error(e.response?.data?.message || t('Failed')),
  });

  const resubmitMut = useMutation({
    mutationFn: () => resubmitPayment(id, {
      paymentDate:     rsDate  || undefined,
      paymentMode:     rsMode  || undefined,
      referenceNumber: rsRef   || undefined,
      notes:           rsNotes || undefined,
    }),
    onSuccess: () => {
      toast.success(t('Payment resubmitted for approval'));
      qc.invalidateQueries({ queryKey: ['payment', id] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      setResubmitModal(false);
    },
    onError: (e) => toast.error(e.response?.data?.message || t('Failed')),
  });

  const voidMut = useMutation({
    mutationFn: () => voidPayment(id, { voidReason }),
    onSuccess:  () => {
      toast.success(t('Payment voided'));
      qc.invalidateQueries({ queryKey: ['payment', id] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      setVoidModal(false);
      setVoidReason('');
    },
    onError: (e) => toast.error(e.response?.data?.message || t('Failed')),
  });

  const handleDownloadVoucher = async () => {
    setDownloading(true);
    try {
      const res = await downloadVoucher(id);
      await saveFile(res.data, `VOUCHER-${payment.paymentNumber}.pdf`);
    } catch { toast.error(t('Failed to download voucher')); }
    finally   { setDownloading(false); }
  };

  if (isLoading) return <PageLoader />;
  const payment = data?.data?.data;
  if (!payment)  return <div className="text-gray-400 p-6">{t('Payment not found.')}</div>;

  const canApprove  = can('payments:approve') && user?.canApprovePayments;
  const isPending   = payment.status === 'pending_approval';
  const isApproved  = payment.status === 'approved';
  const isRejected  = payment.status === 'rejected';
  const isSubmitter = user?._id === payment.createdBy?._id || user?.id === payment.createdBy?._id;

  const openApprove  = () => { setApprovalNote(''); setApproveModal(true); };
  const openReject   = () => { setRejectModal(true); setRejectReason(''); };
  const openVoid     = () => { setVoidReason(''); setVoidModal(true); };
  const openResubmit = () => {
    setRsDate(localDateStr(payment.paymentDate));
    setRsMode(payment.paymentMode);
    setRsRef(payment.referenceNumber || '');
    setRsNotes(payment.notes || '');
    setResubmitModal(true);
  };

  const showApproveBar  = canApprove && isPending;
  const showResubmitBar = isRejected && isSubmitter;

  return (
    <div className="max-w-3xl space-y-4">
      {isDesktop && (
        <button onClick={() => navigate('/payments')}
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
          <ArrowLeft className="h-4 w-4" /> {t('Payments')}
        </button>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <Badge variant={STATUS_COLORS[payment.status]}>{t(STATUS_LABELS[payment.status])}</Badge>
            {/* Below lg the voucher number is already the app bar title */}
            <span className="hidden lg:inline font-mono text-xs text-gray-400">{payment.paymentNumber}</span>
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-gray-900 break-words">
            {rich(t('Payment to {supplier}'), {
              supplier: (
                <Link to={`/masters/suppliers/${payment.supplier?._id}`} className="hover:text-primary-600 transition-colors">
                  {payment.supplier?.name || '—'}
                </Link>
              ),
            })}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">{fmt(payment.paymentDate)}</p>
        </div>
        {/* Phones get these in the pinned action bar below */}
        <div className="hidden sm:flex gap-2 flex-wrap">
          {isApproved && (
            <>
              <button onClick={handleDownloadVoucher} disabled={downloading}
                className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50">
                <Download className="h-4 w-4" />
                {downloading ? t('Generating…') : t('Voucher PDF')}
              </button>
              {canApprove && (
                <button onClick={openVoid}
                  className="btn-secondary flex items-center gap-2 text-sm text-red-500 hover:text-red-600 border-red-200 hover:border-red-300">
                  <Ban className="h-4 w-4" /> {t('Void')}
                </button>
              )}
            </>
          )}
          {showResubmitBar && (
            <button
              onClick={openResubmit}
              className="btn-secondary flex items-center gap-2 text-sm border-amber-300 text-amber-700 hover:border-amber-400">
              <RotateCcw className="h-4 w-4" /> {t('Edit & Resubmit')}
            </button>
          )}
          {showApproveBar && (
            <>
              <button
                onClick={openApprove}
                className="btn-primary flex items-center gap-2 text-sm bg-green-600 hover:bg-green-700">
                <CheckCircle2 className="h-4 w-4" /> {t('Approve')}
              </button>
              <button onClick={openReject}
                className="btn-danger flex items-center gap-2 text-sm">
                <XCircle className="h-4 w-4" /> {t('Reject')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Amount strip */}
      <div className="bg-white rounded-xl border border-gray-100 px-4 sm:px-6 py-4 text-center">
        <p className="text-3xl font-black text-primary-600">{fmtAmt(payment.totalAmount)}</p>
        <p className="text-sm text-gray-400 mt-0.5">{t(PM_LABELS[payment.paymentMode]) || payment.paymentMode}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Payment info */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="h-4 w-4 text-gray-400" />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('Payment Info')}</p>
          </div>
          <Row label={t('Mode')}>{t(PM_LABELS[payment.paymentMode]) || payment.paymentMode}</Row>
          {payment.referenceNumber && <Row label={t('Reference No.')}>{payment.referenceNumber}</Row>}
          {payment.bankName        && <Row label={t('Bank')}>{payment.bankName}</Row>}
          {payment.notes           && <Row label={t('Notes')}>{payment.notes}</Row>}
          <Row label={t('Submitted By')}>{payment.createdBy?.name || '—'}</Row>
        </div>

        {/* Supplier info */}
        {payment.supplier && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-4 w-4 text-gray-400" />
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('Supplier')}</p>
            </div>
            <Row label={t('Name')}>{payment.supplier.name}</Row>
            {payment.bankName && <Row label={t('Paid To')}>{payment.bankName}</Row>}
            {!payment.bankName && (() => {
              const acc = payment.supplier.bankAccounts?.find((a) => a.isDefault) || payment.supplier.bankAccounts?.[0];
              if (!acc) return null;
              return (
                <>
                  {acc.bankName      && <Row label={t('Bank')}>{acc.bankName}</Row>}
                  {acc.accountNumber && <Row label={t('Account No.')}>{acc.accountNumber}</Row>}
                  {acc.ifscCode      && <Row label={t('IFSC')}>{acc.ifscCode}</Row>}
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
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('Invoice Allocation')}</p>
          </div>
          {/* Phones: one line per invoice instead of a 4-column table */}
          <div className="divide-y divide-gray-50 md:hidden">
            {payment.invoices.map((inv, i) => (
              <div key={i} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm text-gray-800 break-all">{inv.invoiceNumber || t('Advance')}</p>
                  <p className="text-xs text-gray-400">{fmt(inv.invoiceDate)} · {t('of {amount}', { amount: fmtAmt(inv.invoiceTotal) })}</p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-primary-600">{fmtAmt(inv.paidAmount)}</p>
              </div>
            ))}
            <div className="flex items-center justify-between bg-gray-50 px-4 py-3 text-sm font-bold">
              <span>{t('Total')}</span>
              <span className="text-primary-700">{fmtAmt(payment.totalAmount)}</span>
            </div>
          </div>
          <table className="hidden md:table min-w-full">
            <thead>
              <tr className="bg-gray-50">
                {['Invoice No.', 'Invoice Date', 'Invoice Total', 'Amount Paid'].map((h) => (
                  <th key={h} className="table-th">{t(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payment.invoices.map((inv, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="table-td font-mono text-xs">{inv.invoiceNumber || t('Advance')}</td>
                  <td className="table-td text-sm">{fmt(inv.invoiceDate)}</td>
                  <td className="table-td text-right">{fmtAmt(inv.invoiceTotal)}</td>
                  <td className="table-td text-right font-semibold text-primary-600">{fmtAmt(inv.paidAmount)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-bold">
                <td className="table-td" colSpan={3}>{t('Total')}</td>
                <td className="table-td text-right text-primary-700">{fmtAmt(payment.totalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Activity timeline */}
      <ActivityTimeline payment={payment} />

      {/* Phones: voiding is rare and destructive, so it stays out of the pinned bar */}
      {isApproved && canApprove && (
        <button onClick={openVoid} className="btn-secondary w-full border-red-200 text-red-600 sm:hidden">
          <Ban className="h-4 w-4" /> {t('Void Payment')}
        </button>
      )}

      {/* Audit trail */}
      {payment?._id && <EntityAuditTrail entityRef={payment._id} title={t('Payment History')} />}

      {/* Phones: primary actions pinned in thumb reach (Approve on the right) */}
      {(showApproveBar || showResubmitBar || isApproved) && (
        <div className="sm:hidden">
          <StickyActionBar>
            {showApproveBar && (
              <>
                <button onClick={openReject} className="btn-secondary border-red-200 text-red-600">
                  <XCircle className="h-4 w-4" /> {t('Reject')}
                </button>
                <button onClick={openApprove} className="btn-primary bg-green-600 hover:bg-green-700">
                  <CheckCircle2 className="h-4 w-4" /> {t('Approve')}
                </button>
              </>
            )}
            {showResubmitBar && (
              <button onClick={openResubmit} className="btn-secondary border-amber-300 text-amber-700">
                <RotateCcw className="h-4 w-4" /> {t('Edit & Resubmit')}
              </button>
            )}
            {isApproved && (
              <button onClick={handleDownloadVoucher} disabled={downloading} className="btn-secondary">
                <Download className="h-4 w-4" />
                {downloading ? t('Generating…') : t('Voucher PDF')}
              </button>
            )}
          </StickyActionBar>
        </div>
      )}

      {/* Void modal */}
      <Modal open={voidModal} onClose={() => setVoidModal(false)} title={t('Void Payment')} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {rich(t('Void {number} of {amount}?'), {
              number: <strong>{payment.paymentNumber}</strong>,
              amount: <strong>{fmtAmt(payment.totalAmount)}</strong>,
            })}
            {' '}{t("This will remove it from the supplier's outstanding balance.")}
          </p>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('Reason')} *</label>
            <textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)}
              rows={3} className="input" placeholder={t('e.g. Entered in error, duplicate payment…')} />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => setVoidModal(false)} className="btn-secondary">{t('Cancel')}</button>
            <button
              onClick={() => voidMut.mutate()}
              disabled={!voidReason.trim() || voidMut.isPending}
              className="btn-danger flex items-center gap-2 text-sm">
              <Ban className="h-4 w-4" />
              {voidMut.isPending ? t('Voiding…') : t('Void Payment')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Approve modal */}
      <Modal open={approveModal} onClose={() => setApproveModal(false)} title={t('Approve Payment')} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {rich(t('Approve {number} of {amount}?'), {
              number: <strong>{payment.paymentNumber}</strong>,
              amount: <strong>{fmtAmt(payment.totalAmount)}</strong>,
            })}
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
            <button onClick={() => setApproveModal(false)} className="btn-secondary">{t('Cancel')}</button>
            <button
              onClick={() => approveMut.mutate(approvalNote)}
              disabled={approveMut.isPending}
              className="btn-primary flex items-center gap-2 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50">
              <CheckCircle2 className="h-4 w-4" />
              {approveMut.isPending ? t('Approving…') : t('Approve')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Reject modal */}
      <Modal open={rejectModal} onClose={() => setRejectModal(false)} title={t('Reject Payment')} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{rich(t('Reject {number}?'), { number: <strong>{payment.paymentNumber}</strong> })}</p>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('Reason')} *</label>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              rows={3} className="input" placeholder={t('e.g. Invoice mismatch, duplicate entry…')} />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => setRejectModal(false)} className="btn-secondary">{t('Cancel')}</button>
            <button
              onClick={() => rejectMut.mutate()}
              disabled={!rejectReason.trim() || rejectMut.isPending}
              className="btn-danger">
              {rejectMut.isPending ? t('Rejecting…') : t('Reject')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Resubmit modal */}
      <Modal open={resubmitModal} onClose={() => setResubmitModal(false)} title={t('Edit & Resubmit Payment')}>
        <div className="space-y-4">
          {payment.rejectionReason && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">{t('Rejection reason')}</p>
              <p className="text-sm text-red-800">{payment.rejectionReason}</p>
            </div>
          )}
          <p className="text-sm text-gray-500">
            {rich(t('Correct the details below and resubmit {number} for approval.'), {
              number: <strong>{payment.paymentNumber}</strong>,
            })}
            {' '}{t('Invoice allocation and total amount are preserved.')}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('Payment Date')}</label>
              <input type="date" value={rsDate} onChange={(e) => setRsDate(e.target.value)} className="input" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('Payment Mode')}</label>
              <select value={rsMode} onChange={(e) => setRsMode(e.target.value)} className="input">
                {['cash', 'upi', 'neft', 'rtgs', 'cheque'].map((m) => (
                  <option key={m} value={m}>{t(PM_LABELS[m]) || m}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('Reference Number')}</label>
            <input value={rsRef} onChange={(e) => setRsRef(e.target.value)} className="input" placeholder={t('UPI ID, cheque no., etc.')} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('Notes')}</label>
            <textarea value={rsNotes} onChange={(e) => setRsNotes(e.target.value)} rows={2} className="input" placeholder={t('Optional remarks…')} />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => setResubmitModal(false)} className="btn-secondary">{t('Cancel')}</button>
            <button
              onClick={() => resubmitMut.mutate()}
              disabled={resubmitMut.isPending}
              className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50">
              <RotateCcw className="h-4 w-4" />
              {resubmitMut.isPending ? t('Resubmitting…') : t('Resubmit for Approval')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
