import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { ArrowLeft, AlertTriangle, Package, CheckCircle2, Clock, IndianRupee, QrCode, Layers } from 'lucide-react';
import { getAsset } from '../../api/asset.api.js';
import { getAssetTransactions } from '../../api/assetTransaction.api.js';
import { printAssetLabels } from '../../utils/assetLabel.js';
import AssetLabelModal from '../../components/assets/AssetLabelModal.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';

const STATUS_COLORS = { approved: 'blue', checked_out: 'green', returned: 'gray', overdue: 'red', cancelled: 'gray' };
const STATUS_LABELS = { approved: 'Approved', checked_out: 'Checked Out', returned: 'Returned', overdue: 'Overdue', cancelled: 'Cancelled' };
const col = createColumnHelper();

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const AssetHistory = () => {
  const { id }   = useParams();
  const navigate = useNavigate();
  const [showLabels, setShowLabels] = useState(false);

  const { data: assetRes, isLoading: assetLoading } = useQuery({
    queryKey: ['asset', id],
    queryFn: () => getAsset(id),
  });

  const { data: txnRes, isLoading: txnLoading } = useQuery({
    queryKey: ['asset-transactions-asset', id],
    queryFn: () => getAssetTransactions({ asset: id, limit: 200 }),
  });

  const asset  = assetRes?.data?.data;
  const result = txnRes?.data?.data;
  const txns   = result?.data || [];

  if (assetLoading) return <PageLoader />;

  // Stats
  const total      = txns.length;
  const returned   = txns.filter((t) => t.status === 'returned').length;
  const active     = txns.filter((t) => ['approved', 'checked_out', 'overdue'].includes(t.status)).length;
  const damaged    = txns.filter((t) => t.conditionAtReturn === 'damaged').length;
  const totalFines = txns.reduce((s, t) => s + (t.fineApplied ? (t.fineAmount || 0) : 0), 0);
  const avgDuration = returned > 0
    ? Math.round(txns.filter((t) => t.status === 'returned' && t.checkedOutAt && t.actualReturnDate)
        .reduce((s, t) => s + (new Date(t.actualReturnDate) - new Date(t.checkedOutAt)) / 86400000, 0) / returned * 10) / 10
    : 0;

  const columns = [
    col.accessor('transactionNumber', {
      header: 'Ref No.', size: 155,
      cell: (i) => (
        <button onClick={() => navigate(`/assets/borrows/${i.row.original._id}`)}
          className="font-mono text-xs font-bold text-primary-600 hover:underline">
          {i.getValue() || '—'}
        </button>
      ),
    }),
    col.accessor('borrower.name', {
      header: 'Borrower',
      cell: (i) => (
        <button
          onClick={() => navigate(`/assets/borrowers/${i.row.original.borrower?._id}?name=${encodeURIComponent(i.getValue())}`)}
          className="font-medium text-gray-900 hover:text-primary-600 hover:underline text-left">
          {i.getValue()}
        </button>
      ),
    }),
    col.accessor('quantityBorrowed', { header: 'Qty', size: 55, cell: (i) => <span className="font-semibold">{i.getValue()}</span> }),
    col.accessor('expectedReturnDate', { header: 'Due Date', size: 115, cell: (i) => <span className="text-sm text-gray-600">{fmt(i.getValue())}</span> }),
    col.accessor('lateDays', {
      header: 'Late', size: 75,
      cell: (i) => i.getValue() > 0
        ? <span className="text-red-600 font-semibold text-sm">{i.getValue()}d</span>
        : <span className="text-gray-400">—</span>,
    }),
    col.accessor('conditionAtReturn', {
      header: 'Returned As', size: 110,
      cell: (i) => {
        const v = i.getValue();
        if (!v) return <span className="text-gray-400">—</span>;
        const cls = v === 'good' ? 'bg-green-100 text-green-700' : v === 'fair' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
        return <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${cls}`}>{v}</span>;
      },
    }),
    col.accessor('fineAmount', {
      header: 'Fine', size: 90,
      cell: (i) => i.row.original.fineApplied
        ? <span className="text-amber-700 font-semibold">₹{i.getValue()}</span>
        : <span className="text-gray-400">—</span>,
    }),
    col.accessor('status', {
      header: 'Status', size: 115,
      cell: (i) => <Badge variant={STATUS_COLORS[i.getValue()]}>{STATUS_LABELS[i.getValue()]}</Badge>,
    }),
  ];

  return (
    <div className="space-y-5 max-w-5xl">
      <button onClick={() => navigate('/assets')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Asset List
      </button>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
          <Package className="h-6 w-6 text-purple-600" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">{asset?.name}</h1>
            {asset?.assetCode && (
              <span className="font-mono text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded">
                {asset.assetCode}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400">{asset?.category} · {asset?.totalQuantity} unit{asset?.totalQuantity > 1 ? 's' : ''} total</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {asset && (
            <>
              <Link to={`/assets/${id}/units`}
                className="btn-secondary flex items-center gap-2 text-sm">
                <Layers className="h-4 w-4" /> View Units
              </Link>
              <button onClick={() => setShowLabels(true)}
                className="btn-secondary flex items-center gap-2 text-sm">
                <QrCode className="h-4 w-4" /> Print Labels
              </button>
            </>
          )}
          {asset?.finePerDay > 0 && (
            <div className="text-right">
              <p className="text-xs text-gray-400">Fine/day</p>
              <p className="text-sm font-bold text-amber-700">₹{asset.finePerDay}</p>
            </div>
          )}
        </div>
      </div>

      {/* Stats strip */}
      <div className="bg-white rounded-xl border border-gray-100 grid grid-cols-3 sm:grid-cols-6 divide-x divide-gray-100 overflow-hidden">
        {[
          { label: 'Total Borrows',  value: total,              icon: Package,       color: 'text-gray-700' },
          { label: 'Returned',       value: returned,           icon: CheckCircle2,  color: 'text-green-600' },
          { label: 'Active Now',     value: active,             icon: Clock,         color: 'text-blue-600' },
          { label: 'Damages',        value: damaged,            icon: AlertTriangle, color: 'text-red-600' },
          { label: 'Avg Duration',   value: `${avgDuration}d`,  icon: Clock,         color: 'text-purple-600' },
          { label: 'Total Fines',    value: `₹${totalFines}`,  icon: IndianRupee,   color: 'text-amber-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="px-4 py-3 text-center">
            <p className={`text-xl font-black ${color}`}>{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={txns}
        loading={txnLoading}
        onRowClick={(row) => navigate(`/assets/borrows/${row._id}`)}
      />

      {showLabels && asset && (
        <AssetLabelModal asset={asset} onClose={() => setShowLabels(false)} />
      )}
    </div>
  );
};

export default AssetHistory;
