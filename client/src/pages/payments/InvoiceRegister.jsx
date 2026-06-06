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
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.unpaid;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${cfg.cls}`}>
      <Icon size={11} />
      {cfg.label}
      {isOverdue && status !== 'paid' && (
        <AlertTriangle size={11} className="ml-0.5 text-orange-500" />
      )}
    </span>
  );
}

function InvoiceRow({ inv }) {
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
            {inv.invoiceNumber || <span className="italic text-gray-400 text-xs">No Invoice #</span>}
          </span>
          {inv.isOverdue && inv.paymentStatus !== 'paid' && (
            <div className="text-xs text-orange-600 font-medium mt-0.5">
              Due {fmt(inv.dueDate)}
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
                  Invoice Items ({inv.items.length})
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-1.5 px-2 text-gray-500 font-medium">Product</th>
                        <th className="text-right py-1.5 px-2 text-gray-500 font-medium">Qty</th>
                        <th className="text-right py-1.5 px-2 text-gray-500 font-medium">Rate</th>
                        <th className="text-right py-1.5 px-2 text-gray-500 font-medium">Total</th>
                        {inv.items.some((i) => i.expiryDate) && (
                          <th className="text-right py-1.5 px-2 text-gray-500 font-medium">Expiry</th>
                        )}
                        {inv.items.some((i) => i.batchRef) && (
                          <th className="text-left py-1.5 px-2 text-gray-500 font-medium">Batch</th>
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
                        <td className="py-1.5 px-2 text-gray-600" colSpan={3}>Invoice Total</td>
                        <td className="py-1.5 px-2 text-right text-gray-800">{fmtAmt(inv.totalValue)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payment references */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Payment History
                </div>
                {inv.payments.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No payments recorded</p>
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
                      <span className="text-gray-600">Total Paid</span>
                      <span className="text-green-700">{fmtAmt(inv.paidSoFar)}</span>
                    </div>
                    {inv.remaining > 0 && (
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-gray-600">Balance Due</span>
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

export default function InvoiceRegister() {
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

  const invoices   = data?.data?.invoices    || [];
  const pagination = data?.data?.pagination  || {};
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
            Record Payment
          </Link>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {[
          { label: 'Total Invoices', value: pagination.total ?? invoices.length, sub: 'this view' },
          { label: 'Unpaid',         value: unpaidCount,  sub: 'invoices', cls: 'text-red-600' },
          { label: 'Partial',        value: partialCount, sub: 'invoices', cls: 'text-yellow-600' },
          { label: 'Overdue',        value: overdueCount, sub: 'past due', cls: 'text-orange-600' },
          { label: 'Balance Due',    value: fmtAmt(totalDue), sub: fmtAmt(totalValue) + ' total', cls: 'text-red-700' },
        ].map((c) => (
          <div key={c.label} className="bg-white border rounded-lg px-4 py-3">
            <div className={`text-xl font-bold ${c.cls || 'text-gray-800'}`}>{c.value}</div>
            <div className="text-xs font-medium text-gray-600">{c.label}</div>
            <div className="text-xs text-gray-400">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 mb-4 bg-white border rounded-lg p-1 w-fit">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => set('status', tab.value)}
            className={`px-3 py-1.5 text-sm rounded font-medium transition-colors ${
              filters.status === tab.value
                ? 'bg-indigo-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-lg p-3 mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="relative col-span-2 md:col-span-1">
          <Search size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
          <input
            type="text"
            placeholder="Invoice number…"
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
            className="pl-8 w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <select
          value={filters.supplierId}
          onChange={(e) => set('supplierId', e.target.value)}
          className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">All Suppliers</option>
          {(Array.isArray(suppliers) ? suppliers : []).map((s) => (
            <option key={s._id} value={s._id}>{s.name}</option>
          ))}
        </select>
        <input
          type="date"
          value={filters.from}
          onChange={(e) => set('from', e.target.value)}
          className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          title="Invoice date from"
        />
        <input
          type="date"
          value={filters.to}
          onChange={(e) => set('to', e.target.value)}
          className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          title="Invoice date to"
        />
      </div>

      {/* Table */}
      <div className="bg-white border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="w-8 py-3 px-3" />
              <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice #</th>
              <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier</th>
              <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th className="text-center py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
              <th className="text-right py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice Total</th>
              <th className="text-right py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Paid</th>
              <th className="text-right py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
              <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="py-16 text-center text-gray-400">Loading invoices…</td>
              </tr>
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-16 text-center text-gray-400">
                  No invoices found. Invoices are created when stock is received with a supplier purchase.
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
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>
            Showing {((filters.page - 1) * filters.limit) + 1}–{Math.min(filters.page * filters.limit, pagination.total)} of {pagination.total} invoices
          </span>
          <div className="flex gap-2">
            <button
              disabled={filters.page <= 1}
              onClick={() => set('page', filters.page - 1)}
              className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              disabled={filters.page >= pagination.totalPages}
              onClick={() => set('page', filters.page + 1)}
              className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
