import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Clock, CheckCircle2, XCircle, Banknote, FileDown } from 'lucide-react';
import { getExpenses } from '../../api/expense.api.js';
import api from '../../api/axios.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import SearchableSelect from '../../components/ui/SearchableSelect.jsx';
import { fDate, fCurrency } from '../../utils/formatters.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import toast from 'react-hot-toast';

const CATEGORY_LABELS = {
  electricity: 'Electricity', water: 'Water', salary: 'Salary',
  priest_fees: 'Priest Fees', maintenance: 'Maintenance', decoration: 'Decoration',
  printing: 'Printing & Stationery', miscellaneous: 'Miscellaneous',
};

const CATEGORIES = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }));

const PM_LABELS = { cash: 'Cash', upi: 'UPI', cheque: 'Cheque' };

const STATUS_OPTIONS = [
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved',         label: 'Approved' },
  { value: 'rejected',         label: 'Rejected' },
  { value: 'voided',           label: 'Voided' },
];

const STATUS_BADGES = {
  pending_approval: { label: 'Pending', icon: Clock,         cls: 'bg-yellow-100 text-yellow-700' },
  approved:         { label: 'Approved', icon: CheckCircle2, cls: 'bg-green-100 text-green-700'  },
  rejected:         { label: 'Rejected', icon: XCircle,      cls: 'bg-red-100 text-red-700'      },
  voided:           { label: 'Voided',   icon: XCircle,      cls: 'bg-gray-100 text-gray-500'    },
};

function StatusBadge({ status }) {
  const cfg  = STATUS_BADGES[status] || STATUS_BADGES.pending_approval;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      <Icon size={11} />{cfg.label}
    </span>
  );
}

const thisMonthFrom = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
};
const today = () => new Date().toISOString().split('T')[0];

export default function ExpenseList() {
  const { can } = usePermissions();

  const [from,        setFrom]       = useState(thisMonthFrom());
  const [to,          setTo]         = useState(today());
  const [category,    setCategory]   = useState('');
  const [status,      setStatus]     = useState('');
  const [exporting,   setExporting]  = useState(false);

  const exportPdf = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (from)     params.set('from',     from);
      if (to)       params.set('to',       to);
      if (category) params.set('category', category);
      if (status)   params.set('status',   status);
      const res  = await api.get(`/expenses/export/pdf?${params}`, { responseType: 'blob' });
      const url  = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href  = url;
      link.download = `Expenses-${from || 'all'}-to-${to || 'all'}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const { data: res, isLoading } = useQuery({
    queryKey: ['expenses', { from, to, category, status }],
    queryFn:  () => getExpenses({ from, to, category: category || undefined, status: status || undefined, limit: 200 }),
  });

  const expenses    = res?.data?.data?.expenses || [];
  const approvedSum = expenses.filter((e) => e.status === 'approved').reduce((s, e) => s + e.amount, 0);
  const pendingSum  = expenses.filter((e) => e.status === 'pending_approval').reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Expenses"
        breadcrumbs={[{ label: 'Expenses' }]}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={exportPdf}
              disabled={exporting}
              className="btn-secondary flex items-center gap-1.5 text-sm">
              <FileDown className="h-4 w-4" />
              {exporting ? 'Exporting…' : 'Export PDF'}
            </button>
            {can('payments:write') && (
              <Link to="/expenses/new" className="btn-primary flex items-center gap-2">
                <Plus className="h-4 w-4" /> New Expense
              </Link>
            )}
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Approved</p>
          <p className="text-xl font-bold text-green-600">{fCurrency(approvedSum)}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Pending</p>
          <p className="text-xl font-bold text-yellow-600">{fCurrency(pendingSum)}</p>
        </div>
        <div className="card p-4 text-center col-span-2 sm:col-span-1">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Entries</p>
          <p className="text-xl font-bold text-gray-900">{expenses.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Category</label>
          <SearchableSelect
            value={category}
            onChange={setCategory}
            options={CATEGORIES}
            placeholder="All categories"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Status</label>
          <SearchableSelect
            value={status}
            onChange={setStatus}
            options={STATUS_OPTIONS}
            placeholder="All statuses"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-gray-400">Loading…</div>
        ) : expenses.length === 0 ? (
          <div className="py-12 text-center">
            <Banknote className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No expenses found for the selected filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wide border-b bg-gray-50">
                  <th className="py-2 px-4 text-left font-semibold">No.</th>
                  <th className="py-2 px-4 text-left font-semibold">Date</th>
                  <th className="py-2 px-4 text-left font-semibold">Category</th>
                  <th className="py-2 px-4 text-left font-semibold">Description</th>
                  <th className="py-2 px-4 text-left font-semibold">Payee</th>
                  <th className="py-2 px-4 text-left font-semibold">Mode</th>
                  <th className="py-2 px-4 text-right font-semibold">Amount</th>
                  <th className="py-2 px-4 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {expenses.map((e) => (
                  <tr key={e._id} className="hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <Link to={`/expenses/${e._id}`} className="font-mono text-xs font-semibold text-primary-600 hover:underline">
                        {e.expenseNumber}
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-gray-600 whitespace-nowrap">{fDate(e.expenseDate)}</td>
                    <td className="py-3 px-4 text-gray-700 whitespace-nowrap">{CATEGORY_LABELS[e.category] || e.category}</td>
                    <td className="py-3 px-4 text-gray-700 max-w-[200px] truncate">{e.description}</td>
                    <td className="py-3 px-4 text-gray-500 whitespace-nowrap">{e.payee || '—'}</td>
                    <td className="py-3 px-4 text-gray-500 whitespace-nowrap">{PM_LABELS[e.paymentMode] || e.paymentMode}</td>
                    <td className="py-3 px-4 text-right font-semibold text-gray-800 whitespace-nowrap">{fCurrency(e.amount)}</td>
                    <td className="py-3 px-4"><StatusBadge status={e.status} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-orange-50">
                  <td colSpan={6} className="py-3 px-4 text-sm font-semibold text-gray-700 text-right">Approved Total</td>
                  <td className="py-3 px-4 text-right text-base font-bold text-gray-900">{fCurrency(approvedSum)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
