import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBalances } from '../../api/stockBalance.api.js';
import { getDepartments } from '../../api/department.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { fDate, localDateStr } from '../../utils/formatters.js';
import { exportToExcel } from '../../utils/exportToExcel.js';
import { Download, RefreshCw, Search } from 'lucide-react';
import { useT } from '../../i18n/index.jsx';

const CurrentStock = () => {
  const t = useT();
  const [deptFilter, setDeptFilter] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [search, setSearch] = useState('');

  const { data: deptsRes } = useQuery({ queryKey: ['departments'], queryFn: () => getDepartments() });
  const departments = deptsRes?.data?.data || [];

  const params = {
    ...(deptFilter && { department: deptFilter }),
    ...(lowStockOnly && { lowStock: 'true' }),
  };

  const handleExport = () => {
    const rows = balances.map((b) => ({
      'Department':    b.department?.name || '',
      'Product':       b.product?.name || '',
      'Code':          b.product?.code || '',
      'Category':      b.product?.category?.name || '',
      'Quantity':      b.quantity,
      'Unit':          b.product?.unit?.symbol || '',
      'Min Level':     b.product?.minStockLevel || '',
      'Reorder Point': b.product?.reorderPoint || '',
      'Status':        b.quantity === 0 ? 'Out of Stock' : (b.product?.minStockLevel && b.quantity <= b.product.minStockLevel ? 'Low Stock' : 'OK'),
      'Last Updated':  b.lastTransactionDate ? new Date(b.lastTransactionDate).toLocaleDateString('en-IN') : '',
    }));
    const dateStr = localDateStr();
    exportToExcel(rows, `Stock_Statement_${dateStr}`, 'Current Stock');
  };

  const { data, isLoading, isFetching, refetch } = useQuery({
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
    const deptName = b.department?.name || t('Unknown');
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
          <div className="flex gap-1 sm:gap-2">
            <button onClick={() => refetch()} className="btn btn-ghost text-sm px-2.5 sm:px-4" aria-label={t('Refresh')}>
              <RefreshCw className={`h-4 w-4 sm:hidden ${isFetching ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{t('Refresh')}</span>
            </button>
            {balances.length > 0 && (
              <button onClick={handleExport} className="btn btn-ghost text-sm flex items-center gap-1.5 px-2.5 sm:px-4">
                <Download className="h-4 w-4" /> <span className="sm:hidden">{t('Export')}</span><span className="hidden sm:inline">{t('Export Excel')}</span>
              </button>
            )}
          </div>
        }
      />

      {/* Filters */}
      <div className="card p-3 sm:p-4 mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-48">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 sm:hidden" />
          <input
            type="search"
            enterKeyHint="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Search product…')}
            className="input text-sm pl-9 sm:pl-3"
          />
        </div>
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="input text-sm flex-1 min-w-0 sm:flex-none">
          <option value="">{t('All Departments')}</option>
          {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
        </select>
        <label className="flex min-h-[44px] items-center gap-2 text-sm cursor-pointer select-none sm:min-h-0">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => setLowStockOnly(e.target.checked)}
            className="h-5 w-5 rounded sm:h-4 sm:w-4"
          />
          <span className="text-red-600 font-medium"><span className="sm:hidden">{t('Low only')}</span><span className="hidden sm:inline">{t('Low stock only')}</span></span>
        </label>
        <span className="hidden sm:inline ml-auto text-sm text-gray-400">{t('{n} items', { n: balances.length })}</span>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : balances.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">{t('No stock records found.')}</div>
      ) : (
        <div className="space-y-4">
          <p className="-mt-1 px-1 text-xs text-gray-400 sm:hidden">{t('{n} items', { n: balances.length })}</p>
          {Object.entries(grouped).map(([deptName, items]) => (
            <div key={deptName} className="card overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                <h3 className="font-semibold text-sm text-gray-700">{deptName}</h3>
                <span className="text-xs text-gray-400">({t('{n} products', { n: items.length })})</span>
              </div>

              {/* Phones: dense rows — name on the left, quantity big on the right */}
              <ul className="divide-y divide-gray-100 md:hidden">
                {items.map((b) => {
                  const min = b.product?.minStockLevel || 0;
                  const isLow = b.quantity <= min && min > 0;
                  const isOut = b.quantity === 0;
                  return (
                    <li key={b._id} className={`flex items-start justify-between gap-3 px-4 py-3 ${isOut ? 'bg-red-50' : isLow ? 'bg-amber-50' : ''}`}>
                      <div className="min-w-0">
                        <p className="text-[15px] font-medium text-gray-900 break-words">{b.product?.name}</p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          <span className="font-mono">{b.product?.code}</span>
                          {min > 0 && <> · {t('Min {n}', { n: min })}</>}
                          {b.lastTransactionDate && <> · {fDate(b.lastTransactionDate, 'dd MMM')}</>}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-lg font-bold leading-tight ${isOut ? 'text-red-600' : isLow ? 'text-amber-700' : 'text-gray-900'}`}>
                          {b.quantity} <span className="text-xs font-normal text-gray-400">{b.product?.unit?.symbol}</span>
                        </p>
                        {(isOut || isLow) && (
                          <p className={`text-[11px] font-semibold uppercase tracking-wide ${isOut ? 'text-red-600' : 'text-amber-700'}`}>
                            {isOut ? t('Out of stock') : t('Low stock')}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="table-th">{t('Product')}</th>
                      <th className="table-th">{t('Code')}</th>
                      <th className="table-th text-right">{t('Quantity')}</th>
                      <th className="table-th text-right">{t('Min Level')}</th>
                      <th className="table-th">{t('Status')}</th>
                      <th className="table-th">{t('Last Updated')}</th>
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
                              ? <Badge variant="danger" size="sm">{t('Out of Stock')}</Badge>
                              : isLow
                                ? <Badge variant="warning" size="sm">{t('Low Stock')}</Badge>
                                : <Badge variant="success" size="sm">{t('OK')}</Badge>
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
