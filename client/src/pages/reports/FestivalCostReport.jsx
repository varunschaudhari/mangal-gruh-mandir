import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FlameKindling, Package, CreditCard, IndianRupee } from 'lucide-react';
import { getFestivalCostReport } from '../../api/report.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';

const fmt    = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtAmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const PM_LABELS = { cash: 'Cash', upi: 'UPI', neft: 'NEFT', rtgs: 'RTGS', cheque: 'Cheque' };

const FestivalCostReport = () => {
  const today = new Date().toISOString().split('T')[0];
  const [from, setFrom] = useState('');
  const [to,   setTo]   = useState(today);
  const [label, setLabel] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [params, setParams] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['festival-cost', params],
    queryFn: () => getFestivalCostReport(params),
    enabled: !!params,
  });

  const result = data?.data?.data;

  const handleRun = () => {
    setParams({ from: from || undefined, to: to || undefined });
    setSubmitted(true);
  };

  const rangeLabel = label ||
    (from && to ? `${fmt(from)} – ${fmt(to)}` :
     from ? `From ${fmt(from)}` :
     to   ? `Up to ${fmt(to)}`  : 'All Time');

  return (
    <div className="space-y-5">
      <PageHeader
        title="Festival Cost Report"
        subtitle="Stock consumed and payments made in a date range"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Festival Cost' }]}
      />

      {/* Filter Panel */}
      <div className="card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input text-sm" />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Festival Label (optional)</label>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Ganesh Chaturthi 2025"
              className="input text-sm w-full" />
          </div>
          <button onClick={handleRun} className="btn-primary text-sm">
            Generate Report
          </button>
        </div>
      </div>

      {isLoading && <PageLoader />}

      {result && (
        <>
          {/* Title */}
          <div className="rounded-xl bg-orange-50 border border-orange-200 px-5 py-3 flex items-center gap-3">
            <FlameKindling className="h-5 w-5 text-orange-600 shrink-0" />
            <div>
              <p className="font-bold text-orange-800">{rangeLabel}</p>
              <p className="text-xs text-orange-600">Festival Cost Analysis</p>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="card px-4 py-3 border-l-4 border-orange-500">
              <p className="text-xs text-gray-500">Items Consumed</p>
              <p className="text-2xl font-bold text-orange-700">{result.consumptionRows?.length || 0}</p>
              <p className="text-xs text-gray-400">unique products</p>
            </div>
            <div className="card px-4 py-3 border-l-4 border-amber-500">
              <p className="text-xs text-gray-500">Est. Consumption Value</p>
              <p className="text-xl font-bold text-amber-700">{fmtAmt(result.totalConsumption)}</p>
              <p className="text-xs text-gray-400">at last purchase price</p>
            </div>
            <div className="card px-4 py-3 border-l-4 border-blue-500">
              <p className="text-xs text-gray-500">Payments Made</p>
              <p className="text-2xl font-bold text-blue-700">{result.payments?.length || 0}</p>
              <p className="text-xs text-gray-400">approved vouchers</p>
            </div>
            <div className="card px-4 py-3 border-l-4 border-primary-500">
              <p className="text-xs text-gray-500">Total Payments</p>
              <p className="text-xl font-bold text-primary-700">{fmtAmt(result.totalPayments)}</p>
              <p className="text-xs text-gray-400">cash outflow</p>
            </div>
          </div>

          {/* Consumption Table */}
          {result.consumptionRows?.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b bg-orange-50 flex items-center gap-2">
                <Package className="h-4 w-4 text-orange-600" />
                <h3 className="text-sm font-semibold text-orange-800">Stock Consumed</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      {['Product', 'Code', 'Qty Used', 'Last Rate', 'Est. Value'].map((h) => (
                        <th key={h} className="table-th">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {result.consumptionRows.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50 text-sm">
                        <td className="table-td font-medium">{r.product?.name}</td>
                        <td className="table-td font-mono text-xs text-gray-400">{r.product?.code}</td>
                        <td className="table-td text-right">{r.totalQty} <span className="text-xs text-gray-400">{r.product?.unit?.symbol}</span></td>
                        <td className="table-td text-right text-gray-500">{r.lastRate > 0 ? fmtAmt(r.lastRate) : '—'}</td>
                        <td className="table-td text-right font-semibold text-amber-700">{r.estimatedValue > 0 ? fmtAmt(r.estimatedValue) : '—'}</td>
                      </tr>
                    ))}
                    <tr className="bg-amber-50 font-bold">
                      <td className="table-td" colSpan={4}>Total Estimated Consumption</td>
                      <td className="table-td text-right text-amber-800">{fmtAmt(result.totalConsumption)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Payments Table */}
          {result.payments?.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b bg-blue-50 flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-semibold text-blue-800">Payments Made</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      {['Voucher No.', 'Supplier', 'Date', 'Mode', 'Amount', 'Approved By'].map((h) => (
                        <th key={h} className="table-th">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {result.payments.map((p) => (
                      <tr key={p._id} className="hover:bg-gray-50 text-sm">
                        <td className="table-td font-mono text-xs">{p.paymentNumber}</td>
                        <td className="table-td font-medium">{p.supplier?.name}</td>
                        <td className="table-td text-gray-500">{fmt(p.paymentDate)}</td>
                        <td className="table-td text-gray-500">{PM_LABELS[p.paymentMode] || p.paymentMode}</td>
                        <td className="table-td text-right font-semibold text-primary-700">{fmtAmt(p.totalAmount)}</td>
                        <td className="table-td text-gray-500">{p.approvedBy?.name || '—'}</td>
                      </tr>
                    ))}
                    <tr className="bg-blue-50 font-bold">
                      <td className="table-td" colSpan={4}>Total Payments</td>
                      <td className="table-td text-right text-blue-800">{fmtAmt(result.totalPayments)}</td>
                      <td className="table-td" />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Grand Total */}
          <div className="rounded-xl bg-primary-50 border border-primary-200 px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IndianRupee className="h-5 w-5 text-primary-600" />
              <span className="font-bold text-primary-800">Grand Total (Payments + Consumption)</span>
            </div>
            <span className="text-2xl font-black text-primary-700">
              {fmtAmt((result.totalPayments || 0) + (result.totalConsumption || 0))}
            </span>
          </div>

          {result.consumptionRows?.length === 0 && result.payments?.length === 0 && submitted && (
            <div className="card p-10 text-center text-gray-400">No activity found for the selected period.</div>
          )}
        </>
      )}
    </div>
  );
};

export default FestivalCostReport;
