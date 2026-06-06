import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, RefreshCw } from 'lucide-react';
import { getConsumptionTrend } from '../../api/report.api.js';
import { getDepartments } from '../../api/department.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';

const ConsumptionTrend = () => {
  const [deptFilter, setDeptFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data: deptsRes } = useQuery({ queryKey: ['departments'], queryFn: getDepartments });
  const departments = deptsRes?.data?.data || [];

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['consumption-trend', deptFilter],
    queryFn: () => getConsumptionTrend(deptFilter ? { department: deptFilter } : {}),
    staleTime: 5 * 60 * 1000,
  });

  const result     = data?.data?.data || {};
  let   rows       = result.rows       || [];
  const monthLabels = result.monthLabels || [];

  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter((r) => r.name?.toLowerCase().includes(q) || r.code?.toLowerCase().includes(q));
  }

  const maxQty = rows.reduce((m, r) => Math.max(m, r.total), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Consumption Trend"
        subtitle="Per-product stock-out quantity over the last 3 months"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Consumption Trend' }]}
        actions={
          <button onClick={() => refetch()} disabled={isFetching} className="btn btn-ghost text-sm flex items-center gap-1.5 border">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </button>
        }
      />

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
        <div className="card p-10 text-center text-gray-400">
          No stock-out activity in the last 3 months.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary-600" />
            <h3 className="text-sm font-semibold text-gray-700">Monthly Consumption by Product</h3>
            <span className="text-xs text-gray-400 ml-1">({rows.length} products)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="table-th w-52">Product</th>
                  {monthLabels.map((m) => (
                    <th key={m} className="table-th text-center w-28">{m}</th>
                  ))}
                  <th className="table-th text-right w-28">3-Month Total</th>
                  <th className="table-th w-36">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r) => {
                  const avg   = r.total / 3;
                  const last  = r.months[2]?.qty || 0;
                  const prev  = r.months[1]?.qty || 0;
                  const trend = last > prev ? 'up' : last < prev ? 'down' : 'flat';
                  const barW  = maxQty > 0 ? Math.max(4, Math.round((r.total / maxQty) * 100)) : 4;
                  return (
                    <tr key={r._id} className="hover:bg-gray-50 text-sm">
                      <td className="table-td">
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-gray-400 font-mono">{r.code}</div>
                      </td>
                      {r.months.map((m, i) => (
                        <td key={i} className="table-td text-center">
                          {m.qty > 0 ? (
                            <span className="font-semibold text-gray-800">{m.qty.toFixed(m.qty % 1 === 0 ? 0 : 2)}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                          {m.qty > 0 && <span className="ml-0.5 text-xs text-gray-400">{r.unit}</span>}
                        </td>
                      ))}
                      <td className="table-td text-right font-bold text-primary-700">
                        {r.total.toFixed(r.total % 1 === 0 ? 0 : 2)} <span className="text-xs font-normal text-gray-400">{r.unit}</span>
                      </td>
                      <td className="table-td">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-2">
                            <div
                              className="h-2 rounded-full bg-primary-500"
                              style={{ width: `${barW}%` }}
                            />
                          </div>
                          <span className={`text-xs font-semibold ${
                            trend === 'up'   ? 'text-red-600' :
                            trend === 'down' ? 'text-green-600' : 'text-gray-400'
                          }`}>
                            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
                            {avg > 0 ? ` ${avg.toFixed(1)}/mo` : ''}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConsumptionTrend;
