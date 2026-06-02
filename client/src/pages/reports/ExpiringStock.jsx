import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, Download } from 'lucide-react';
import { getExpiringBatches } from '../../api/stockBatch.api.js';
import { getDepartments } from '../../api/department.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { fDate } from '../../utils/formatters.js';
import { exportToExcel } from '../../utils/exportToExcel.js';

const DAY_OPTIONS = [7, 14, 30, 60, 90];

const daysUntil = (date) => {
  const diff = new Date(date) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const urgencyVariant = (days) => {
  if (days <= 0) return 'danger';
  if (days <= 7) return 'danger';
  if (days <= 14) return 'warning';
  return 'info';
};

const ExpiringStock = () => {
  const [days, setDays] = useState(30);
  const [department, setDepartment] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['expiring-batches', days, department],
    queryFn: () => getExpiringBatches({ days, department: department || undefined }),
  });

  const { data: deptsRes } = useQuery({ queryKey: ['departments'], queryFn: getDepartments });

  const batches = data?.data?.data || [];
  const departments = deptsRes?.data?.data || [];

  const expired = batches.filter((b) => daysUntil(b.expiryDate) <= 0);
  const expiring = batches.filter((b) => daysUntil(b.expiryDate) > 0);

  const handleExport = () => {
    const rows = batches.map((b) => {
      const d = daysUntil(b.expiryDate);
      return {
        'Product':       b.product?.name || '',
        'Code':          b.product?.code || '',
        'Department':    b.department?.name || '',
        'Batch Ref':     b.batchRef || '',
        'Remaining Qty': b.remainingQty,
        'Unit':          b.product?.unit?.symbol || '',
        'Expiry Date':   fDate(b.expiryDate),
        'Days Left':     d <= 0 ? `Expired ${Math.abs(d)}d ago` : `${d} days`,
        'Status':        d <= 0 ? 'Expired' : d <= 7 ? 'Critical' : d <= 14 ? 'Warning' : 'Expiring Soon',
      };
    });
    exportToExcel(rows, `Expiring_Stock_${days}days_${new Date().toISOString().split('T')[0]}`, 'Expiring Stock');
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Expiring Stock"
        subtitle="Batches nearing or past their expiry date"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Expiring Stock' }]}
        icon={<CalendarClock className="h-5 w-5 text-amber-500" />}
        actions={
          batches.length > 0 && (
            <button onClick={handleExport} className="btn btn-ghost text-sm flex items-center gap-1.5">
              <Download className="h-4 w-4" /> Export Excel
            </button>
          )
        }
      />

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Show expiring within:</span>
          <div className="flex gap-1">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  days === d ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        <select value={department} onChange={(e) => setDepartment(e.target.value)} className="input max-w-xs text-sm">
          <option value="">All departments</option>
          {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
        </select>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : batches.length === 0 ? (
        <div className="card p-8 text-center">
          <CalendarClock className="h-10 w-10 mx-auto mb-3 text-green-400" />
          <p className="text-sm text-gray-500">No batches expiring within {days} days.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {expired.length > 0 && (
            <Section title="Already Expired" count={expired.length} variant="danger" batches={expired} />
          )}
          {expiring.length > 0 && (
            <Section title={`Expiring within ${days} days`} count={expiring.length} variant="warning" batches={expiring} />
          )}
        </div>
      )}
    </div>
  );
};

const Section = ({ title, count, variant, batches }) => (
  <div className="card overflow-hidden">
    <div className={`px-4 py-3 border-b flex items-center gap-2 ${variant === 'danger' ? 'bg-red-50' : 'bg-amber-50'}`}>
      <AlertTriangle className={`h-4 w-4 ${variant === 'danger' ? 'text-red-500' : 'text-amber-500'}`} />
      <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      <Badge variant={variant} size="sm">{count}</Badge>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            {['Product', 'Dept', 'Batch Ref', 'Remaining', 'Expiry Date', 'Days Left'].map((h) => (
              <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {batches.map((b) => {
            const d = daysUntil(b.expiryDate);
            return (
              <tr key={b._id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <p className="font-medium">{b.product?.name}</p>
                  <p className="text-xs text-gray-400">{b.product?.code}</p>
                </td>
                <td className="px-4 py-2.5 text-gray-600">{b.department?.name}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{b.batchRef || '—'}</td>
                <td className="px-4 py-2.5 font-semibold">{b.remainingQty}</td>
                <td className="px-4 py-2.5">{fDate(b.expiryDate)}</td>
                <td className="px-4 py-2.5">
                  <Badge variant={urgencyVariant(d)} size="sm">
                    {d <= 0 ? `${Math.abs(d)}d ago` : `${d}d`}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);

export default ExpiringStock;
