import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp, TrendingDown, IndianRupee, Heart, Receipt, Clock, FileDown, Settings2,
} from 'lucide-react';
import { getPnL, getPnLTrend, exportPnLPdf } from '../../api/pnl.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { fCurrency } from '../../utils/formatters.js';
import toast from 'react-hot-toast';

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const SHORT_MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const now = new Date();

function BudgetBar({ actual, budget }) {
  if (!budget) return <span className="text-gray-400 text-xs">No budget set</span>;
  const pct = Math.min((actual / budget) * 100, 100);
  const over = actual > budget;
  const warn = pct >= 80 && !over;
  const barColor = over ? 'bg-red-500' : warn ? 'bg-amber-400' : 'bg-green-500';
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-medium shrink-0 ${over ? 'text-red-600' : warn ? 'text-amber-600' : 'text-gray-600'}`}>
        {Math.round((actual / budget) * 100)}%
      </span>
    </div>
  );
}

export default function MonthlyPnL() {
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [exporting, setExporting] = useState(false);

  const { data: pnlRes, isLoading } = useQuery({
    queryKey: ['pnl', year, month],
    queryFn:  () => getPnL({ year, month }),
    staleTime: 2 * 60 * 1000,
  });

  const { data: trendRes } = useQuery({
    queryKey: ['pnl-trend', year],
    queryFn:  () => getPnLTrend({ year }),
    staleTime: 5 * 60 * 1000,
  });

  const pnl   = pnlRes?.data?.data;
  const trend = (trendRes?.data?.data?.trend || []).map((t) => ({
    name:     SHORT_MONTHS[t.month],
    Income:   t.income,
    Expenses: t.expenses,
  }));

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportPnLPdf({ year, month });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a   = document.createElement('a');
      a.href = url; a.download = `PnL-${year}-${String(month).padStart(2, '0')}.pdf`;
      a.click(); URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to export PDF');
    } finally {
      setExporting(false);
    }
  };

  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Monthly P&L"
        subtitle="Income vs Expense financial summary"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Monthly P&L' }]}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/expenses/budget" className="btn-secondary flex items-center gap-1.5 text-sm">
              <Settings2 className="h-4 w-4" /> Set Budgets
            </Link>
            <button onClick={handleExport} disabled={exporting || !pnl} className="btn-primary flex items-center gap-1.5 text-sm">
              <FileDown className="h-4 w-4" />
              {exporting ? 'Exporting…' : 'Export PDF'}
            </button>
          </div>
        }
      />

      {/* Month / Year picker */}
      <div className="flex items-center gap-3">
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input w-36">
          {MONTH_NAMES.slice(1).map((n, i) => (
            <option key={i + 1} value={i + 1}>{n}</option>
          ))}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input w-24">
          {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {isLoading ? <PageLoader /> : !pnl ? null : (
        <>
          {/* ── Net Balance banner ── */}
          {(() => {
            const surplus = pnl.net >= 0;
            return (
              <div className={`rounded-xl border-2 px-6 py-4 flex items-center justify-between ${
                surplus ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'
              }`}>
                <div>
                  <p className={`text-xs font-semibold uppercase tracking-wide ${surplus ? 'text-green-700' : 'text-red-700'}`}>
                    {surplus ? 'Surplus' : 'Deficit'} — {MONTH_NAMES[month]} {year}
                  </p>
                  <p className={`text-3xl font-bold mt-0.5 ${surplus ? 'text-green-700' : 'text-red-700'}`}>
                    {fCurrency(Math.abs(pnl.net))}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Total Income − Total Approved Expenses</p>
                </div>
                {surplus
                  ? <TrendingUp  className="h-12 w-12 text-green-400 shrink-0" />
                  : <TrendingDown className="h-12 w-12 text-red-400 shrink-0" />
                }
              </div>
            );
          })()}

          {/* ── Income + Expense summary cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card p-4 border-l-4 border-l-green-500">
              <div className="flex items-center gap-2 mb-2">
                <Heart className="h-4 w-4 text-green-600" />
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Income</p>
              </div>
              <p className="text-2xl font-bold text-green-700">{fCurrency(pnl.income.total)}</p>
              <div className="mt-2 space-y-1 text-xs text-gray-500">
                <div className="flex justify-between"><span>Cash donations</span><span className="font-medium">{fCurrency(pnl.income.cash)}</span></div>
                <div className="flex justify-between"><span>Kind donations</span><span className="font-medium">{fCurrency(pnl.income.kind)}</span></div>
                <div className="text-gray-400">{pnl.income.donationCount} donation entries</div>
              </div>
            </div>

            <div className="card p-4 border-l-4 border-l-orange-500">
              <div className="flex items-center gap-2 mb-2">
                <Receipt className="h-4 w-4 text-orange-600" />
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Expenses</p>
              </div>
              <p className="text-2xl font-bold text-orange-700">{fCurrency(pnl.expenses.total)}</p>
              <div className="mt-2 space-y-1 text-xs text-gray-500">
                {pnl.expenses.budgetTotal > 0 && (
                  <div className="flex justify-between"><span>Budget set</span><span className="font-medium">{fCurrency(pnl.expenses.budgetTotal)}</span></div>
                )}
                <div className="flex justify-between text-amber-600">
                  <span>Pending approval</span>
                  <span className="font-medium">{fCurrency(pnl.expenses.pendingAmount)}</span>
                </div>
                <div className="text-gray-400">{pnl.expenses.pendingCount} awaiting approval</div>
              </div>
            </div>

            <div className="card p-4 border-l-4 border-l-blue-500">
              <div className="flex items-center gap-2 mb-2">
                <IndianRupee className="h-4 w-4 text-blue-600" />
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Expense Coverage</p>
              </div>
              {pnl.income.total > 0 ? (
                <>
                  <p className="text-2xl font-bold text-blue-700">
                    {Math.round((pnl.expenses.total / pnl.income.total) * 100)}%
                  </p>
                  <p className="text-xs text-gray-500 mt-1">of income spent on expenses</p>
                  <div className="mt-2 bg-gray-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-blue-500"
                      style={{ width: `${Math.min((pnl.expenses.total / pnl.income.total) * 100, 100)}%` }}
                    />
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-400 mt-2">No income recorded</p>
              )}
            </div>
          </div>

          {/* ── Category breakdown ── */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Expense Breakdown by Category</h3>
              <Link to="/expenses/budget" className="text-xs text-primary-600 hover:underline flex items-center gap-1">
                <Settings2 className="h-3 w-3" /> Edit budgets
              </Link>
            </div>
            <div className="divide-y divide-gray-50">
              <div className="grid grid-cols-12 px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <span className="col-span-3">Category</span>
                <span className="col-span-2 text-right">Budget</span>
                <span className="col-span-2 text-right">Actual</span>
                <span className="col-span-2 text-right">Variance</span>
                <span className="col-span-3 pl-4">Usage</span>
              </div>
              {pnl.expenses.byCategory.map((row) => {
                const variance = row.budget > 0 ? row.budget - row.actual : null;
                const varColor = variance === null ? 'text-gray-400' : (variance >= 0 ? 'text-green-600' : 'text-red-600');
                return (
                  <div key={row.category} className="grid grid-cols-12 px-4 py-2.5 items-center text-sm hover:bg-gray-50">
                    <span className="col-span-3 font-medium text-gray-700">{row.label}</span>
                    <span className="col-span-2 text-right text-gray-500 text-xs">{row.budget > 0 ? fCurrency(row.budget) : '—'}</span>
                    <span className="col-span-2 text-right font-semibold text-gray-800">{row.actual > 0 ? fCurrency(row.actual) : '—'}</span>
                    <span className={`col-span-2 text-right text-xs font-medium ${varColor}`}>
                      {variance === null ? '—' : (variance >= 0 ? `-${fCurrency(variance)}` : `+${fCurrency(Math.abs(variance))}`)}
                    </span>
                    <div className="col-span-3 pl-4">
                      <BudgetBar actual={row.actual} budget={row.budget} />
                    </div>
                  </div>
                );
              })}
              {/* Total row */}
              <div className="grid grid-cols-12 px-4 py-2.5 bg-orange-50 text-sm font-semibold">
                <span className="col-span-3 text-orange-700">Total</span>
                <span className="col-span-2 text-right text-gray-600 text-xs">
                  {pnl.expenses.budgetTotal > 0 ? fCurrency(pnl.expenses.budgetTotal) : '—'}
                </span>
                <span className="col-span-2 text-right text-orange-700">{fCurrency(pnl.expenses.total)}</span>
                <span className={`col-span-2 text-right text-xs ${
                  pnl.expenses.budgetTotal > 0
                    ? (pnl.expenses.budgetTotal - pnl.expenses.total >= 0 ? 'text-green-600' : 'text-red-600')
                    : 'text-gray-400'
                }`}>
                  {pnl.expenses.budgetTotal > 0
                    ? (pnl.expenses.budgetTotal - pnl.expenses.total >= 0
                        ? `-${fCurrency(pnl.expenses.budgetTotal - pnl.expenses.total)}`
                        : `+${fCurrency(Math.abs(pnl.expenses.budgetTotal - pnl.expenses.total))}`)
                    : '—'}
                </span>
                <span className="col-span-3" />
              </div>
            </div>
          </div>

          {/* ── Pending approvals notice ── */}
          {pnl.expenses.pendingCount > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-3">
              <Clock className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-800">
                <span className="font-semibold">{pnl.expenses.pendingCount} expense{pnl.expenses.pendingCount > 1 ? 's' : ''}</span> ({fCurrency(pnl.expenses.pendingAmount)}) are pending approval and excluded from totals.{' '}
                <Link to="/expenses?status=pending_approval" className="underline">Review now →</Link>
              </p>
            </div>
          )}
        </>
      )}

      {/* ── 12-Month Trend ── */}
      {trend.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-primary-600" />
            <h3 className="text-sm font-semibold text-gray-700">{year} Monthly Trend — Income vs Expenses</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trend} barGap={2} barSize={16}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={60}
                tickFormatter={(v) => v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`} />
              <Tooltip formatter={(v) => fCurrency(v)} cursor={{ fill: '#f9fafb' }} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Bar dataKey="Income"   fill="#16a34a" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Expenses" fill="#ea580c" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
