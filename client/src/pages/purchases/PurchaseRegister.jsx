import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ShoppingCart, ChevronDown, ChevronRight, Search,
  AlertTriangle, CheckCircle2, Clock, CircleDot, Plus, SlidersHorizontal,
} from 'lucide-react';
import { getPurchaseEntries } from '../../api/purchaseEntry.api.js';
import { getSuppliers } from '../../api/supplier.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import MobileCard from '../../components/ui/MobileCard.jsx';
import { fDate, fCurrency } from '../../utils/formatters.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { useT } from '../../i18n/index.jsx';

const STATUS_CONFIG = {
  unpaid:          { label: 'Unpaid',   icon: Clock,        cls: 'bg-red-100 text-red-700' },
  partially_paid:  { label: 'Partial',  icon: CircleDot,    cls: 'bg-yellow-100 text-yellow-700' },
  paid:            { label: 'Paid',     icon: CheckCircle2, cls: 'bg-green-100 text-green-700' },
};

const STATUS_TABS = [
  { label: 'All',     value: '' },
  { label: 'Unpaid',  value: 'unpaid' },
  { label: 'Partial', value: 'partially_paid' },
  { label: 'Paid',    value: 'paid' },
];

function StatusBadge({ status, isOverdue }) {
  const t = useT();
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.unpaid;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${cfg.cls}`}>
      <Icon size={11} />
      {t(cfg.label)}
      {isOverdue && status !== 'paid' && <AlertTriangle size={11} className="ml-0.5 text-orange-500" />}
    </span>
  );
}

function EntryRow({ entry }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setOpen((o) => !o)}>
        <td className="py-3 px-3 w-8">
          {open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        </td>
        <td className="py-3 px-3">
          <Link
            to={`/purchases/${entry._id}`}
            className="font-mono text-sm font-semibold text-primary-600 hover:underline"
            onClick={(e) => e.stopPropagation()}>
            {entry.entryNumber || '—'}
          </Link>
          {entry.invoiceNumber && (
            <div className="text-xs text-gray-400 font-mono mt-0.5">{t('Inv: {n}', { n: entry.invoiceNumber })}</div>
          )}
          {entry.isOverdue && entry.paymentStatus !== 'paid' && (
            <div className="text-xs text-orange-600 font-medium mt-0.5">
              {t('Due {date}', { date: fDate(entry.dueDate) })}
            </div>
          )}
        </td>
        <td className="py-3 px-3 text-sm text-gray-700">{entry.supplier?.name || '—'}</td>
        <td className="py-3 px-3 text-sm text-gray-600">{fDate(entry.invoiceDate)}</td>
        <td className="py-3 px-3 text-center text-sm text-gray-500">{entry.items?.length || 0}</td>
        <td className="py-3 px-3 text-right text-sm font-semibold text-gray-800">{fCurrency(entry.totalValue)}</td>
        <td className="py-3 px-3 text-right text-sm text-gray-500">{fCurrency(entry.paidSoFar)}</td>
        <td className="py-3 px-3 text-right">
          {entry.remaining > 0 ? (
            <span className="text-sm font-semibold text-red-600">{fCurrency(entry.remaining)}</span>
          ) : (
            <span className="text-sm text-gray-400">—</span>
          )}
        </td>
        <td className="py-3 px-3">
          <StatusBadge status={entry.paymentStatus} isOverdue={entry.isOverdue} />
        </td>
      </tr>

      {open && (
        <tr className="bg-gray-50 border-b">
          <td colSpan={9} className="px-4 py-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('Line Items')}</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase">
                  <th className="text-left py-1 font-semibold">{t('Product')}</th>
                  <th className="text-right py-1 font-semibold">{t('Qty')}</th>
                  <th className="text-right py-1 font-semibold">{t('Rate')}</th>
                  <th className="text-right py-1 font-semibold">{t('Total')}</th>
                  <th className="text-left py-1 font-semibold">{t('Expiry')}</th>
                  <th className="text-left py-1 font-semibold">{t('Batch')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(entry.items || []).map((item, i) => (
                  <tr key={i}>
                    <td className="py-1 text-gray-800">{item.product?.name || '—'}</td>
                    <td className="py-1 text-right text-gray-600">{item.quantity}</td>
                    <td className="py-1 text-right text-gray-600">{fCurrency(item.rate)}</td>
                    <td className="py-1 text-right font-medium text-gray-800">{fCurrency(item.totalValue)}</td>
                    <td className="py-1 text-gray-500">{fDate(item.expiryDate)}</td>
                    <td className="py-1 text-gray-400 font-mono text-xs">{item.batchRef || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex justify-end">
              <Link
                to={`/purchases/${entry._id}`}
                className="text-xs text-primary-600 hover:underline font-medium">
                {t('View full details →')}
              </Link>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Phones: one card per entry; tapping it opens the full entry.
function EntryCard({ entry, onOpen }) {
  const t = useT();
  const overdue = entry.isOverdue && entry.paymentStatus !== 'paid';
  return (
    <MobileCard
      onClick={onOpen}
      title={<span className="font-mono">{entry.entryNumber || '—'}</span>}
      subtitle={
        <>
          <span className="text-gray-600">{entry.supplier?.name || '—'}</span>
          {entry.invoiceNumber && <span className="font-mono"> · {t('Inv {n}', { n: entry.invoiceNumber })}</span>}
        </>
      }
      aside={<StatusBadge status={entry.paymentStatus} isOverdue={entry.isOverdue} />}
      fields={[
        { label: t('Invoice date'), value: fDate(entry.invoiceDate) },
        { label: t('Items'), value: entry.items?.length || 0 },
        { label: t('Total'), value: <span className="font-semibold text-gray-900">{fCurrency(entry.totalValue)}</span> },
        {
          label: entry.remaining > 0 ? t('Remaining') : t('Paid'),
          value: entry.remaining > 0
            ? <span className="font-semibold text-red-600">{fCurrency(entry.remaining)}</span>
            : fCurrency(entry.paidSoFar),
        },
        overdue && { label: t('Due'), value: <span className="font-medium text-orange-600">{fDate(entry.dueDate)} · {t('Overdue')}</span>, full: true },
      ]}
    />
  );
}

export default function PurchaseRegister() {
  const { can } = usePermissions();
  const navigate = useNavigate();
  const t = useT();
  const [activeTab,   setActiveTab]   = useState('');
  const [search,      setSearch]      = useState('');
  const [suppFilter,  setSuppFilter]  = useState('');
  const [from,        setFrom]        = useState('');
  const [to,          setTo]          = useState('');
  const [page,        setPage]        = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const { data: res, isLoading } = useQuery({
    queryKey: ['purchase-entries', { status: activeTab, search, supplier: suppFilter, from, to, page }],
    queryFn:  () => getPurchaseEntries({ status: activeTab || undefined, search: search || undefined, supplier: suppFilter || undefined, from: from || undefined, to: to || undefined, page, limit: 30 }),
    keepPreviousData: true,
  });

  const { data: supRes } = useQuery({
    queryKey: ['suppliers-all'],
    queryFn:  () => getSuppliers({ limit: 200, type: 'vendor' }),
  });
  const suppliers = supRes?.data?.data?.suppliers || supRes?.data?.data || [];

  const entries    = res?.data?.data?.entries    || [];
  const pagination = res?.data?.data?.pagination || { total: 0, page: 1, totalPages: 1 };

  const stats = { totalValue: 0, unpaidValue: 0, overdueValue: 0 };
  for (const e of entries) {
    stats.totalValue  += e.totalValue || 0;
    if (e.paymentStatus !== 'paid') stats.unpaidValue += e.remaining || 0;
    if (e.isOverdue && e.paymentStatus !== 'paid') stats.overdueValue += e.remaining || 0;
  }

  const activeFilterCount = [suppFilter, from, to].filter(Boolean).length;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Purchase Register"
        subtitle="All purchase entries with payment status"
        breadcrumbs={[{ label: 'Purchases' }]}
        actions={
          can('transactions:create') && (
            <Link to="/purchases/new" className="btn-primary flex items-center gap-1.5 text-sm">
              <Plus className="h-4 w-4" />
              <span className="sm:hidden">{t('New Entry')}</span>
              <span className="hidden sm:inline">{t('New Purchase Entry')}</span>
            </Link>
          )
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card p-3 sm:p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide">{t('Total (shown)')}</p>
          <p className="text-base sm:text-lg font-bold text-gray-900 mt-1">{fCurrency(stats.totalValue)}</p>
        </div>
        <div className="card p-3 sm:p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide">{t('Outstanding')}</p>
          <p className="text-base sm:text-lg font-bold text-red-600 mt-1">{fCurrency(stats.unpaidValue)}</p>
        </div>
        <div className="card p-3 sm:p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-gray-400 uppercase tracking-wide">{t('Overdue')}</p>
          <p className="text-base sm:text-lg font-bold text-orange-600 mt-1">{fCurrency(stats.overdueValue)}</p>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setActiveTab(tab.value); setPage(1); }}
            className={`flex-1 sm:flex-none px-2 sm:px-4 py-2.5 sm:py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.value
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t(tab.label)}
          </button>
        ))}
      </div>

      {/* Filters — phones keep search visible and fold the rest behind a toggle */}
      <div className="card p-3 flex flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0 sm:min-w-48 sm:max-w-xs">
          <Search className="h-4 w-4 text-gray-400 shrink-0 hidden sm:block" />
          <div className="relative flex-1 min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 sm:hidden" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              type="search"
              enterKeyHint="search"
              placeholder={t('Search entry # or invoice #…')}
              className="input text-sm flex-1 pl-9 sm:pl-3" />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className={`btn-secondary relative shrink-0 px-3 sm:hidden ${showFilters ? 'bg-gray-100' : ''}`}>
            <SlidersHorizontal className="h-4 w-4" />
            <span className="sr-only">{t('Filters')}</span>
            {activeFilterCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary-600 px-1 text-[11px] font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
        <div className={`${showFilters ? 'grid' : 'hidden'} w-full grid-cols-2 gap-3 sm:contents`}>
          <select
            value={suppFilter}
            onChange={(e) => { setSuppFilter(e.target.value); setPage(1); }}
            className="input text-sm col-span-2 sm:w-48">
            <option value="">{t('All suppliers')}</option>
            {suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
          <label className="min-w-0 sm:contents">
            <span className="mb-1 block text-xs text-gray-500 sm:hidden">{t('From')}</span>
            <input value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} type="date" className="input text-sm sm:w-36" title={t('From date')} />
          </label>
          <label className="min-w-0 sm:contents">
            <span className="mb-1 block text-xs text-gray-500 sm:hidden">{t('To')}</span>
            <input value={to}   onChange={(e) => { setTo(e.target.value); setPage(1); }}   type="date" className="input text-sm sm:w-36" title={t('To date')} />
          </label>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => { setSuppFilter(''); setFrom(''); setTo(''); setPage(1); }}
              className="btn-ghost col-span-2 text-sm sm:hidden">
              {t('Clear filters')}
            </button>
          )}
        </div>
      </div>

      {/* Phones: card list */}
      <div className="md:hidden">
        {isLoading ? (
          <div className="py-16 text-center text-gray-400 text-sm">{t('Loading…')}</div>
        ) : entries.length === 0 ? (
          <div className="card py-12 text-center">
            <ShoppingCart className="h-10 w-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">{t('No purchase entries found')}</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {entries.map((entry) => (
              <EntryCard key={entry._id} entry={entry} onOpen={() => navigate(`/purchases/${entry._id}`)} />
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className={`card overflow-hidden ${pagination.totalPages > 1 ? '' : 'hidden md:block'}`}>
        <div className="hidden md:block">
          {isLoading ? (
            <div className="py-16 text-center text-gray-400 text-sm">{t('Loading…')}</div>
          ) : entries.length === 0 ? (
            <div className="py-16 text-center">
              <ShoppingCart className="h-10 w-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">{t('No purchase entries found')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="py-3 px-3 w-8"></th>
                    <th className="py-3 px-3 text-left">{t('Entry / Invoice')}</th>
                    <th className="py-3 px-3 text-left">{t('Supplier')}</th>
                    <th className="py-3 px-3 text-left">{t('Invoice Date')}</th>
                    <th className="py-3 px-3 text-center">{t('Items')}</th>
                    <th className="py-3 px-3 text-right">{t('Total')}</th>
                    <th className="py-3 px-3 text-right">{t('Paid')}</th>
                    <th className="py-3 px-3 text-right">{t('Remaining')}</th>
                    <th className="py-3 px-3 text-left">{t('Status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <EntryRow key={entry._id} entry={entry} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 md:border-t">
            <p className="text-xs text-gray-500">
              {t('{total} entries · Page {page} of {pages}', { total: pagination.total, page: pagination.page, pages: pagination.totalPages })}
            </p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="btn-secondary text-xs disabled:opacity-40">
                ← {t('Prev')}
              </button>
              <button
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="btn-secondary text-xs disabled:opacity-40">
                {t('Next')} →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
