import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Clock, CheckCircle2, XCircle, Banknote, FileDown } from 'lucide-react';
import { getExpenses } from '../../api/expense.api.js';
import api from '../../api/axios.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import SearchableSelect from '../../components/ui/SearchableSelect.jsx';
import { fDate, fCurrency, localDateStr } from '../../utils/formatters.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { useIsMobile } from '../../hooks/useMediaQuery.js';
import MobileCard from '../../components/ui/MobileCard.jsx';
import toast from 'react-hot-toast';
import { saveFile } from '../../utils/fileSaver.js';
import haptics from '../../utils/haptics.js';
import { useT } from '../../i18n/index.jsx';

const CATEGORY_LABELS = {
  electricity: 'Electricity', water: 'Water', salary: 'Salary',
  priest_fees: 'Priest Fees', maintenance: 'Maintenance', decoration: 'Decoration',
  printing: 'Printing & Stationery', miscellaneous: 'Miscellaneous',
};

const CATEGORIES = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }));

const PM_LABELS = { cash: 'Cash', upi: 'UPI', cheque: 'Cheque', bank: 'Bank transfer' };

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
  const t    = useT();
  const cfg  = STATUS_BADGES[status] || STATUS_BADGES.pending_approval;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      <Icon size={11} />{t(cfg.label)}
    </span>
  );
}

const thisMonthFrom = () => {
  const d = new Date();
  return localDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
};
const today = () => localDateStr();

// Phone status filter: horizontally scrollable chips instead of a dropdown.
const STATUS_CHIPS = [{ value: '', label: 'All' }, ...STATUS_OPTIONS.map((o) => ({ ...o, label: STATUS_BADGES[o.value].label }))];

