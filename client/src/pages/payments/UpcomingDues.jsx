import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, AlertTriangle, Clock, CheckCircle2, Plus } from 'lucide-react';
import { getUpcomingDues } from '../../api/supplierPayment.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import MobileCard from '../../components/ui/MobileCard.jsx';
import haptics from '../../utils/haptics.js';
import { useT, tNow } from '../../i18n/index.jsx';

const DAY_OPTIONS = [7, 15, 30, 60];

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtAmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

function dueBadge(daysFromToday) {
  if (daysFromToday < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold bg-red-100 text-red-700 border border-red-200 rounded-full px-2 py-0.5">
        <AlertTriangle className="h-3 w-3" />
        {Math.abs(daysFromToday)}{tNow('d overdue')}
      </span>
    );
  }
  if (daysFromToday === 0) {
    return <span className="text-xs font-semibold bg-red-100 text-red-700 border border-red-200 rounded-full px-2 py-0.5">{tNow('Due today')}</span>;
  }
  if (daysFromToday <= 7) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
        <Clock className="h-3 w-3" />
        {daysFromToday}{tNow('d left')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold bg-green-100 text-green-700 border border-green-200 rounded-full px-2 py-0.5">
      <CheckCircle2 className="h-3 w-3" />
      {daysFromToday}{tNow('d left')}
    </span>
  );
}

