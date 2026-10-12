import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  FileText, ChevronDown, ChevronRight, Search,
  AlertTriangle, CheckCircle2, Clock, CircleDot,
} from 'lucide-react';
import { getInvoiceRegister } from '../../api/supplierPayment.api.js';
import { getSuppliers } from '../../api/supplier.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { useT } from '../../i18n/index.jsx';

const fmt    = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtAmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const STATUS_CONFIG = {
  unpaid:  { label: 'Unpaid',  icon: Clock,         cls: 'bg-red-100 text-red-700',    dot: 'bg-red-500' },
  partial: { label: 'Partial', icon: CircleDot,      cls: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  paid:    { label: 'Paid',    icon: CheckCircle2,   cls: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
};

const STATUS_TABS = [
  { label: 'All',     value: '' },
  { label: 'Unpaid',  value: 'unpaid' },
  { label: 'Partial', value: 'partial' },
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
      {isOverdue && status !== 'paid' && (
        <AlertTriangle size={11} className="ml-0.5 text-orange-500" />
      )}
    </span>
  );
}

function InvoiceRow({ inv }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr
        className="border-b hover:bg-gray-50 cursor-pointer"
        onClick={() => setOpen((o) => !o)}
      >
        {/* Expand icon */}
        <td className="py-3 px-3 w-8">
          {open
            ? <ChevronDown size={14} className="text-gray-400" />
            : <ChevronRight size={14} className="text-gray-400" />}
        </td>

        {/* Invoice # */}
        <td className="py-3 px-3">
          <span className="font-mono text-sm font-semibold text-gray-800">
            {inv.invoiceNumber || <span className="italic text-gray-400 text-xs">{t('No Invoice #')}</span>}
          </span>
          {inv.isOverdue && inv.paymentStatus !== 'paid' && (
            <div className="text-xs text-orange-600 font-medium mt-0.5">
              {t('Due')} {fmt(inv.dueDate)}
            </div>
          )}
        </td>

        {/* Supplier */}
        <td className="py-3 px-3 text-sm text-gray-700">{inv.supplierName || '—'}</td>

        {/* Date */}
        <td className="py-3 px-3 text-sm text-gray-600">{fmt(inv.invoiceDate)}</td>

        {/* Items */}
        <td className="py-3 px-3 text-center text-sm text-gray-500">{inv.itemCount}</td>

        {/* Invoice Total */}
        <td className="py-3 px-3 text-right text-sm font-medium text-gray-800">
          {fmtAmt(inv.totalValue)}
        </td>

        {/* Paid */}
        <td className="py-3 px-3 text-right text-sm text-green-700">
          {inv.paidSoFar > 0 ? fmtAmt(inv.paidSoFar) : '—'}
        </td>

        {/* Balance */}
        <td className="py-3 px-3 text-right text-sm font-semibold">
          <span className={inv.remaining > 0 ? 'text-red-600' : 'text-gray-400'}>
            {inv.remaining > 0 ? fmtAmt(inv.remaining) : '—'}
          </span>
        </td>

        {/* Status */}
        <td className="py-3 px-3">
          <StatusBadge status={inv.paymentStatus} isOverdue={inv.isOverdue} />
        </td>
      </tr>

      {/* Expanded: line items + payment refs */}
      {open && (
        <tr className="bg-gray-50">
          <td colSpan={9} className="px-6 pb-4 pt-2">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              {/* Line items */}
              <div className="lg:col-span-2">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {t('Invoice Items (')}{inv.items.length})
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-1.5 px-2 text-gray-500 font-medium">{t('Product')}</th>
                        <th className="text-right py-1.5 px-2 text-gray-500 font-medium">{t('Qty')}</th>
                        <th className="text-right py-1.5 px-2 text-gray-500 font-medium">{t('Rate')}</th>
                        <th className="text-right py-1.5 px-2 text-gray-500 font-medium">{t('Total')}</th>
                        {inv.items.some((i) => i.expiryDate) && (
                          <th className="text-right py-1.5 px-2 text-gray-500 font-medium">{t('Expiry')}</th>
                        )}
                        {inv.items.some((i) => i.batchRef) && (
                          <th className="text-left py-1.5 px-2 text-gray-500 font-medium">{t('Batch')}</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {inv.items.map((item, i) => (
                        <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-white">
                          <td className="py-1.5 px-2">
                            <div className="font-medium text-gray-800">{item.product}</div>
                            {item.productCode && (
                              <div className="text-gray-400 text-[10px]">{item.productCode}</div>
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-right text-gray-700">
                            {item.quantity} {item.unit || ''}
                          </td>
                          <td className="py-1.5 px-2 text-right text-gray-600">
                            {item.rate > 0 ? fmtAmt(item.rate) : '—'}
                          </td>
                          <td className="py-1.5 px-2 text-right font-medium text-gray-800">
                            {item.totalValue > 0 ? fmtAmt(item.totalValue) : '—'}
                          </td>
                          {inv.items.some((x) => x.expiryDate) && (
                            <td className="py-1.5 px-2 text-right text-gray-500">
                              {item.expiryDate ? fmt(item.expiryDate) : '—'}
                            </td>
                          )}
                          {inv.items.some((x) => x.batchRef) && (
                            <td className="py-1.5 px-2 text-gray-500 font-mono text-[10px]">
                              {item.batchRef || '—'}
                            </td>
                          )}
                        </tr>
                      ))}
                      {/* Totals row */}
                      <tr className="bg-gray-100 font-semibold">
                        <td className="py-1.5 px-2 text-gray-600" colSpan={3}>{t('Invoice Total')}</td>
                        <td className="py-1.5 px-2 text-right text-gray-800">{fmtAmt(inv.totalValue)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payment references */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {t('Payment History')}
                </div>
                {inv.payments.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">{t('No payments recorded')}</p>
                ) : (
                  <div className="space-y-2">
                    {inv.payments.map((p, i) => (
                      <div key={i} className="flex items-center justify-between bg-white border rounded px-2 py-1.5 text-xs">
                        <div>
                          <div className="font-medium text-gray-700">{p.paymentNumber}</div>
                          <div className="text-gray-400">{fmt(p.paymentDate)}</div>
                        </div>
                        <div className="font-semibold text-green-700">{fmtAmt(p.paidAmount)}</div>
                      </div>
                    ))}
                    {/* Summary */}
                    <div className="border-t pt-2 flex justify-between text-xs font-semibold">
                      <span className="text-gray-600">{t('Total Paid')}</span>
                      <span className="text-green-700">{fmtAmt(inv.paidSoFar)}</span>
                    </div>
                    {inv.remaining > 0 && (
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-gray-600">{t('Balance Due')}</span>
                        <span className="text-red-600">{fmtAmt(inv.remaining)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Phone layout: tap a card to expand its line items and payment history.
function InvoiceCard({ inv }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const showDue = inv.isOverdue && inv.paymentStatus !== 'paid';

  return (
    <div className={`card overflow-hidden ${showDue ? 'border-orange-200' : ''}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="block w-full p-3.5 text-left active:bg-gray-50" aria-expanded={open}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-sm font-semibold text-gray-800 break-all">
              {inv.invoiceNumber || <span className="font-sans italic text-gray-400 text-xs">{t('No Invoice #')}</span>}
            </p>
            <p className="mt-0.5 text-[15px] font-medium text-gray-900 break-words">{inv.supplierName || '—'}</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {fmt(inv.invoiceDate)} · {inv.itemCount} {t('item')}{inv.itemCount === 1 ? '' : 's'}
              {showDue && <> · <span className="whitespace-nowrap font-medium text-orange-600">{t('Due')} {fmt(inv.dueDate)}</span></>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <StatusBadge status={inv.paymentStatus} isOverdue={inv.isOverdue} />
            <ChevronDown size={16} className={`text-gray-300 transition-transform ${open ? 'rotate-180' : ''}`} />
          </div>
        </div>
        <dl className="mt-2.5 grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-gray-400">{t('Total')}</dt>
            <dd className="font-medium text-gray-800">{fmtAmt(inv.totalValue)}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-gray-400">{t('Paid')}</dt>
            <dd className="text-green-700">{inv.paidSoFar > 0 ? fmtAmt(inv.paidSoFar) : '—'}</dd>
          </div>
          <div className="text-right">
            <dt className="text-[11px] uppercase tracking-wide text-gray-400">{t('Balance')}</dt>
            <dd className={`font-semibold ${inv.remaining > 0 ? 'text-red-600' : 'text-gray-400'}`}>{inv.remaining > 0 ? fmtAmt(inv.remaining) : '—'}</dd>
          </div>
        </dl>
      </button>

      {open && (
        <div className="space-y-4 border-t border-gray-100 bg-gray-50 px-3.5 py-3">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Invoice Items (')}{inv.items.length})</p>
            {inv.items.length === 0 ? (
              <p className="text-xs italic text-gray-400">{t('No line items')}</p>
            ) : (
              <div className="divide-y divide-gray-200/70 rounded-lg border bg-white">
                {inv.items.map((item, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 break-words">{item.product}</p>
                      <p className="text-gray-400">
                        {item.quantity} {item.unit || ''}{item.rate > 0 && ` × ${fmtAmt(item.rate)}`}
                        {item.expiryDate && ` · Exp ${fmt(item.expiryDate)}`}
                        {item.batchRef && <span className="font-mono"> · {item.batchRef}</span>}
                      </p>
                    </div>
                    <p className="shrink-0 font-medium text-gray-800">{item.totalValue > 0 ? fmtAmt(item.totalValue) : '—'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Payment History')}</p>
            {inv.payments.length === 0 ? (
              <p className="text-xs italic text-gray-400">{t('No payments recorded')}</p>
            ) : (
              <div className="space-y-1.5">
                {inv.payments.map((p, i) => (
                  <div key={i} className="flex items-center justify-between rounded border bg-white px-3 py-2 text-xs">
                    <div>
                      <div className="font-medium text-gray-700">{p.paymentNumber}</div>
                      <div className="text-gray-400">{fmt(p.paymentDate)}</div>
                    </div>
                    <div className="font-semibold text-green-700">{fmtAmt(p.paidAmount)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_TAB_CLS = (active) =>
  `whitespace-nowrap px-3 py-2 sm:py-1.5 text-sm rounded font-medium transition-colors ${
    active ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
  }`;

// Raw filter inputs: 16px / 44px tall on phones (no iOS zoom), unchanged from sm up.
const FILTER_INPUT = 'min-h-[44px] sm:min-h-0 border rounded px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500';

export default function InvoiceRegister() {
  const t = useT();
  const [filters, setFilters] = useState({
    page: 1, limit: 50,
    status: '', supplierId: '', from: '', to: '', search: '',
  });

  const set = (key, val) => setFilters((f) => ({ ...f, [key]: val, page: key !== 'page' ? 1 : val }));

  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));

  const { data, isLoading } = useQuery({
    queryKey: ['invoice-register', filters],
    queryFn: () => getInvoiceRegister(params),
    keepPreviousData: true,
  });

  const { data: suppliersRes } = useQuery({
    queryKey: ['suppliers-list'],
    queryFn: () => getSuppliers({ limit: 200 }),
    staleTime: 5 * 60 * 1000,
  });

  // Body is { data: { invoices, pagination } }; the old `data.data.invoices` read never matched it.
  const register   = data?.data?.data || data?.data || {};
  const invoices   = register.invoices    || [];
  const pagination = register.pagination  || {};
  const suppliers  = suppliersRes?.data?.data?.suppliers || suppliersRes?.data?.data || [];

  // Summary counts from current result set
  const unpaidCount  = invoices.filter((i) => i.paymentStatus === 'unpaid').length;
  const partialCount = invoices.filter((i) => i.paymentStatus === 'partial').length;
  const overdueCount = invoices.filter((i) => i.isOverdue && i.paymentStatus !== 'paid').length;
  const totalValue   = invoices.reduce((s, i) => s + i.totalValue, 0);
  const totalDue     = invoices.reduce((s, i) => s + i.remaining, 0);

  return (
    <div>
      <PageHeader
        title="Invoice Register"
        subtitle="All purchase invoices with their line items and payment status"
        icon={<FileText size={22} />}
        actions={
          <Link to="/payments/new" className="btn-primary flex items-center gap-2 text-sm">
            {t('Record Payment')}
          </Link>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {[
          { label: t('Total Invoices'), value: pagination.total ?? invoices.length, sub: t('this view') },
          { label: t('Unpaid'),         value: unpaidCount,  sub: t('invoices'), cls: 'text-red-600' },
          { label: t('Partial'),        value: partialCount, sub: t('invoices'), cls: 'text-yellow-600' },
          { label: t('Overdue'),        value: overdueCount, sub: t('past due'), cls: 'text-orange-600' },
          { label: t('Balance Due'),    value: fmtAmt(totalDue), sub: fmtAmt(totalValue) + ' total', cls: 'text-red-700' },
        ].map((c) => (
          <div key={c.label} className={`bg-white border rounded-lg px-3 py-2.5 sm:px-4 sm:py-3 ${c.label === 'Balance Due' ? 'col-span-2 md:col-span-1' : ''}`}>
            <div className={`text-lg sm:text-xl font-bold ${c.cls || 'text-gray-800'}`}>{c.value}</div>
            <div className="text-xs font-medium text-gray-600">{t(c.label)}</div>
            <div className="text-xs text-gray-400">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Status tabs — scroll sideways on narrow phones */}
      <div className="-mx-4 mb-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0">
        <div className="flex gap-1 bg-white border rounded-lg p-1 w-max">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => set('status', tab.value)}
              className={STATUS_TAB_CLS(filters.status === tab.value)}
            >
              {t(tab.label)}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-lg p-3 mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="relative col-span-2 md:col-span-1">
          <Search size={13} className="absolute left-2.5 top-3.5 sm:top-2.5 text-gray-400" />
          <input
            type="text"
            inputMode="search"
            enterKeyHint="search"
            placeholder={t('Invoice number…')}
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
            className={`pl-8 w-full ${FILTER_INPUT}`}
          />
        </div>
        <select
          value={filters.supplierId}
          onChange={(e) => set('supplierId', e.target.value)}
          className={`col-span-2 md:col-span-1 min-w-0 ${FILTER_INPUT}`}
        >
          <option value="">{t('All Suppliers')}</option>
          {(Array.isArray(suppliers) ? suppliers : []).map((s) => (
            <option key={s._id} value={s._id}>{s.name}</option>
          ))}
        </select>
        {/* Date inputs ignore placeholders, so name them on phones */}
        <div className="col-span-2 -mb-2 grid grid-cols-2 gap-3 text-xs font-medium text-gray-500 md:hidden" aria-hidden="true">
          <span>{t('From')}</span><span>{t('To')}</span>
        </div>
        <input
          type="date"
          value={filters.from}
          onChange={(e) => set('from', e.target.value)}
          className={`min-w-0 ${FILTER_INPUT}`}
          title={t('Invoice date from')}
          aria-label={t('Invoice date from')}
        />
        <input
          type="date"
          value={filters.to}
          onChange={(e) => set('to', e.target.value)}
          className={`min-w-0 ${FILTER_INPUT}`}
          title={t('Invoice date to')}
          aria-label={t('Invoice date to')}
        />
      </div>

      {/* Phones: expandable cards */}
      <div className="space-y-2.5 md:hidden">
        {isLoading ? (
          <div className="card py-16 text-center text-sm text-gray-400">{t('Loading invoices…')}</div>
        ) : invoices.length === 0 ? (
          <div className="card px-4 py-12 text-center text-sm text-gray-400">
            {t('No invoices found. Invoices are created when stock is received with a supplier purchase.')}
          </div>
        ) : invoices.map((inv, i) => (
          <InvoiceCard key={`${inv.supplierId}-${inv.invoiceNumber}-${i}`} inv={inv} />
        ))}
      </div>

      {/* Table */}
      <div className="hidden md:block bg-white border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="w-8 py-3 px-3" />
              <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('Invoice #')}</th>
              <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('Supplier')}</th>
              <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('Date')}</th>
              <th className="text-center py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('Items')}</th>
              <th className="text-right py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('Invoice Total')}</th>
              <th className="text-right py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('Paid')}</th>
              <th className="text-right py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('Balance')}</th>
              <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('Status')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="py-16 text-center text-gray-400">{t('Loading invoices…')}</td>
              </tr>
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-16 text-center text-gray-400">
                  {t('No invoices found. Invoices are created when stock is received with a supplier purchase.')}
                </td>
              </tr>
            ) : (
              invoices.map((inv, i) => (
                <InvoiceRow key={`${inv.supplierId}-${inv.invoiceNumber}-${i}`} inv={inv} />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 mt-4 text-sm text-gray-600">
          <span>
            {t('Showing')} {((filters.page - 1) * filters.limit) + 1}–{Math.min(filters.page * filters.limit, pagination.total)} {t('of')} {pagination.total} {t('invoices')}
          </span>
          <div className="flex gap-2">
            <button
              disabled={filters.page <= 1}
              onClick={() => set('page', filters.page - 1)}
              className="px-4 py-2 sm:px-3 sm:py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
            >
              {t('Previous')}
            </button>
            <button
              disabled={filters.page >= pagination.totalPages}
              onClick={() => set('page', filters.page + 1)}
              className="px-4 py-2 sm:px-3 sm:py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
            >
              {t('Next')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
