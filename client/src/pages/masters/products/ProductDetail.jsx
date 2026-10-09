import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Pencil, Package, BarChart2,
  ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Trash2,
  AlertTriangle, CheckCircle2, Printer,
} from 'lucide-react';
import { getProduct } from '../../../api/product.api.js';
import { getBalances } from '../../../api/stockBalance.api.js';
import { getTransactions, voidTransaction } from '../../../api/stockTransaction.api.js';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import Badge from '../../../components/ui/Badge.jsx';
import { PageLoader } from '../../../components/ui/Spinner.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import { printTransactionReceipt } from '../../../utils/printReceipt.js';
import { fDate } from '../../../utils/formatters.js';
import { usePermissions } from '../../../hooks/usePermissions.js';
import toast from 'react-hot-toast';

const TYPE_LABELS = {
  STOCK_IN: 'Stock In', STOCK_OUT: 'Stock Out',
  TRANSFER: 'Transfer', WASTAGE: 'Wastage',
  OPENING_BALANCE: 'Opening', ADJUSTMENT: 'Adjustment',
};
const TYPE_VARIANTS = {
  STOCK_IN: 'success', STOCK_OUT: 'warning',
  TRANSFER: 'info', WASTAGE: 'danger',
  OPENING_BALANCE: 'default', ADJUSTMENT: 'default',
};
const TYPE_ICONS = {
  STOCK_IN: ArrowDownToLine, STOCK_OUT: ArrowUpFromLine,
  TRANSFER: ArrowLeftRight, WASTAGE: Trash2,
};

const ALERT_CONFIG = {
  out_of_stock: { label: 'Out of Stock', variant: 'danger'  },
  low_stock:    { label: 'Low Stock',    variant: 'warning' },
  reorder:      { label: 'Reorder Soon', variant: 'info'    },
};

const TAB_STOCK    = 'stock';
const TAB_HISTORY  = 'history';