const UpcomingDues = () => {
  const t = useT();
  const navigate = useNavigate();
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery({
    queryKey: ['upcoming-dues', days],
    queryFn: () => getUpcomingDues({ days }),
    staleTime: 5 * 60 * 1000,
  });

  const dues = data?.data?.data || [];

  const overdueCount   = dues.filter((d) => d.isOverdue).length;
  const dueSoonCount   = dues.filter((d) => !d.isOverdue && d.daysFromToday <= 7).length;
  const totalOutstanding = dues.reduce((s, d) => s + d.remaining, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Upcoming Payments Due"
        subtitle="Invoices with payment due dates approaching or already overdue"
        breadcrumbs={[{ label: 'Payments', to: '/payments' }, { label: 'Upcoming Dues' }]}
        actions={
          <button onClick={() => navigate('/payments/new')} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="h-4 w-4" /> {t('Record Payment')}
          </button>
        }
      />

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="col-span-2 sm:col-span-1 bg-white rounded-xl border border-gray-100 px-4 py-3">
          <p className="text-xs text-gray-400 font-medium">{t('Total Outstanding')}</p>
          <p className="text-xl font-black text-gray-800 mt-0.5">{fmtAmt(totalOutstanding)}</p>
        </div>
        <div className={`bg-white rounded-xl border px-4 py-3 ${overdueCount > 0 ? 'border-red-200 bg-red-50' : 'border-gray-100'}`}>
          <p className="text-xs text-gray-400 font-medium">{t('Overdue Invoices')}</p>
          <p className={`text-xl font-black mt-0.5 ${overdueCount > 0 ? 'text-red-700' : 'text-gray-800'}`}>{overdueCount}</p>
        </div>
        <div className={`bg-white rounded-xl border px-4 py-3 ${dueSoonCount > 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-100'}`}>
          <p className="text-xs text-gray-400 font-medium">{t('Due Within 7 Days')}</p>
          <p className={`text-xl font-black mt-0.5 ${dueSoonCount > 0 ? 'text-amber-700' : 'text-gray-800'}`}>{dueSoonCount}</p>
        </div>
      </div>

      {/* Day filter */}
      <div className="flex flex-wrap items-center gap-2">
        <CalendarClock className="h-4 w-4 text-gray-400" />
        <span className="text-xs text-gray-500 font-medium">{t('Show next:')}</span>
        <div className="flex gap-1.5">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => { haptics.select(); setDays(d); }}
              className={`px-3 py-2 sm:py-1.5 rounded-full text-xs font-semibold transition-colors ${days === d ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {d} {t('days')}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 ml-1">{t('(+ all overdue)')}</span>
      </div>

      {/* Phones: one card per invoice */}
      <div className="space-y-2.5 md:hidden">
        {isLoading ? (
          <div className="card py-12 text-center text-sm text-gray-400">{t('Loading…')}</div>
        ) : dues.length === 0 ? (
          <div className="card py-12 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-500">{t('No dues in the next')} {days} {t('days')}</p>
            <p className="text-xs text-gray-400 mt-1">{t('All invoices are settled or not yet due.')}</p>
          </div>
        ) : dues.map((row, i) => (
          <MobileCard
            key={i}
            className={row.isOverdue ? 'border-red-200' : ''}
            title={row.supplierName || '—'}
            subtitle={<><span className="font-mono">{row.invoiceNumber || t('No invoice no.')}</span> · {fmt(row.invoiceDate)}</>}
            aside={dueBadge(row.daysFromToday)}
            fields={[
              { label: t('Outstanding'), value: <span className="text-base font-bold text-gray-900">{fmtAmt(row.remaining)}</span> },
              {
                label: t('Due Date'),
                value: <span className={`font-medium ${row.isOverdue ? 'text-red-700' : row.daysFromToday <= 7 ? 'text-amber-700' : 'text-gray-700'}`}>{fmt(row.dueDate)}</span>,
              },
              { label: t('Invoice Total'), value: fmtAmt(row.invoiceTotal) },
            ]}
            footer={
              <button
                onClick={() => navigate(`/payments/new?supplier=${row.supplierId}`)}
                className="btn-primary w-full text-sm"
              >
                <Plus className="h-4 w-4" /> {t('Pay Now')}
              </button>
            }
          />
        ))}
      </div>

      {/* Table */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-gray-400">{t('Loading…')}</div>
        ) : dues.length === 0 ? (
          <div className="py-12 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-500">{t('No dues in the next')} {days} {t('days')}</p>
            <p className="text-xs text-gray-400 mt-1">{t('All invoices are settled or not yet due.')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="table-th">{t('Supplier')}</th>
                  <th className="table-th">{t('Invoice No.')}</th>
                  <th className="table-th">{t('Invoice Date')}</th>
                  <th className="table-th">{t('Due Date')}</th>
                  <th className="table-th text-right">{t('Invoice Total')}</th>
                  <th className="table-th text-right">{t('Outstanding')}</th>
                  <th className="table-th text-center">{t('Status')}</th>
                  <th className="table-th w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {dues.map((row, i) => (
                  <tr key={i} className={`hover:bg-gray-50 ${row.isOverdue ? 'bg-red-50/40' : ''}`}>
                    <td className="table-td font-medium text-gray-900">{row.supplierName || '—'}</td>
                    <td className="table-td font-mono text-xs text-gray-600">{row.invoiceNumber || <span className="text-gray-300">—</span>}</td>
                    <td className="table-td text-gray-500">{fmt(row.invoiceDate)}</td>
                    <td className={`table-td font-medium ${row.isOverdue ? 'text-red-700' : row.daysFromToday <= 7 ? 'text-amber-700' : 'text-gray-700'}`}>
                      {fmt(row.dueDate)}
                    </td>
                    <td className="table-td text-right text-gray-600">{fmtAmt(row.invoiceTotal)}</td>
                    <td className="table-td text-right font-semibold text-gray-900">{fmtAmt(row.remaining)}</td>
                    <td className="table-td text-center">{dueBadge(row.daysFromToday)}</td>
                    <td className="table-td text-right">
                      <button
                        onClick={() => navigate(`/payments/new?supplier=${row.supplierId}`)}
                        className="text-xs font-semibold text-primary-600 hover:text-primary-800 hover:underline whitespace-nowrap"
                      >
                        {t('Pay Now →')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default UpcomingDues;