export default function ExpenseList() {
  const t = useT();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();

  const [from,        setFrom]       = useState(thisMonthFrom());
  const [to,          setTo]         = useState(today());
  const [category,    setCategory]   = useState('');
  // P&L / dashboard link here with ?status=pending_approval
  const [status,      setStatus]     = useState(searchParams.get('status') || '');
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
      await saveFile(new Blob([res.data], { type: 'application/pdf' }), `Expenses-${from || 'all'}-to-${to || 'all'}.pdf`);
    } catch {
      toast.error(t('Export failed'));
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
              className="btn-secondary flex items-center gap-1.5 text-sm px-3 sm:px-4"
              aria-label={t('Export PDF')}>
              <FileDown className="h-4 w-4" />
              <span className={exporting ? '' : 'hidden sm:inline'}>{exporting ? t('Exporting…') : t('Export PDF')}</span>
            </button>
            {can('payments:write') && (
              <Link to="/expenses/new" className="btn-primary flex items-center gap-2">
                <Plus className="h-4 w-4" /> {t('New Expense')}
              </Link>
            )}
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card p-3 sm:p-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{t('Approved')}</p>
          <p className="text-lg sm:text-xl font-bold text-green-600">{fCurrency(approvedSum)}</p>
        </div>
        <div className="card p-3 sm:p-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{t('Pending')}</p>
          <p className="text-lg sm:text-xl font-bold text-yellow-600">{fCurrency(pendingSum)}</p>
        </div>
        {/* Phones: a slim one-line row so the count doesn't take a whole tile row */}
        <div className="card px-4 py-2.5 sm:p-4 col-span-2 sm:col-span-1 flex items-center justify-between sm:block sm:text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide sm:mb-1">{t('Entries')}</p>
          <p className="text-base sm:text-xl font-bold text-gray-900">{expenses.length}</p>
        </div>
      </div>

      {/* Phones: status chips */}
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:hidden">
        <div className="flex w-max gap-1.5">
          {STATUS_CHIPS.map((c) => (
            <button
              key={c.value}
              onClick={() => { haptics.select(); setStatus(c.value); }}
              className={`whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
                status === c.value ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-600'
              }`}
            >
              {t(c.label)}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="card p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">{t('From')}</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">{t('To')}</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input text-sm" />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-semibold text-gray-500 mb-1">{t('Category')}</label>
          <SearchableSelect
            value={category}
            onChange={setCategory}
            options={CATEGORIES.map((c) => ({ ...c, label: t(c.label) }))}
            placeholder={t('All categories')}
          />
        </div>
        <div className="hidden md:block">
          <label className="block text-xs font-semibold text-gray-500 mb-1">{t('Status')}</label>
          <SearchableSelect
            value={status}
            onChange={setStatus}
            options={STATUS_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
            placeholder={t('All statuses')}
          />
        </div>
      </div>

      {isMobile ? (
        isLoading ? (
          <div className="card py-12 text-center text-gray-400">{t('Loading…')}</div>
        ) : expenses.length === 0 ? (
          <div className="card py-12 text-center">
            <Banknote className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">{t('No expenses found for the selected filters.')}</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {expenses.map((e) => (
              <MobileCard
                key={e._id}
                onClick={() => navigate(`/expenses/${e._id}`)}
                title={e.description}
                subtitle={<><span className="font-mono">{e.expenseNumber}</span> · {fDate(e.expenseDate)}</>}
                aside={
                  <div className="text-right">
                    <p className="whitespace-nowrap text-base font-bold text-gray-900">{fCurrency(e.amount)}</p>
                    <div className="mt-1"><StatusBadge status={e.status} /></div>
                  </div>
                }
                fields={[
                  { label: t('Category'), value: t(CATEGORY_LABELS[e.category]) || e.category },
                  { label: t('Payee'), value: e.payee },
                  { label: t('Mode'), value: t(PM_LABELS[e.paymentMode]) || e.paymentMode },
                ]}
              />
            ))}
            <div className="flex items-center justify-between rounded-xl border border-orange-100 bg-orange-50 px-4 py-3">
              <span className="text-sm font-semibold text-gray-700">{t('Approved Total')}</span>
              <span className="text-base font-bold text-gray-900">{fCurrency(approvedSum)}</span>
            </div>
          </div>
        )
      ) : (
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-gray-400">{t('Loading…')}</div>
        ) : expenses.length === 0 ? (
          <div className="py-12 text-center">
            <Banknote className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">{t('No expenses found for the selected filters.')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wide border-b bg-gray-50">
                  <th className="py-2 px-4 text-left font-semibold">{t('No.')}</th>
                  <th className="py-2 px-4 text-left font-semibold">{t('Date')}</th>
                  <th className="py-2 px-4 text-left font-semibold">{t('Category')}</th>
                  <th className="py-2 px-4 text-left font-semibold">{t('Description')}</th>
                  <th className="py-2 px-4 text-left font-semibold">{t('Payee')}</th>
                  <th className="py-2 px-4 text-left font-semibold">{t('Mode')}</th>
                  <th className="py-2 px-4 text-right font-semibold">{t('Amount')}</th>
                  <th className="py-2 px-4 text-left font-semibold">{t('Status')}</th>
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
                    <td className="py-3 px-4 text-gray-700 whitespace-nowrap">{t(CATEGORY_LABELS[e.category]) || e.category}</td>
                    <td className="py-3 px-4 text-gray-700 max-w-[200px] truncate">{e.description}</td>
                    <td className="py-3 px-4 text-gray-500 whitespace-nowrap">{e.payee || '—'}</td>
                    <td className="py-3 px-4 text-gray-500 whitespace-nowrap">{t(PM_LABELS[e.paymentMode]) || e.paymentMode}</td>
                    <td className="py-3 px-4 text-right font-semibold text-gray-800 whitespace-nowrap">{fCurrency(e.amount)}</td>
                    <td className="py-3 px-4"><StatusBadge status={e.status} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-orange-50">
                  <td colSpan={6} className="py-3 px-4 text-sm font-semibold text-gray-700 text-right">{t('Approved Total')}</td>
                  <td className="py-3 px-4 text-right text-base font-bold text-gray-900">{fCurrency(approvedSum)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
