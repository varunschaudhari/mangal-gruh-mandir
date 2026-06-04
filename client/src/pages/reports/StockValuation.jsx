import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { TrendingUp, FileText, Sheet, Download } from 'lucide-react';
import { getValuationReport, downloadValuationPDF, downloadValuationExcel } from '../../api/report.api.js';
import { getDepartments } from '../../api/department.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import toast from 'react-hot-toast';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const StockValuation = () => {
  const [deptId, setDeptId] = useState('');

  const { data: deptsRes } = useQuery({ queryKey: ['departments'], queryFn: () => getDepartments() });
  const departments = deptsRes?.data?.data || [];

  const params = { ...(deptId && { department: deptId }) };

  const { data, isLoading } = useQuery({
    queryKey: ['valuation-report', deptId],
    queryFn: () => getValuationReport(params),
  });

  const result     = data?.data?.data;
  const rows       = result?.rows || [];
  const grandTotal = result?.grandTotal || 0;

  const pdfMut = useMutation({
    mutationFn: () => downloadValuationPDF(params),
    onError: () => toast.error('PDF export failed'),
  });

  const excelMut = useMutation({
    mutationFn: () => downloadValuationExcel(params),
    onError: () => toast.error('Excel export failed'),
  });

  const withValue    = rows.filter((r) => r.totalValue > 0);
  const withoutRate  = rows.filter((r) => r.totalValue === 0 && r.quantity > 0);
  const totalItems   = rows.length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock Valuation"
        subtitle="Current stock × last purchase rate"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Stock Valuation' }]}
        actions={
          rows.length > 0 && (
            <div className="flex gap-2">
              <button onClick={() => pdfMut.mutate()} disabled={pdfMut.isPending}
                className="btn btn-ghost text-sm flex items-center gap-1.5 border">
                <FileText className="h-4 w-4 text-red-500" />
                {pdfMut.isPending ? 'Generating…' : 'PDF'}
              </button>
              <button onClick={() => excelMut.mutate()} disabled={excelMut.isPending}
                className="btn btn-ghost text-sm flex items-center gap-1.5 border">
                <Sheet className="h-4 w-4 text-green-600" />
                {excelMut.isPending ? 'Generating…' : 'Excel'}
              </button>
            </div>
          )
        }
      />

      {/* Filter */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <select value={deptId} onChange={(e) => setDeptId(e.target.value)} className="input text-sm max-w-xs">
          <option value="">All Departments</option>
          {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
        </select>
        <span className="text-xs text-gray-400">Values based on last recorded purchase rate per product.</span>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : rows.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <TrendingUp className="h-10 w-10 mx-auto mb-3 text-gray-200" />
          <p>No stock data available.</p>
        </div>
      ) : (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card px-4 py-3 border-l-4 border-primary-500">
              <p className="text-xs text-gray-500">Total Value</p>
              <p className="text-xl font-bold text-primary-600">₹{fmt(grandTotal)}</p>
            </div>
            <div className="card px-4 py-3 border-l-4 border-blue-400">
              <p className="text-xs text-gray-500">Valued Items</p>
              <p className="text-xl font-bold text-blue-600">{withValue.length}</p>
            </div>
            <div className="card px-4 py-3 border-l-4 border-gray-300">
              <p className="text-xs text-gray-500">No Rate Data</p>
              <p className="text-xl font-bold text-gray-500">{withoutRate.length}</p>
            </div>
            <div className="card px-4 py-3 border-l-4 border-gray-300">
              <p className="text-xs text-gray-500">Total Rows</p>
              <p className="text-xl font-bold text-gray-700">{totalItems}</p>
            </div>
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="table-th">Product</th>
                    <th className="table-th">Department</th>
                    <th className="table-th text-right">Current Qty</th>
                    <th className="table-th text-right">Last Rate (₹)</th>
                    <th className="table-th text-right">Total Value (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r) => (
                    <tr key={r._id} className="hover:bg-gray-50">
                      <td className="table-td">
                        <p className="font-medium">{r.product?.name}</p>
                        <p className="text-xs text-gray-400 font-mono">{r.product?.code}</p>
                      </td>
                      <td className="table-td text-gray-600">{r.department?.name}</td>
                      <td className="table-td text-right font-semibold">
                        {r.quantity} <span className="text-xs text-gray-400">{r.product?.unit?.symbol}</span>
                      </td>
                      <td className="table-td text-right text-gray-600">
                        {r.lastRate > 0 ? `₹${fmt(r.lastRate)}` : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="table-td text-right">
                        {r.totalValue > 0
                          ? <span className="font-bold text-gray-900">₹{fmt(r.totalValue)}</span>
                          : <span className="text-gray-300 text-xs">No rate</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-primary-50 border-t-2 border-primary-200">
                    <td className="table-td font-bold text-primary-800" colSpan={4}>Grand Total</td>
                    <td className="table-td text-right font-black text-primary-700 text-base">₹{fmt(grandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default StockValuation;
