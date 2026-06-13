import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Save, Settings2 } from 'lucide-react';
import { getBudgets, upsertBudgets, copyPrevBudgets } from '../../api/budget.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { fCurrency } from '../../utils/formatters.js';
import toast from 'react-hot-toast';

const CATEGORIES = [
  { value: 'electricity',   label: 'Electricity',          icon: '⚡' },
  { value: 'water',         label: 'Water',                icon: '💧' },
  { value: 'salary',        label: 'Salary',               icon: '👤' },
  { value: 'priest_fees',   label: 'Priest Fees',          icon: '🙏' },
  { value: 'maintenance',   label: 'Maintenance',          icon: '🔧' },
  { value: 'decoration',    label: 'Decoration',           icon: '🌸' },
  { value: 'printing',      label: 'Printing & Stationery', icon: '🖨️' },
  { value: 'miscellaneous', label: 'Miscellaneous',        icon: '📦' },
];

const now = new Date();

export default function BudgetManager() {
  const qc = useQueryClient();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [values, setValues] = useState({});

  const { data: budgetRes, isLoading } = useQuery({
    queryKey: ['budgets', year, month],
    queryFn:  () => getBudgets({ year, month }),
  });

  useEffect(() => {
    const budgets = budgetRes?.data?.data?.budgets || [];
    const map = {};
    budgets.forEach((b) => { map[b.category] = b.budgetAmount === 0 ? '' : String(b.budgetAmount); });
    CATEGORIES.forEach(({ value }) => { if (map[value] === undefined) map[value] = ''; });
    setValues(map);
  }, [budgetRes]);

  const saveMut = useMutation({
    mutationFn: () => {
      const budgets = {};
      CATEGORIES.forEach(({ value }) => { budgets[value] = Number(values[value]) || 0; });
      return upsertBudgets({ year, month, budgets });
    },
    onSuccess: () => {
      toast.success('Budgets saved');
      qc.invalidateQueries({ queryKey: ['budgets'] });
      qc.invalidateQueries({ queryKey: ['pnl'] });
    },
    onError: () => toast.error('Failed to save budgets'),
  });

  const handleCopyPrev = async () => {
    try {
      const res = await copyPrevBudgets({ year, month });
      const prev = res.data?.data?.budgets || [];
      const map = {};
      prev.forEach((b) => { map[b.category] = b.budgetAmount === 0 ? '' : String(b.budgetAmount); });
      CATEGORIES.forEach(({ value }) => { if (map[value] === undefined) map[value] = ''; });
      setValues(map);
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear  = month === 1 ? year - 1 : year;
      toast.success(`Copied from ${prevMonth}/${prevYear} — remember to save`);
    } catch {
      toast.error('No previous month data found');
    }
  };

  const total = CATEGORIES.reduce((s, { value }) => s + (Number(values[value]) || 0), 0);

  const MONTH_NAMES = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <div className="max-w-xl space-y-4">
      <PageHeader
        title="Set Monthly Budgets"
        subtitle="Set spending limits per category to track variance in the P&L report"
        breadcrumbs={[{ label: 'Expenses', to: '/expenses' }, { label: 'Budgets' }]}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={handleCopyPrev} className="btn-secondary flex items-center gap-1.5 text-sm">
              <Copy className="h-3.5 w-3.5" /> Copy last month
            </button>
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="btn-primary flex items-center gap-1.5 text-sm">
              <Save className="h-3.5 w-3.5" />
              {saveMut.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        }
      />

      {/* Month/Year picker */}
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

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700">
            Budget for {MONTH_NAMES[month]} {year}
          </h3>
        </div>

        {isLoading ? (
          <div className="p-6 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {CATEGORIES.map(({ value, label, icon }) => (
              <div key={value} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                <div className="flex items-center gap-3 w-48">
                  <span className="text-base">{icon}</span>
                  <span className="text-sm font-medium text-gray-700">{label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-sm">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={values[value] ?? ''}
                    onChange={(e) => setValues((prev) => ({ ...prev, [value]: e.target.value }))}
                    className="input w-36 text-right font-mono"
                    placeholder="0"
                  />
                </div>
              </div>
            ))}

            {/* Total row */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
              <span className="text-sm font-semibold text-gray-700">Total Budget</span>
              <span className="text-sm font-bold text-gray-900 pr-1">{fCurrency(total)}</span>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Budgets are used in the{' '}
        <a href="/reports/pnl" className="text-primary-600 hover:underline">Monthly P&L report</a>{' '}
        to show variance and usage per category. Expenses pending approval are not counted.
      </p>
    </div>
  );
}