const ProductDetail = () => {
  const { id } = useParams();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [tab, setTab] = useState(TAB_STOCK);
  const [page, setPage] = useState(1);
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState('');

  const { data: productRes, isLoading: loadingProduct } = useQuery({
    queryKey: ['product', id],
    queryFn: () => getProduct(id),
  });

  const { data: balancesRes, isLoading: loadingBalances } = useQuery({
    queryKey: ['balances', 'product', id],
    queryFn: () => getBalances({ product: id }),
    enabled: tab === TAB_STOCK,
  });

  const txnParams = { product: id, page, limit: 15, isVoided: undefined };
  const { data: txnRes, isLoading: loadingTxns } = useQuery({
    queryKey: ['transactions', txnParams],
    queryFn: () => getTransactions({ product: id, page, limit: 15 }),
    enabled: tab === TAB_HISTORY,
    placeholderData: (prev) => prev,
  });

  const voidMutation = useMutation({
    mutationFn: ({ txnId, reason }) => voidTransaction(txnId, reason),
    onSuccess: () => {
      toast.success('Transaction voided');
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['balances', 'product', id] });
      setVoidTarget(null);
      setVoidReason('');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to void'),
  });

  const closeVoid = () => { setVoidTarget(null); setVoidReason(''); };

  if (loadingProduct) return <PageLoader />;

  const product = productRes?.data?.data;
  if (!product) return <div className="p-8 text-center text-gray-500">Product not found.</div>;

  const balances = balancesRes?.data?.data || [];
  const txns = txnRes?.data?.data?.transactions || [];
  const pagination = txnRes?.data?.data?.pagination;

  const totalQty = balances.reduce((sum, b) => sum + (b.quantity || 0), 0);
  const hasAlert = balances.some((b) => b.alertLevel);

  return (
    <div className="space-y-4">
      <PageHeader
        title={product.name}
        subtitle={product.code}
        breadcrumbs={[
          { label: 'Masters' },
          { label: 'Products', to: '/masters/products' },
          { label: product.name },
        ]}
        actions={
          can('masters:write') && (
            <Link to={`/masters/products/${id}/edit`} className="btn btn-ghost text-sm flex items-center gap-1.5">
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          )
        }
      />

      {/* ── Product Info Card ── phones lead with the total stock */}
      <div className="card p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Category</p>
          <p className="font-medium">{product.category?.name || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Unit</p>
          <p className="font-medium">{product.unit?.name} ({product.unit?.symbol})</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Min Stock Level</p>
          <p className="font-medium">{product.minStockLevel || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Reorder Point</p>
          <p className="font-medium">{product.reorderPoint || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Standard Rate</p>
          <p className="font-medium">{product.standardRate ? `₹${product.standardRate}` : '—'}</p>
        </div>
        <div className="order-first col-span-2 border-b border-gray-100 pb-3 sm:order-none sm:col-span-1 sm:border-0 sm:pb-0">
          <p className="text-xs text-gray-400 mb-0.5">Total Stock</p>
          <p className="font-bold text-2xl sm:text-base">
            {totalQty} <span className="text-sm sm:text-xs font-normal text-gray-400">{product.unit?.symbol}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 col-span-2 empty:hidden sm:col-span-2 items-end">
          {product.isPujaItem  && <Badge variant="warning" size="sm">Puja Item</Badge>}
          {product.isPerishable && <Badge variant="info"    size="sm">Perishable</Badge>}
          {!product.isActive   && <Badge variant="danger"   size="sm">Inactive</Badge>}
          {hasAlert && <Badge variant="danger" size="sm">Stock Alert</Badge>}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b">
        {[
          { key: TAB_STOCK,   label: 'Stock by Department', short: 'By Department', icon: Package  },
          { key: TAB_HISTORY, label: 'Transaction History', short: 'History',       icon: BarChart2 },
        ].map(({ key, label, short, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { setTab(key); setPage(1); }}
            className={`flex flex-1 sm:flex-none justify-center items-center gap-1.5 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="sm:hidden">{short}</span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Stock by Department ── */}
      {tab === TAB_STOCK && (
        <div className="card overflow-hidden">
          {loadingBalances ? (
            <PageLoader />
          ) : balances.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>No stock recorded for this product yet.</p>
            </div>
          ) : (
            <>
            {/* Phones: one row per department */}
            <ul className="divide-y divide-gray-100 md:hidden">
              {balances.map((b) => {
                const cfg = ALERT_CONFIG[b.alertLevel];
                return (
                  <li key={b._id} className={`flex items-center justify-between gap-3 px-4 py-3 ${b.alertLevel ? 'bg-red-50/40' : ''}`}>
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium text-gray-900 break-words">{b.department?.name}</p>
                      <div className="mt-0.5">
                        {cfg
                          ? <Badge variant={cfg.variant} size="sm">{cfg.label}</Badge>
                          : <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle2 className="h-3.5 w-3.5" />OK</span>
                        }
                      </div>
                    </div>
                    <p className="shrink-0 text-right">
                      <span className="text-lg font-bold text-gray-900">{b.quantity}</span>
                      <span className="ml-1 text-xs text-gray-400">{product.unit?.symbol}</span>
                    </p>
                  </li>
                );
              })}
              <li className="flex items-center justify-between bg-gray-50 px-4 py-3 text-sm">
                <span className="font-semibold text-gray-700">Total</span>
                <span className="font-bold text-gray-900">
                  {totalQty} <span className="text-xs font-normal text-gray-400">{product.unit?.symbol}</span>
                </span>
              </li>
            </ul>

            <table className="hidden md:table min-w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="table-th">Department</th>
                  <th className="table-th text-right">Current Qty</th>
                  <th className="table-th text-right">Min Level</th>
                  <th className="table-th text-right">Reorder Point</th>
                  <th className="table-th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {balances.map((b) => {
                  const cfg = ALERT_CONFIG[b.alertLevel];
                  return (
                    <tr key={b._id} className={`text-sm ${b.alertLevel ? 'bg-red-50/40' : ''}`}>
                      <td className="table-td font-medium">{b.department?.name}</td>
                      <td className="table-td text-right">
                        <span className="font-bold text-base">{b.quantity}</span>
                        <span className="ml-1 text-xs text-gray-400">{product.unit?.symbol}</span>
                      </td>
                      <td className="table-td text-right text-gray-500">{product.minStockLevel || '—'}</td>
                      <td className="table-td text-right text-gray-500">{product.reorderPoint || '—'}</td>
                      <td className="table-td">
                        {cfg
                          ? <Badge variant={cfg.variant} size="sm">{cfg.label}</Badge>
                          : <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle2 className="h-3.5 w-3.5" />OK</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-gray-50">
                  <td className="table-td font-semibold">Total</td>
                  <td className="table-td text-right font-bold">
                    {totalQty} <span className="text-xs font-normal text-gray-400">{product.unit?.symbol}</span>
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
            </>
          )}
        </div>
      )}

      {/* ── Transaction History ── */}
      {tab === TAB_HISTORY && (
        <div className="card overflow-hidden">
          {loadingTxns ? (
            <PageLoader />
          ) : txns.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No transactions for this product.</div>
          ) : (
            <>
              {/* Phones: one row per transaction */}
              <ul className="divide-y divide-gray-100 md:hidden">
                {txns.map((t) => {
                  const Icon = TYPE_ICONS[t.transactionType];
                  const route = [t.fromDepartment?.name, t.toDepartment?.name].filter(Boolean).join(' → ');
                  return (
                    <li key={t._id} className={`px-4 py-3 ${t.isVoided ? 'opacity-60' : ''}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          {Icon && <Icon className="h-3.5 w-3.5 text-gray-400" />}
                          <Badge variant={TYPE_VARIANTS[t.transactionType]} size="sm">{TYPE_LABELS[t.transactionType]}</Badge>
                          <span className="text-sm text-gray-700">{fDate(t.transactionDate)}</span>
                        </div>
                        <span className="shrink-0 text-base font-semibold text-gray-900">
                          {t.quantity} <span className="text-xs font-normal text-gray-400">{t.unit?.symbol}</span>
                        </span>
                      </div>
                      {route && <p className="mt-1 text-xs text-gray-500 break-words">{route}</p>}
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-xs text-gray-400">
                          <span className="font-mono">{t.transactionNumber}</span>
                          {t.createdBy?.name && ` · ${t.createdBy.name}`}
                        </span>
                        <div className="-my-1.5 -mr-2 flex shrink-0 items-center">
                          {t.isVoided && <Badge variant="danger" size="sm">Voided</Badge>}
                          <button
                            onClick={() => printTransactionReceipt(t)}
                            className="rounded-md p-2.5 text-gray-400 active:bg-gray-100"
                            aria-label="Print receipt"
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                          {can('transactions:delete') && !t.isVoided && (
                            <button onClick={() => setVoidTarget(t)} className="rounded-md px-3 py-2.5 text-sm text-red-600 active:bg-red-50">
                              Void
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="table-th">TXN #</th>
                      <th className="table-th">Date</th>
                      <th className="table-th">Type</th>
                      <th className="table-th">From</th>
                      <th className="table-th">To</th>
                      <th className="table-th text-right">Qty</th>
                      <th className="table-th">By</th>
                      <th className="table-th">Status</th>
                      <th className="table-th" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {txns.map((t) => {
                      const Icon = TYPE_ICONS[t.transactionType];
                      return (
                        <tr key={t._id} className={`hover:bg-gray-50 text-sm ${t.isVoided ? 'opacity-50' : ''}`}>
                          <td className="table-td font-mono text-xs">{t.transactionNumber}</td>
                          <td className="table-td">{fDate(t.transactionDate)}</td>
                          <td className="table-td">
                            <div className="flex items-center gap-1.5">
                              {Icon && <Icon className="h-3.5 w-3.5 text-gray-400" />}
                              <Badge variant={TYPE_VARIANTS[t.transactionType]} size="sm">
                                {TYPE_LABELS[t.transactionType]}
                              </Badge>
                            </div>
                          </td>
                          <td className="table-td text-gray-600">{t.fromDepartment?.name || '—'}</td>
                          <td className="table-td text-gray-600">{t.toDepartment?.name || '—'}</td>
                          <td className="table-td text-right font-semibold">
                            {t.quantity} <span className="text-xs font-normal text-gray-400">{t.unit?.symbol}</span>
                          </td>
                          <td className="table-td text-gray-600">{t.createdBy?.name}</td>
                          <td className="table-td">
                            {t.isVoided
                              ? <Badge variant="danger"  size="sm">Voided</Badge>
                              : <Badge variant="success" size="sm">Active</Badge>
                            }
                          </td>
                          <td className="table-td">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => printTransactionReceipt(t)}
                                className="p-1 text-gray-400 hover:text-primary-600 rounded"
                                title="Print receipt"
                              >
                                <Printer className="h-4 w-4" />
                              </button>
                              {can('transactions:delete') && !t.isVoided && (
                                <button onClick={() => setVoidTarget(t)} className="text-xs text-red-600 hover:underline">
                                  Void
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-gray-600">
                  <span>{pagination.total} transactions</span>
                  <div className="flex items-center gap-1 md:gap-2">
                    <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn btn-ghost min-h-[40px] disabled:opacity-40">Prev</button>
                    <span className="px-2 py-1">{page} / {pagination.totalPages}</span>
                    <button disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)} className="btn btn-ghost min-h-[40px] disabled:opacity-40">Next</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Void sheet */}
      <Modal open={!!voidTarget} onClose={closeVoid} title="Void Transaction" size="md">
        {voidTarget && (
          <>
            <p className="text-sm text-gray-500 mb-4">
              Voiding <span className="font-mono font-medium">{voidTarget.transactionNumber}</span> will reverse its effect on stock balance.
            </p>
            <label className="label">Reason for Voiding *</label>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              className="input mb-4"
              rows={2}
              placeholder="Enter reason…"
            />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button onClick={closeVoid} className="btn btn-ghost">Cancel</button>
              <button
                onClick={() => voidMutation.mutate({ txnId: voidTarget._id, reason: voidReason })}
                disabled={!voidReason.trim() || voidMutation.isPending}
                className="btn btn-danger"
              >
                {voidMutation.isPending ? 'Voiding…' : 'Confirm Void'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
};

export default ProductDetail;
