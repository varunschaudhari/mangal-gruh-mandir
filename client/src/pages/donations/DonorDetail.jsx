import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { ArrowLeft, Heart, IndianRupee, Package, Printer, Download } from 'lucide-react';
import { getDonations, downloadDonorStatement } from '../../api/donation.api.js';
import { getSupplier } from '../../api/supplier.api.js';
import { printDonationReceipt } from '../../utils/donationReceipt.js';
import toast from 'react-hot-toast';
import DataTable from '../../components/ui/DataTable.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const TYPE_COLORS = { named: 'green', hundi: 'blue', anonymous: 'gray' };
const col = createColumnHelper();

const DonorDetail = () => {
  const { id }        = useParams();
  const navigate      = useNavigate();
  const [dlStatement, setDlStatement] = useState(false);

  const { data: supplierRes, isLoading: supplierLoading } = useQuery({
    queryKey: ['supplier', id],
    queryFn: () => getSupplier(id),
  });

  const { data: donationsRes, isLoading: donationsLoading } = useQuery({
    queryKey: ['donations-donor', id],
    queryFn: () => getDonations({ donor: id, limit: 200 }),
  });

  const donor     = supplierRes?.data?.data;
  const result    = donationsRes?.data?.data;
  const donations = result?.data || [];

  const handleDownloadStatement = async () => {
    setDlStatement(true);
    try {
      const res = await downloadDonorStatement(id);
      const url = URL.createObjectURL(res.data);
      const a   = document.createElement('a');
      a.href = url; a.download = `Donor-Statement-${donor?.name || id}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Failed to generate statement'); }
    finally { setDlStatement(false); }
  };

  if (supplierLoading) return <PageLoader />;

  const totalCash = donations.reduce((s, d) => s + (d.cashAmount || 0), 0);
  const totalKind = donations.reduce((s, d) => s + (d.kindItems || []).reduce((k, i) => k + (i.estimatedValue || 0), 0), 0);
  const totalDonations = donations.length;

  const columns = [
    col.accessor('donationNumber', {
      header: 'Receipt No.', size: 155,
      cell: (i) => (
        <button onClick={() => navigate(`/donations/${i.row.original._id}`)}
          className="font-mono text-xs font-bold text-primary-600 hover:underline">
          {i.getValue() || '—'}
        </button>
      ),
    }),
    col.accessor('date', { header: 'Date', size: 115, cell: (i) => <span className="text-sm text-gray-600">{fmt(i.getValue())}</span> }),
    col.accessor('occasion.name', { header: 'Occasion', cell: (i) => <span className="text-gray-500 text-sm">{i.getValue() || '—'}</span> }),
    col.accessor('cashAmount', {
      header: 'Cash', size: 100,
      cell: (i) => i.getValue() > 0 ? <span className="font-semibold text-green-700">₹{i.getValue().toLocaleString('en-IN')}</span> : <span className="text-gray-400">—</span>,
    }),
    col.accessor('kindItems', {
      header: 'Kind', size: 80,
      cell: (i) => i.getValue()?.length > 0 ? <span className="text-blue-600 font-semibold">{i.getValue().length} item{i.getValue().length > 1 ? 's' : ''}</span> : <span className="text-gray-400">—</span>,
    }),
    col.accessor('totalEstimatedValue', {
      header: 'Total', size: 110,
      cell: (i) => <span className="font-semibold text-gray-800">₹{(i.getValue() || 0).toLocaleString('en-IN')}</span>,
    }),
    col.display({
      id: 'actions', header: '', size: 60,
      cell: ({ row }) => row.original.donationType !== 'hundi' ? (
        <button onClick={() => printDonationReceipt(row.original)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded" title="Print receipt">
          <Printer className="h-4 w-4" />
        </button>
      ) : null,
    }),
  ];

  return (
    <div className="max-w-4xl space-y-5">
      <button onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
            <Heart className="h-6 w-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{donor?.name || 'Donor'}</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {donor?.phone && <span className="mr-3">{donor.phone}</span>}
              {donor?.panNumber && <span>PAN: {donor.panNumber}</span>}
            </p>
          </div>
        </div>
        {donations.length > 0 && (
          <button onClick={handleDownloadStatement} disabled={dlStatement}
            className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50 shrink-0">
            <Download className="h-4 w-4" />
            {dlStatement ? 'Generating…' : 'Download Statement'}
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="bg-white rounded-xl border border-gray-100 grid grid-cols-3 sm:grid-cols-4 divide-x divide-gray-100 overflow-hidden">
        {[
          { label: 'Total Donations',  value: totalDonations,                                       color: 'text-gray-700' },
          { label: 'Cash Donated',     value: `₹${totalCash.toLocaleString('en-IN')}`,              color: 'text-green-600' },
          { label: 'Kind Value (Est)', value: `₹${totalKind.toLocaleString('en-IN')}`,              color: 'text-blue-600' },
          { label: 'Total Value',      value: `₹${(totalCash + totalKind).toLocaleString('en-IN')}`,color: 'text-gray-800' },
        ].map(({ label, value, color }) => (
          <div key={label} className="px-4 py-3 text-center">
            <p className={`text-xl font-black ${color}`}>{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={donations}
        loading={donationsLoading}
        onRowClick={(row) => navigate(`/donations/${row._id}`)}
      />
    </div>
  );
};

export default DonorDetail;
