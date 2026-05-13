import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBalances } from '../../api/stockBalance.api.js';
import { getDepartments } from '../../api/department.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { fDate } from '../../utils/formatters.js';

const CurrentStock = () => {
  const [deptFilter, setDeptFilter] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [search, setSearch] = useState('');

  const { data: deptsRes } = useQuery({ queryKey: ['departments'], queryFn: getDepartments });
  const departments = deptsRes?.data?.data || [];

  const params = {
    ...(deptFilter && { department: deptFilter }),
    ...(lowStockOnly && { lowStock: 'true' }),
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['balances', params],
    queryFn: () => getBalances(params),
    staleTime: 30000,
  });

  let balances = data?.data?.data || [];

  if (search) {
    const q = search.toLowerCase();
    balances = balances.filter(
      (b) => b.product?.name?.toLowerCase().includes(q) || b.product?.code?.toLowerCase().includes(q)
    );
  }

  // Group by department
  const grouped = {};
  for (const b of balances) {
    const deptName = b.department?.name || 'Unknown';
    if (!grouped[deptName]) grouped[deptName] = [];
    grouped[deptName].push(b);
  }

  return (
    <div>
      <PageHeader
        title="Current Stock"
        subtitle="Live stock levels across all departments"
        breadcrumbs={[{ label: 'Inventory' }, { label: 'Current Stock' }]}
        actions={
          <button onClick={() => refetch()} className="btn btn-ghost text-sm">Refresh</button>
        }
      />

      {/* Filters */}
      <div className="card p-4 mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product…"
          className="input text-sm w-48"
        />
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="input text-sm">
          <option value="">All Departments</option>
          {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => setLowStockOnly(e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span className="text-red-600 font-medium">Low stock only</span>
        </label>
        <span className="ml-auto text-sm text-gray-400">{balances.length} items</span>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : balances.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">No stock records found.</div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([deptName, items]) => (
            <div key={deptName} className="card overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                <h3 className="font-semibold text-sm text-gray-700">{deptName}</h3>
                <span className="text-xs text-gray-400">({items.length} products)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="table-th">Product</th>
                      <th className="table-th">Code</th>
                      <th className="table-th text-right">Quantity</th>
                      <th className="table-th text-right">Min Level</th>
                      <th className="table-th">Status</th>
                      <th className="table-th">Last Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {items.map((b) => {
                      const min = b.product?.minStockLevel || 0;
                      const isLow = b.quantity <= min && min > 0;
                      const isOut = b.quantity === 0;
                      return (
                        <tr key={b._id} className={`hover:bg-gray-50 ${isOut ? 'bg-red-50' : isLow ? 'bg-amber-50' : ''}`}>
                          <td className="table-td font-medium text-sm">{b.product?.name}</td>
                          <td className="table-td font-mono text-xs text-gray-500">{b.product?.code}</td>
                          <td className="table-td text-right text-sm font-bold">
                            {b.quantity} <span className="text-gray-400 font-normal text-xs">{b.product?.unit?.symbol}</span>
                          </td>
                          <td className="table-td text-right text-sm text-gray-500">{min || '—'}</td>
                          <td className="table-td">
                            {isOut
                              ? <Badge variant="danger" size="sm">Out of Stock</Badge>
                              : isLow
                                ? <Badge variant="warning" size="sm">Low Stock</Badge>
                                : <Badge variant="success" size="sm">OK</Badge>
                            }
                          </td>
                          <td className="table-td text-xs text-gray-400">
                            {b.lastTransactionDate ? fDate(b.lastTransactionDate) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CurrentStock;
