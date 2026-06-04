import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { ArrowLeft, AlertTriangle, User, Package, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { getAssetTransactions } from '../../api/assetTransaction.api.js';
import DataTable from '../../components/ui/DataTable.jsx';
import Badge from '../../components/ui/Badge.jsx';

const STATUS_COLORS = { approved: 'blue', checked_out: 'green', returned: 'gray', overdue: 'red', cancelled: 'gray' };
const STATUS_LABELS = { approved: 'Approved', checked_out: 'Checked Out', returned: 'Returned', overdue: 'Overdue', cancelled: 'Cancelled' };
const col = createColumnHelper();

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const BorrowerHistory = () => {
  const { userId }   = useParams();
  const navigate     = useNavigate();
  const [sp]         = useSearchParams();
  const nameFromUrl  = sp.get('name') || 'Staff Member';

  const { data, isLoading } = useQuery({
    queryKey: ['asset-transactions-borrower', userId],
    queryFn: () => getAssetTransactions({ borrower: userId, limit: 200 }),
  });

  const result = data?.data?.data;
  const txns   = result?.data || [];

  // Derive name from first transaction (more reliable than URL param)
  const borrowerName = txns[0]?.borrower?.name || nameFromUrl;

  // Stats
  const total     = txns.length;
  const returned  = txns.filter((t) => t.status === 'returned').length;
  const active    = txns.filter((t) => ['approved', 'checked_out', 'overdue'].includes(t.status)).length;
  const overdue   = txns.filter((t) => t.status === 'overdue').length;
  const late      = txns.filter((t) => t.status === 'returned' && t.lateDays > 0).length;
  const damaged   = txns.filter((t) => t.conditionAtReturn === 'damaged').length;

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
    col.accessor('asset.name', {
      header: 'Asset',
      cell: (i) => <span className="font-medium text-gray-900">{i.getValue()}</span>,
    }),
    col.accessor('asset.category', {
      header: 'Category', size: 120,
      cell: (i) => <span className="text-gray-500 text-sm">{i.getValue()}</span>,
    }),
    col.accessor('quantityBorrowed', { header: 'Qty', size: 55, cell: (i) => <span className="font-semibold">{i.getValue()}</span> }),
    col.accessor('expectedReturnDate', {
      header: 'Due Date', size: 115,
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
    col.accessor('lateDays', {
      header: 'Late Days', size: 90,
      cell: (i) => i.getValue() > 0
        ? <span className="text-red-600 font-semibold">{i.getValue()}d</span>
        : <span className="text-gray-400">—</span>,
    }),
    col.accessor('conditionAtReturn', {
      header: 'Condition', size: 100,
      cell: (i) => {
        const v = i.getValue();
        if (!v) return <span className="text-gray-400">—</span>;
        const cls = v === 'good' ? 'bg-green-100 text-green-700' : v === 'fair' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
        return <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${cls}`}>{v}</span>;
      },
    }),
    col.accessor('status', {
      header: 'Status', size: 115,
      cell: (i) => <Badge variant={STATUS_COLORS[i.getValue()]}>{STATUS_LABELS[i.getValue()]}</Badge>,
    }),
  ];

  return (
    <div className="space-y-5 max-w-5xl">
      <button onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
          <User className="h-6 w-6 text-purple-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{borrowerName}</h1>
          <p className="text-sm text-gray-400">Borrow History</p>
        </div>
      </div>

      {/* Stats strip */}
      <div className="bg-white rounded-xl border border-gray-100 grid grid-cols-3 sm:grid-cols-6 divide-x divide-gray-100 overflow-hidden">
        {[
          { label: 'Total Borrows',    value: total,    icon: Package,       color: 'text-gray-700' },
          { label: 'Returned',         value: returned, icon: CheckCircle2,  color: 'text-green-600' },
          { label: 'Currently Active', value: active,   icon: Clock,         color: 'text-blue-600' },
          { label: 'Overdue Now',      value: overdue,  icon: AlertTriangle, color: 'text-red-600' },
          { label: 'Late Returns',     value: late,     icon: AlertTriangle, color: 'text-amber-600' },
          { label: 'Damaged Items',    value: damaged,  icon: XCircle,       color: 'text-red-600' },
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
        loading={isLoading}
        onRowClick={(row) => navigate(`/assets/borrows/${row._id}`)}
      />
    </div>
  );
};

export default BorrowerHistory;
