import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ShoppingCart, ChevronDown, ChevronRight, Search,
  AlertTriangle, CheckCircle2, Clock, CircleDot, Plus,
} from 'lucide-react';
import { getPurchaseEntries } from '../../api/purchaseEntry.api.js';
import { getSuppliers } from '../../api/supplier.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { fDate, fCurrency } from '../../utils/formatters.js';
import { usePermissions } from '../../hooks/usePermissions.js';

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
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.unpaid;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${cfg.cls}`}>
      <Icon size={11} />
      {cfg.label}
      {isOverdue && status !== 'paid' && <AlertTriangle size={11} className="ml-0.5 text-orange-500" />}
    </span>
  );
}

function EntryRow({ entry }) {
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
            <div className="text-xs text-gray-400 font-mono mt-0.5">Inv: {entry.invoiceNumber}</div>
          )}
          {entry.isOverdue && entry.paymentStatus !== 'paid' && (
            <div className="text-xs text-orange-600 font-medium mt-0.5">
              Due {fDate(entry.dueDate)}
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
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Line Items</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase">
                  <th className="text-left py-1 font-semibold">Product</th>
                  <th className="text-right py-1 font-semibold">Qty</th>
                  <th className="text-right py-1 font-semibold">Rate</th>
                  <th className="text-right py-1 font-semibold">Total</th>
                  <th className="text-left py-1 font-semibold">Expiry</th>
                  <th className="text-left py-1 font-semibold">Batch</th>
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
                View full details →
              </Link>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function PurchaseRegister() {
  const { can } = usePermissions();
  const [activeTab,   setActiveTab]   = useState('');
  const [search,      setSearch]      = useState('');
  const [suppFilter,  setSuppFilter]  = useState('');
  const [from,        setFrom]        = useState('');
  const [to,          setTo]          = useState('');
  const [page,        setPage]        = useState(1);

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

  return (
    <div className="space-y-5">
      <PageHeader
        title="Purchase Register"
        subtitle="All purchase entries with payment status"
        breadcrumbs={[{ label: 'Purchases' }]}
        actions={
          can('transactions:create') && (
            <Link to="/purchases/new" className="btn-primary flex items-center gap-1.5 text-sm">
              <Plus className="h-4 w-4" /> New Purchase Entry
            </Link>
          )
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Total (shown)</p>
          <p className="text-lg font-bold text-gray-900 mt-1">{fCurrency(stats.totalValue)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Outstanding</p>
          <p className="text-lg font-bold text-red-600 mt-1">{fCurrency(stats.unpaidValue)}</p>
        </div>
        <div className="card p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Overdue</p>
          <p className="text-lg font-bold text-orange-600 mt-1">{fCurrency(stats.overdueValue)}</p>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setActiveTab(tab.value); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.value
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-3 flex flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-48 max-w-xs">
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search entry # or invoice #…"
            className="input text-sm flex-1" />
        </div>
        <select
          value={suppFilter}
          onChange={(e) => { setSuppFilter(e.target.value); setPage(1); }}
          className="input text-sm w-48">
          <option value="">All suppliers</option>
          {suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
        </select>
        <input value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} type="date" className="input text-sm w-36" title="From date" />
        <input value={to}   onChange={(e) => { setTo(e.target.value); setPage(1); }}   type="date" className="input text-sm w-36" title="To date" />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center">
            <ShoppingCart className="h-10 w-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No purchase entries found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="py-3 px-3 w-8"></th>
                  <th className="py-3 px-3 text-left">Entry / Invoice</th>
                  <th className="py-3 px-3 text-left">Supplier</th>
                  <th className="py-3 px-3 text-left">Invoice Date</th>
                  <th className="py-3 px-3 text-center">Items</th>
                  <th className="py-3 px-3 text-right">Total</th>
                  <th className="py-3 px-3 text-right">Paid</th>
                  <th className="py-3 px-3 text-right">Remaining</th>
                  <th className="py-3 px-3 text-left">Status</th>
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

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-xs text-gray-500">
              {pagination.total} entries · Page {pagination.page} of {pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="btn-secondary text-xs disabled:opacity-40">
                ← Prev
              </button>
              <button
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="btn-secondary text-xs disabled:opacity-40">
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
