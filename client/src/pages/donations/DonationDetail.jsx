import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Printer, XCircle, IndianRupee, Package, User, FileCheck2 } from 'lucide-react';
import { getDonation, voidDonation, download80GReceipt } from '../../api/donation.api.js';
import { printDonationReceipt } from '../../utils/donationReceipt.js';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import toast from 'react-hot-toast';

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const TYPE_COLORS = { named: 'green', hundi: 'blue', anonymous: 'gray' };
const TYPE_LABELS = { named: 'Named Donor', hundi: 'Hundi Collection', anonymous: 'Anonymous' };
const PM_LABELS   = { cash: 'Cash', upi: 'UPI', cheque: 'Cheque', bank_transfer: 'Bank Transfer' };

const Row = ({ label, children }) => (
  <div className="flex items-start justify-between gap-4 py-2.5 border-b border-gray-50 last:border-0">
    <span className="text-xs text-gray-400 shrink-0 w-36">{label}</span>
    <span className="text-sm text-gray-800 text-right font-medium">{children}</span>
  </div>
);

const DonationDetail = () => {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { can }  = usePermissions();
  const qc       = useQueryClient();
  const [showVoid,      setShowVoid]      = useState(false);
  const [voidReason,    setVoidReason]    = useState('');
  const [downloading80G, setDownloading80G] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ['donation', id], queryFn: () => getDonation(id) });

  const voidMut = useMutation({
    mutationFn: () => voidDonation(id, { voidReason }),
    onSuccess: () => { toast.success('Donation voided'); qc.invalidateQueries({ queryKey: ['donation', id] }); qc.invalidateQueries({ queryKey: ['donations'] }); setShowVoid(false); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  if (isLoading) return <PageLoader />;

  const donation = data?.data?.data;
  if (!donation) return <div className="text-gray-400 p-6">Donation not found.</div>;

  const { donationNumber, donationType, date, donor, donorName, donorPhone, panNumber, is80G, occasion,
    cashAmount, paymentMode, paymentRef, kindItems = [], notes, totalEstimatedValue,
    isVoided, voidReason: vr, createdBy, receivedBy } = donation;

  const handle80GDownload = async () => {
    setDownloading80G(true);
    try {
      const res = await download80GReceipt(id);
      const url = URL.createObjectURL(res.data);
      const a   = document.createElement('a');
      a.href = url; a.download = `80G-${donationNumber}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Failed to generate 80G receipt'); }
    finally { setDownloading80G(false); }
  };

  const displayDonor = donor?.name || donorName || (donationType === 'hundi' ? 'Hundi Collection' : 'Anonymous');
  const kindTotal    = kindItems.reduce((s, k) => s + (k.estimatedValue || 0), 0);

  return (
    <div className="max-w-3xl space-y-4">
      <button onClick={() => navigate('/donations')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Donation History
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1 flex-wrap">
            <Badge variant={TYPE_COLORS[donationType]}>{TYPE_LABELS[donationType]}</Badge>
            <span className="font-mono text-xs text-gray-400">{donationNumber}</span>
            {isVoided && <Badge variant="red">Voided</Badge>}
          </div>
          <h1 className="text-xl font-bold text-gray-900">{displayDonor}</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {fmt(date)}{occasion?.name ? ` · ${occasion.name}` : ''}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {donationType !== 'hundi' && !isVoided && (
            <button onClick={() => printDonationReceipt(donation)}
              className="btn-secondary flex items-center gap-2 text-sm">
              <Printer className="h-4 w-4" /> Print Receipt
            </button>
          )}
          {is80G && donationType === 'named' && !isVoided && (
            <button onClick={handle80GDownload} disabled={downloading80G}
              className="btn-secondary flex items-center gap-2 text-sm text-emerald-700 border-emerald-300 hover:bg-emerald-50 disabled:opacity-50">
              <FileCheck2 className="h-4 w-4 text-emerald-600" />
              {downloading80G ? 'Generating…' : '80G Receipt'}
            </button>
          )}
          {can('donations:write') && !isVoided && (
            <button onClick={() => { setShowVoid(true); setVoidReason(''); }}
              className="btn-danger flex items-center gap-2 text-sm">
              <XCircle className="h-4 w-4" /> Void
            </button>
          )}
        </div>
      </div>

      {/* Stats strip */}
      <div className="bg-white rounded-xl border border-gray-100 grid grid-cols-3 divide-x divide-gray-100 overflow-hidden">
        {[
          { label: 'Cash Donated',    value: cashAmount > 0 ? `₹${cashAmount.toLocaleString('en-IN')}` : '—', color: 'text-green-600' },
          { label: 'Kind Value',      value: kindTotal  > 0 ? `₹${kindTotal.toLocaleString('en-IN')}`  : '—', color: 'text-blue-600' },
          { label: 'Total',           value: `₹${(totalEstimatedValue || 0).toLocaleString('en-IN')}`,          color: 'text-gray-800' },
        ].map(({ label, value, color }) => (
          <div key={label} className="px-4 py-3 text-center">
            <p className={`text-xl font-black ${color}`}>{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Donor info */}
        {donationType === 'named' && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <User className="h-4 w-4 text-gray-400" />
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Donor</p>
              {donor && (
                <button onClick={() => navigate(`/donations/donors/${donor._id}`)}
                  className="ml-auto text-xs text-primary-600 hover:underline">History →</button>
              )}
            </div>
            <Row label="Name">{displayDonor}</Row>
            {(donorPhone || donor?.phone) && <Row label="Phone">{donorPhone || donor?.phone}</Row>}
            {(panNumber || donor?.panNumber) && <Row label="PAN">{panNumber || donor?.panNumber}</Row>}
          </div>
        )}

        {/* Payment info */}
        {cashAmount > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <IndianRupee className="h-4 w-4 text-gray-400" />
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Cash Donation</p>
            </div>
            <Row label="Amount">₹{cashAmount.toLocaleString('en-IN')}</Row>
            <Row label="Payment Mode">{PM_LABELS[paymentMode] || paymentMode}</Row>
            {paymentRef && <Row label="Reference">{paymentRef}</Row>}
          </div>
        )}
      </div>

      {/* Kind items */}
      {kindItems.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-blue-50">
            <Package className="h-4 w-4 text-blue-600" />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Kind Donations ({kindItems.length} item{kindItems.length > 1 ? 's' : ''})</p>
          </div>
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-50">
                {['Item', 'Qty', 'Department', 'Est. Value'].map((h) => (
                  <th key={h} className="table-th text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {kindItems.map((item, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="table-td font-medium text-gray-900">{item.product?.name || '—'}</td>
                  <td className="table-td">{item.quantity} {item.unit?.symbol || ''}</td>
                  <td className="table-td text-gray-500">{item.department?.name || '—'}</td>
                  <td className="table-td text-right font-semibold">
                    {item.estimatedValue > 0 ? `₹${item.estimatedValue.toLocaleString('en-IN')}` : '—'}
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-semibold">
                <td className="table-td" colSpan={3}>Kind Donation Total</td>
                <td className="table-td text-right">₹{kindTotal.toLocaleString('en-IN')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Notes + meta */}
      {(notes || createdBy) && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-0">
          {notes && <Row label="Notes">{notes}</Row>}
          {receivedBy?.name && <Row label="Received By">{receivedBy.name}</Row>}
        </div>
      )}

      {/* Void info */}
      {isVoided && vr && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700"><span className="font-semibold">Void reason:</span> {vr}</p>
        </div>
      )}

      <Modal open={showVoid} onClose={() => setShowVoid(false)} title="Void Donation" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Void <strong>{donationNumber}</strong>? This cannot be undone.</p>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Reason</label>
            <input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} className="input" placeholder="e.g. Entered by mistake" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowVoid(false)} className="btn-secondary">Cancel</button>
            <button onClick={() => voidMut.mutate()} disabled={voidMut.isPending} className="btn-danger">
              {voidMut.isPending ? 'Voiding…' : 'Yes, Void'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DonationDetail;
