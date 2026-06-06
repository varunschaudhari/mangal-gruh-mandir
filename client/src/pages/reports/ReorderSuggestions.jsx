import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShoppingCart, RefreshCw, Download } from 'lucide-react';
import { getReorderSuggestions } from '../../api/report.api.js';
import { getDepartments } from '../../api/department.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { exportToExcel } from '../../utils/exportToExcel.js';

const ALERT_CONFIG = {
  out_of_stock: { label: 'Out of Stock', variant: 'danger'  },
  low_stock:    { label: 'Low Stock',    variant: 'warning' },
  reorder:      { label: 'Reorder Soon', variant: 'info'    },
};

const ReorderSuggestions = () => {
  const [deptFilter, setDeptFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data: deptsRes } = useQuery({ queryKey: ['departments'], queryFn: getDepartments });
  const departments = deptsRes?.data?.data || [];

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['reorder-suggestions', deptFilter],
    queryFn: () => getReorderSuggestions(deptFilter ? { department: deptFilter } : {}),
    staleTime: 5 * 60 * 1000,
  });

  let rows = data?.data?.data || [];

  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter((r) => r.product?.name?.toLowerCase().includes(q) || r.product?.code?.toLowerCase().includes(q));
  }

  const handleExport = () => {
    const STATUS = { out_of_stock: 'Out of Stock', low_stock: 'Low Stock', reorder: 'Reorder Soon' };
    const exportRows = rows.map((r) => ({
      'Product':          r.product?.name || '',
      'Code':             r.product?.code || '',
      'Department':       r.department?.name || '',
      'Current Qty':      r.quantity,
      'Unit':             r.product?.unit?.symbol || '',
      'Min Level':        r.product?.minStockLevel || '',
      'Reorder Point':    r.product?.reorderPoint || '',
      'Status':           STATUS[r.alertLevel] || '',
      'Avg Monthly (3M)': r.avgMonthlyConsumption,
      'Suggested Order':  r.suggestedQty,
    }));
    exportToExcel(exportRows, `Reorder-Suggestions-${new Date().toISOString().split('T')[0]}`, 'Reorder Suggestions');
  };

  const criticalCount = rows.filter((r) => r.alertLevel === 'out_of_stock').length;
  const lowCount      = rows.filter((r) => r.alertLevel === 'low_stock').length;
  const reorderCount  = rows.filter((r) => r.alertLevel === 'reorder').length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reorder Suggestions"
        subtitle="Based on avg monthly consumption vs current stock"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Reorder Suggestions' }]}
        actions={
          <div className="flex gap-2">
            <button onClick={() => refetch()} disabled={isFetching} className="btn btn-ghost text-sm flex items-center gap-1.5 border">
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
            </button>
            {rows.length > 0 && (
              <button onClick={handleExport} className="btn btn-ghost text-sm flex items-center gap-1.5 border">
                <Download className="h-4 w-4 text-green-600" /> Excel
              </button>
            )}
          </div>
        }
      />

      {/* Summary */}
      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card px-4 py-3 border-l-4 border-red-500">
            <p className="text-xs text-gray-500">Out of Stock</p>
            <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
          </div>
          <div className="card px-4 py-3 border-l-4 border-amber-500">
            <p className="text-xs text-gray-500">Low Stock</p>
            <p className="text-2xl font-bold text-amber-600">{lowCount}</p>
          </div>
          <div className="card px-4 py-3 border-l-4 border-yellow-400">
            <p className="text-xs text-gray-500">Reorder Soon</p>
            <p className="text-2xl font-bold text-yellow-600">{reorderCount}</p>
          </div>
          <div className="card px-4 py-3 border-l-4 border-gray-300">
            <p className="text-xs text-gray-500">Total Items</p>
            <p className="text-2xl font-bold text-gray-700">{rows.length}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product…" className="input text-sm w-48"
        />
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="input text-sm">
          <option value="">All Departments</option>
          {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
        </select>
      </div>

      {isLoading ? <PageLoader /> : rows.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <ShoppingCart className="h-10 w-10 text-green-400" />
            <p className="font-medium text-gray-600">All stocked up!</p>
            <p className="text-sm">No items need reordering at this time.</p>
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-primary-600" />
            <h3 className="text-sm font-semibold text-gray-700">Items to Reorder</h3>
            <span className="text-xs text-gray-400">({rows.length})</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="table-th">Product</th>
                  <th className="table-th">Department</th>
                  <th className="table-th text-right">Current Qty</th>
                  <th className="table-th text-right">Min Level</th>
                  <th className="table-th text-right">Reorder Point</th>
                  <th className="table-th text-right">Avg/Month (3M)</th>
                  <th className="table-th text-right">Suggested Order</th>
                  <th className="table-th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r) => {
                  const cfg   = ALERT_CONFIG[r.alertLevel] || {};
                  const rowBg = r.alertLevel === 'out_of_stock' ? 'bg-red-50' :
                                r.alertLevel === 'low_stock'    ? 'bg-amber-50' : '';
                  return (
                    <tr key={`${r._id}-${r.department?._id}`} className={`hover:brightness-95 text-sm ${rowBg}`}>
                      <td className="table-td">
                        <div className="font-medium">{r.product?.name}</div>
                        <div className="text-xs text-gray-400 font-mono">{r.product?.code}</div>
                      </td>
                      <td className="table-td text-gray-600">{r.department?.name}</td>
                      <td className="table-td text-right">
                        <span className="font-bold text-base">{r.quantity}</span>
                        <span className="ml-1 text-xs text-gray-400">{r.product?.unit?.symbol}</span>
                      </td>
                      <td className="table-td text-right text-gray-500">{r.product?.minStockLevel || '—'}</td>
                      <td className="table-td text-right text-gray-500">{r.product?.reorderPoint || '—'}</td>
                      <td className="table-td text-right text-blue-700 font-medium">
                        {r.avgMonthlyConsumption > 0 ? r.avgMonthlyConsumption.toFixed(1) : <span className="text-gray-400">—</span>}
                        {r.avgMonthlyConsumption > 0 && <span className="ml-0.5 text-xs text-gray-400">{r.product?.unit?.symbol}</span>}
                      </td>
                      <td className="table-td text-right">
                        {r.suggestedQty > 0 ? (
                          <span className="font-bold text-primary-700 bg-primary-50 rounded px-2 py-0.5">
                            {r.suggestedQty.toFixed(r.suggestedQty % 1 === 0 ? 0 : 1)} {r.product?.unit?.symbol}
                          </span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="table-td">
                        <Badge variant={cfg.variant} size="sm">{cfg.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 bg-gray-50 border-t text-xs text-gray-400">
            Suggested order = enough stock to cover 2× avg monthly consumption above reorder point, based on last 3 months of stock-out data.
          </div>
        </div>
      )}
    </div>
  );
};

export default ReorderSuggestions;
