import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Edit, CreditCard, ShoppingCart, BookOpen, Building2, Phone, Mail, MapPin } from 'lucide-react';
import { getSupplier } from '../../../api/supplier.api.js';
import { getSupplierOutstanding, getSupplierInvoices, getSupplierLedger } from '../../../api/supplierPayment.api.js';
import { PageLoader } from '../../../components/ui/Spinner.jsx';
import Badge from '../../../components/ui/Badge.jsx';
import { usePermissions } from '../../../hooks/usePermissions.js';

const fmt     = (d)  => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtAmt  = (n)  => n != null ? `₹${Number(n).toLocaleString('en-IN')}` : '—';

const TABS = ['Invoices', 'Payments', 'Ledger'];

const STATUS_COLORS = { unpaid: 'red', partially_paid: 'yellow', paid: 'green' };
const STATUS_LABELS = { unpaid: 'Unpaid', partially_paid: 'Partial', paid: 'Paid' };
const PM_LABELS     = { cash: 'Cash', upi: 'UPI', neft: 'NEFT', rtgs: 'RTGS', cheque: 'Cheque' };

export default function SupplierDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { can }  = usePermissions();
  const [tab, setTab] = useState('Invoices');

  const { data: supRes, isLoading: supLoading } = useQuery({ queryKey: ['supplier', id], queryFn: () => getSupplier(id) });
  const { data: ostRes } = useQuery({ queryKey: ['supplier-outstanding', id], queryFn: () => getSupplierOutstanding(id), enabled: can('payments:read') });
  const { data: invRes } = useQuery({ queryKey: ['supplier-invoices', id], queryFn: () => getSupplierInvoices(id), enabled: tab === 'Invoices' && can('payments:read') });
  const { data: ledRes } = useQuery({ queryKey: ['supplier-ledger', id], queryFn: () => getSupplierLedger(id), enabled: tab === 'Ledger' && can('payments:read') });

  if (supLoading) return <PageLoader />;
  const supplier = supRes?.data?.data;
  if (!supplier) return <div className="text-gray-400 p-6">Supplier not found.</div>;

  const ost      = ostRes?.data?.data;
  const invoices = invRes?.data?.data || [];
  const ledger   = ledRes?.data?.data;

  return (
    <div className="max-w-4xl space-y-4">
      <button onClick={() => navigate('/masters/suppliers')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Suppliers
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Badge variant={supplier.isActive ? 'green' : 'gray'}>{supplier.isActive ? 'Active' : 'Inactive'}</Badge>
            <Badge variant="blue">{supplier.type === 'vendor' ? 'Vendor' : supplier.type === 'donor' ? 'Donor' : 'Vendor + Donor'}</Badge>
          </div>
          <h1 className="text-xl font-bold text-gray-900">{supplier.name}</h1>
          {supplier.city && <p className="text-sm text-gray-400 mt-0.5">{supplier.city}</p>}
        </div>
        <div className="flex gap-2 flex-wrap">
          {can('payments:write') && (
            <Link to={`/payments/new?supplier=${id}`}
              className="btn-primary flex items-center gap-2 text-sm">
              <CreditCard className="h-4 w-4" /> Record Payment
            </Link>
          )}
          {can('masters:write') && (
            <Link to={`/masters/suppliers/${id}/edit`}
              className="btn-secondary flex items-center gap-2 text-sm">
              <Edit className="h-4 w-4" /> Edit
            </Link>
          )}
        </div>
      </div>

      {/* Outstanding stats */}
      {can('payments:read') && ost && (
        <div className="bg-white rounded-xl border border-gray-100 grid grid-cols-3 divide-x divide-gray-100 overflow-hidden">
          {[
            { label: 'Total Purchased', value: fmtAmt(ost.totalPurchased), color: 'text-gray-800' },
            { label: 'Total Paid',      value: fmtAmt(ost.totalPaid),      color: 'text-green-600' },
            { label: 'Outstanding',     value: fmtAmt(ost.outstanding),    color: ost.outstanding > 0 ? 'text-red-600' : 'text-gray-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="px-4 py-3 text-center">
              <p className={`text-xl font-black ${color}`}>{value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Supplier info cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Contact */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="h-4 w-4 text-gray-400" />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Contact</p>
          </div>
          {supplier.contactPerson && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-400 w-20 shrink-0">Contact</span>
              <span className="text-gray-800">{supplier.contactPerson}</span>
            </div>
          )}
          {supplier.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-3.5 w-3.5 text-gray-300" />
              <a href={`tel:${supplier.phone}`} className="text-primary-600 hover:underline">{supplier.phone}</a>
            </div>
          )}
          {supplier.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-3.5 w-3.5 text-gray-300" />
              <a href={`mailto:${supplier.email}`} className="text-primary-600 hover:underline">{supplier.email}</a>
            </div>
          )}
          {supplier.address && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="h-3.5 w-3.5 text-gray-300 mt-0.5 shrink-0" />
              <span className="text-gray-600">{[supplier.address, supplier.city].filter(Boolean).join(', ')}</span>
            </div>
          )}
          {supplier.gstin  && <div className="text-sm"><span className="text-gray-400 w-20 inline-block">GSTIN</span> <span className="font-mono text-xs">{supplier.gstin}</span></div>}
          {supplier.panNumber && <div className="text-sm"><span className="text-gray-400 w-20 inline-block">PAN</span> <span className="font-mono text-xs">{supplier.panNumber}</span></div>}
          {supplier.creditDays > 0 && <div className="text-sm"><span className="text-gray-400 w-20 inline-block">Credit Days</span> <span>{supplier.creditDays} days</span></div>}
        </div>

        {/* Bank Accounts */}
        {supplier.bankAccounts?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3 lg:col-span-2">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="h-4 w-4 text-gray-400" />
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Bank Accounts ({supplier.bankAccounts.length})</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {supplier.bankAccounts.map((acc, i) => (
                <div key={i} className={`rounded-lg p-3 space-y-1 border ${acc.isDefault ? 'border-primary-300 bg-orange-50' : 'border-gray-100 bg-gray-50'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-600">{acc.label || `Account ${i + 1}`}</span>
                    {acc.isDefault && <span className="text-xs text-primary-600 font-semibold">Default</span>}
                  </div>
                  {acc.bankName          && <div className="text-sm text-gray-700">{acc.bankName}</div>}
                  {acc.accountHolderName && <div className="text-xs text-gray-500">{acc.accountHolderName}</div>}
                  {acc.accountNumber     && <div className="text-xs font-mono text-gray-700">A/C: {acc.accountNumber}</div>}
                  {acc.ifscCode          && <div className="text-xs font-mono text-gray-500">IFSC: {acc.ifscCode}</div>}
                  {acc.upiId             && <div className="text-xs font-mono text-gray-500">UPI: {acc.upiId}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      {can('payments:read') && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="flex border-b border-gray-100">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 ${tab === t ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {t === 'Invoices'  && <ShoppingCart  className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />}
                {t === 'Payments'  && <CreditCard    className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />}
                {t === 'Ledger'    && <BookOpen      className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />}
                {t}
              </button>
            ))}
          </div>

          {/* Invoices tab */}
          {tab === 'Invoices' && (
            <div className="overflow-x-auto">
              {invoices.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No purchase invoices found</p>
              ) : (
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      {['Invoice No.', 'Date', 'Due Date', 'Invoice Total', 'Paid', 'Remaining', 'Status'].map((h) => (
                        <th key={h} className="table-th">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {invoices.map((inv, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="table-td font-mono text-xs">{inv.invoiceNumber || '—'}</td>
                        <td className="table-td text-sm">{fmt(inv.invoiceDate)}</td>
                        <td className={`table-td text-sm ${inv.isOverdue ? 'text-red-600 font-semibold' : ''}`}>
                          {inv.dueDate ? fmt(inv.dueDate) : '—'}
                          {inv.isOverdue && <span className="ml-1 text-xs">(Overdue)</span>}
                        </td>
                        <td className="table-td text-right font-semibold">{fmtAmt(inv.invoiceTotal)}</td>
                        <td className="table-td text-right text-green-700">{fmtAmt(inv.paidSoFar)}</td>
                        <td className="table-td text-right font-bold">{fmtAmt(inv.remaining)}</td>
                        <td className="table-td">
                          <Badge variant={STATUS_COLORS[inv.paymentStatus]}>{STATUS_LABELS[inv.paymentStatus]}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Payments tab */}
          {tab === 'Payments' && <PaymentsTab supplierId={id} />}

          {/* Ledger tab */}
          {tab === 'Ledger' && ledger && (
            <div>
              <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
                {[
                  { label: 'Total Purchases', value: fmtAmt(ledger.totalPurchased), color: 'text-gray-800' },
                  { label: 'Total Paid',       value: fmtAmt(ledger.totalPaid),      color: 'text-green-600' },
                  { label: 'Balance Due',      value: fmtAmt(ledger.outstanding),    color: ledger.outstanding > 0 ? 'text-red-600' : 'text-gray-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="px-4 py-3 text-center">
                    <p className={`text-lg font-bold ${color}`}>{value}</p>
                    <p className="text-xs text-gray-400">{label}</p>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      {['Date', 'Ref', 'Description', 'Purchase (Dr)', 'Payment (Cr)'].map((h) => (
                        <th key={h} className="table-th">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {ledger.entries.map((e) => (
                      <tr key={e._id} className="hover:bg-gray-50">
                        <td className="table-td text-sm text-gray-500">{fmt(e.date)}</td>
                        <td className="table-td font-mono text-xs">
                          {e.type === 'payment'
                            ? <Link to={`/payments/${e._id}`} className="text-primary-600 hover:underline">{e.number}</Link>
                            : e.number}
                        </td>
                        <td className="table-td text-sm max-w-xs truncate">
                          {e.description}
                          {e.status && e.status !== 'approved' && (
                            <Badge variant={e.status === 'pending_approval' ? 'yellow' : 'red'} className="ml-2">
                              {e.status === 'pending_approval' ? 'Pending' : 'Rejected'}
                            </Badge>
                          )}
                        </td>
                        <td className="table-td text-right font-semibold text-gray-900">{e.debit > 0 ? fmtAmt(e.debit) : '—'}</td>
                        <td className="table-td text-right font-semibold text-green-700">{e.credit > 0 ? fmtAmt(e.credit) : e.pendingAmount > 0 ? <span className="text-yellow-600">{fmtAmt(e.pendingAmount)} (pending)</span> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Inline payments tab using supplierPayment API
function PaymentsTab({ supplierId }) {
  const { data } = useQuery({
    queryKey: ['payments', { supplier: supplierId }],
    queryFn: () => import('../../../api/supplierPayment.api.js').then((m) => m.getPayments({ supplier: supplierId })),
  });
  const payments = data?.data?.data?.data || [];
  const STATUS_PAY_COLORS = { pending_approval: 'yellow', approved: 'green', rejected: 'red' };
  const PM_L = { cash: 'Cash', upi: 'UPI', neft: 'NEFT', rtgs: 'RTGS', cheque: 'Cheque' };

  if (payments.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">No payments recorded</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="bg-gray-50">
            {['Voucher No.', 'Date', 'Mode', 'Amount', 'Status'].map((h) => (
              <th key={h} className="table-th">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {payments.map((p) => (
            <tr key={p._id} className="hover:bg-gray-50 cursor-pointer" onClick={() => {}}>
              <td className="table-td">
                <Link to={`/payments/${p._id}`} className="font-mono text-xs text-primary-600 hover:underline">
                  {p.paymentNumber}
                </Link>
              </td>
              <td className="table-td text-sm text-gray-500">{fmt(p.paymentDate)}</td>
              <td className="table-td text-sm">{PM_L[p.paymentMode] || p.paymentMode}</td>
              <td className="table-td text-right font-semibold">₹{p.totalAmount.toLocaleString('en-IN')}</td>
              <td className="table-td">
                <Badge variant={STATUS_PAY_COLORS[p.status]}>
                  {p.status === 'pending_approval' ? 'Pending' : p.status === 'approved' ? 'Approved' : 'Rejected'}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
