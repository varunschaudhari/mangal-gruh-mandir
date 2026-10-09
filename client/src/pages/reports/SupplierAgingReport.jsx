import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, CheckCircle2, HelpCircle } from 'lucide-react';
import { getSupplierAging } from '../../api/supplierPayment.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import MobileCard from '../../components/ui/MobileCard.jsx';

const fmtAmt = (n) =>
  n > 0
    ? `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
    : '—';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

const BUCKETS = [
  { key: 'current',  label: 'Current',    hint: 'Not yet overdue',   color: 'text-green-600',  bg: 'bg-green-50',  icon: CheckCircle2 },
  { key: 'd0_30',    label: '0–30 days',  hint: 'Overdue 0–30 days', color: 'text-yellow-600', bg: 'bg-yellow-50', icon: Clock },
  { key: 'd31_60',   label: '31–60 days', hint: 'Overdue 31–60 days',color: 'text-orange-600', bg: 'bg-orange-50', icon: AlertTriangle },
  { key: 'd60plus',  label: '60+ days',   hint: 'Overdue 60+ days',  color: 'text-red-600',    bg: 'bg-red-50',    icon: AlertTriangle },
  { key: 'noDate',   label: 'No Due Date',hint: 'No due date set',   color: 'text-gray-400',   bg: 'bg-gray-50',   icon: HelpCircle },
];

// Stacked bar segment colours, same order as BUCKETS.
const BAR_COLORS = { current: 'bg-green-400', d0_30: 'bg-yellow-400', d31_60: 'bg-orange-400', d60plus: 'bg-red-500', noDate: 'bg-gray-300' };

function AgingBar({ row }) {
  if (!row.total) return null;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
      {BUCKETS.map((b) => row[b.key] > 0 && (
        <div key={b.key} className={BAR_COLORS[b.key]} style={{ width: `${(row[b.key] / row.total) * 100}%` }} />
      ))}
    </div>
  );
}

function SummaryCard({ bucket, value }) {
  const Icon = bucket.icon;
  return (
    <div className={`rounded-xl border border-gray-100 px-3 sm:px-4 py-3 flex items-center gap-3 last:col-span-2 sm:last:col-span-1 ${bucket.bg}`}>
      <Icon className={`h-5 w-5 shrink-0 ${bucket.color}`} />
      <div>
        <p className="text-xs text-gray-500">{bucket.label}</p>
        <p className={`text-base font-bold ${value > 0 ? bucket.color : 'text-gray-300'}`}>{fmtAmt(value)}</p>
      </div>
    </div>
  );
}

export default function SupplierAgingReport() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['supplier-aging'],
    queryFn:  getSupplierAging,
    staleTime: 5 * 60 * 1000,
  });

  const result      = data?.data?.data;
  const rows        = result?.rows        || [];
  const grandTotal  = result?.grandTotal  || {};
  const asOf        = result?.asOf;

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Supplier Aging Report"
        subtitle={asOf ? `As of ${fmtDate(asOf)}` : 'Outstanding balances bucketed by overdue age'}
        breadcrumbs={[{ label: 'Reports' }, { label: 'Supplier Aging' }]}
      />

      {/* Grand total summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {BUCKETS.map((b) => (
          <SummaryCard key={b.key} bucket={b} value={grandTotal[b.key] || 0} />
        ))}
      </div>

      {/* Total outstanding highlight */}
      {grandTotal.total > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-gray-600">Total Outstanding <span className="hidden sm:inline">(all suppliers)</span></span>
          <span className="text-xl font-black text-primary-600">{fmtAmt(grandTotal.total)}</span>
        </div>
      )}

      {/* Per-supplier table */}
      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-400 text-sm">
          No outstanding balances found.
        </div>
      ) : (
        <>
        {/* Phones: one card per supplier with a stacked aging bar */}
        <div className="space-y-2.5 md:hidden">
          {rows.map((row) => {
            const worst =
              row.d60plus > 0 ? 'text-red-600' :
              row.d31_60  > 0 ? 'text-orange-600' :
              row.d0_30   > 0 ? 'text-yellow-600' : 'text-gray-900';
            return (
              <MobileCard
                key={row._id}
                onClick={() => navigate(`/masters/suppliers/${row._id}`)}
                title={row.name}
                aside={<span className={`text-base font-bold ${worst}`}>{fmtAmt(row.total)}</span>}
                fields={BUCKETS.filter((b) => row[b.key] > 0).map((b) => ({
                  label: b.label,
                  value: <span className={`font-medium ${b.color}`}>{fmtAmt(row[b.key])}</span>,
                }))}
                footer={<div className="w-full"><AgingBar row={row} /></div>}
              />
            );
          })}
        </div>

        <div className="hidden md:block bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="table-th text-left">Supplier</th>
                  {BUCKETS.map((b) => (
                    <th key={b.key} className="table-th text-right" title={b.hint}>
                      {b.label}
                    </th>
                  ))}
                  <th className="table-th text-right">Total Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((row) => {
                  const worstBucket =
                    row.d60plus > 0 ? 'text-red-600 font-bold' :
                    row.d31_60  > 0 ? 'text-orange-600 font-semibold' :
                    row.d0_30   > 0 ? 'text-yellow-600' : '';

                  return (
                    <tr key={row._id} className="hover:bg-gray-50">
                      <td className="table-td">
                        <Link
                          to={`/masters/suppliers/${row._id}`}
                          className="font-medium text-gray-900 hover:text-primary-600 transition-colors">
                          {row.name}
                        </Link>
                      </td>
                      <td className="table-td text-right text-sm text-green-600">{fmtAmt(row.current)}</td>
                      <td className="table-td text-right text-sm text-yellow-600">{fmtAmt(row.d0_30)}</td>
                      <td className="table-td text-right text-sm text-orange-600">{fmtAmt(row.d31_60)}</td>
                      <td className="table-td text-right text-sm text-red-600">{fmtAmt(row.d60plus)}</td>
                      <td className="table-td text-right text-sm text-gray-400">{fmtAmt(row.noDate)}</td>
                      <td className={`table-td text-right text-sm ${worstBucket}`}>
                        {fmtAmt(row.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Grand total footer */}
              <tfoot>
                <tr className="bg-gray-50 font-bold border-t-2 border-gray-200">
                  <td className="table-td text-sm">Grand Total</td>
                  <td className="table-td text-right text-sm text-green-700">{fmtAmt(grandTotal.current)}</td>
                  <td className="table-td text-right text-sm text-yellow-700">{fmtAmt(grandTotal.d0_30)}</td>
                  <td className="table-td text-right text-sm text-orange-700">{fmtAmt(grandTotal.d31_60)}</td>
                  <td className="table-td text-right text-sm text-red-700">{fmtAmt(grandTotal.d60plus)}</td>
                  <td className="table-td text-right text-sm text-gray-500">{fmtAmt(grandTotal.noDate)}</td>
                  <td className="table-td text-right text-sm text-primary-700">{fmtAmt(grandTotal.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
