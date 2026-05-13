import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBalances } from '../../api/stockBalance.api.js';
import { getDepartments } from '../../api/department.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { AlertTriangle, PackageX, RefreshCw } from 'lucide-react';

const LowStockAlerts = () => {
  const [deptFilter, setDeptFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data: deptsRes } = useQuery({ queryKey: ['departments'], queryFn: getDepartments });
  const departments = deptsRes?.data?.data || [];

  const params = {
    lowStock: 'true',
    ...(deptFilter && { department: deptFilter }),
  };

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['balances', 'lowstock', params],
    queryFn: () => getBalances(params),
    staleTime: 0,
  });

  let alerts = data?.data?.data || [];

  if (search) {
    const q = search.toLowerCase();
    alerts = alerts.filter(
      (b) => b.product?.name?.toLowerCase().includes(q) || b.product?.code?.toLowerCase().includes(q)
    );
  }

  // Separate out-of-stock from low-stock
  const outOfStock = alerts.filter((b) => b.quantity === 0);
  const lowStock = alerts.filter((b) => b.quantity > 0);

  const AlertRow = ({ b }) => {
    const isOut = b.quantity === 0;
    const min = b.product?.minStockLevel || 0;
    const reorder = b.product?.reorderPoint || 0;

    return (
      <tr className={`hover:bg-gray-50 text-sm ${isOut ? 'bg-red-50' : 'bg-amber-50'}`}>
        <td className="table-td">
          <div className="font-medium">{b.product?.name}</div>
          <div className="text-xs text-gray-400 font-mono">{b.product?.code}</div>
        </td>
        <td className="table-td">{b.department?.name}</td>
        <td className="table-td text-right">
          <span className={`font-bold text-base ${isOut ? 'text-red-700' : 'text-amber-700'}`}>
            {b.quantity}
          </span>
          <span className="ml-1 text-xs text-gray-400">{b.product?.unit?.symbol}</span>
        </td>
        <td className="table-td text-right text-gray-500">{min || '—'}</td>
        <td className="table-td text-right text-gray-500">{reorder || '—'}</td>
        <td className="table-td">
          {isOut
            ? <Badge variant="danger" size="sm">Out of Stock</Badge>
            : <Badge variant="warning" size="sm">Low Stock</Badge>
          }
        </td>
      </tr>
    );
  };

  const TableSection = ({ title, icon: Icon, items, emptyMsg, headerClass }) => (
    items.length > 0 && (
      <div className="card overflow-hidden">
        <div className={`px-4 py-3 flex items-center gap-2 border-b ${headerClass}`}>
          <Icon className="h-4 w-4" />
          <h3 className="font-semibold text-sm">{title}</h3>
          <span className="text-xs opacity-70">({items.length})</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="table-th">Product</th>
                <th className="table-th">Department</th>
                <th className="table-th text-right">Current Qty</th>
                <th className="table-th text-right">Min Level</th>
                <th className="table-th text-right">Reorder Point</th>
                <th className="table-th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((b) => <AlertRow key={b._id} b={b} />)}
            </tbody>
          </table>
        </div>
      </div>
    )
  );

  return (
    <div>
      <PageHeader
        title="Low Stock Alerts"
        subtitle="Products that need restocking"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Low Stock Alerts' }]}
        actions={
          <button onClick={() => refetch()} disabled={isFetching} className="btn btn-ghost text-sm flex items-center gap-1">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      {/* Summary cards */}
      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
          <div className="card px-4 py-3 border-l-4 border-red-500">
            <p className="text-xs text-gray-500">Out of Stock</p>
            <p className="text-2xl font-bold text-red-600">{outOfStock.length}</p>
          </div>
          <div className="card px-4 py-3 border-l-4 border-amber-500">
            <p className="text-xs text-gray-500">Low Stock</p>
            <p className="text-2xl font-bold text-amber-600">{lowStock.length}</p>
          </div>
          <div className="card px-4 py-3 border-l-4 border-gray-300">
            <p className="text-xs text-gray-500">Total Alerts</p>
            <p className="text-2xl font-bold text-gray-700">{alerts.length}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product…"
          className="input text-sm w-48"
        />
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="input text-sm"
        >
          <option value="">All Departments</option>
          {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
        </select>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : alerts.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-green-500" />
            </div>
            <p className="font-medium text-gray-600">All stocked up!</p>
            <p className="text-sm">No products are below their minimum stock level.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <TableSection
            title="Out of Stock"
            icon={PackageX}
            items={outOfStock}
            headerClass="bg-red-50 text-red-700 border-red-100"
          />
          <TableSection
            title="Low Stock"
            icon={AlertTriangle}
            items={lowStock}
            headerClass="bg-amber-50 text-amber-700 border-amber-100"
          />
        </div>
      )}
    </div>
  );
};

export default LowStockAlerts;
