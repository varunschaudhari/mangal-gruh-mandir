import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTransactions, voidTransaction } from '../../api/stockTransaction.api.js';
import { getDepartments } from '../../api/department.api.js';
import { getProducts } from '../../api/product.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import MobileCard from '../../components/ui/MobileCard.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { fDate, localDateStr } from '../../utils/formatters.js';
import { printTransactionReceipt } from '../../utils/printReceipt.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { useIsMobile } from '../../hooks/useMediaQuery.js';
import toast from 'react-hot-toast';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Printer, Download, X, SlidersHorizontal } from 'lucide-react';
import { exportToExcel } from '../../utils/exportToExcel.js';
import { useT, rich } from '../../i18n/index.jsx';


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

const TYPES = ['STOCK_IN', 'STOCK_OUT', 'TRANSFER', 'WASTAGE'];

const TransactionHistory = () => {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const isMobile = useIsMobile();
  const t = useT();

  const [filters, setFilters] = useState({
    transactionType: '', department: '', product: '', startDate: null, endDate: null,
  });
  const [page, setPage] = useState(1);
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [selectedProductName, setSelectedProductName] = useState('');
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const productBoxRef = useRef(null);

  // Close the product dropdown on any tap/click outside it.
  useEffect(() => {
    if (!showProductDropdown) return undefined;
    const handler = (e) => {
      if (productBoxRef.current && !productBoxRef.current.contains(e.target)) setShowProductDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showProductDropdown]);

  const { data: deptsRes } = useQuery({ queryKey: ['departments'], queryFn: () => getDepartments() });
  const departments = deptsRes?.data?.data || [];

  const { data: productsRes } = useQuery({ queryKey: ['products'], queryFn: () => getProducts() });
  const allProducts = productsRes?.data?.data || [];
  const filteredProducts = productSearch
    ? allProducts.filter((p) =>
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.code.toLowerCase().includes(productSearch.toLowerCase())
      )
    : allProducts.slice(0, 20);

  const params = {
    page, limit: 20,
    ...(filters.transactionType && { transactionType: filters.transactionType }),
    ...(filters.department     && { department: filters.department }),
    ...(filters.product        && { product: filters.product }),
    ...(filters.startDate      && { startDate: filters.startDate.toISOString() }),
    ...(filters.endDate        && { endDate: filters.endDate.toISOString() }),
  };

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', params],
    queryFn: () => getTransactions(params),
    placeholderData: (prev) => prev,
  });

  const voidMutation = useMutation({
    mutationFn: ({ id, reason }) => voidTransaction(id, reason),
    onSuccess: () => {
      toast.success(t('Transaction voided'));
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['balance'] });
      setVoidTarget(null);
      setVoidReason('');
    },
    onError: (err) => toast.error(err.response?.data?.message || t('Failed to void')),
  });

  const txns = data?.data?.data?.transactions || [];
  const pagination = data?.data?.data?.pagination;

  const setFilter = (key, value) => { setFilters((f) => ({ ...f, [key]: value })); setPage(1); };

  const handleExport = () => {
    const rows = txns.map((tx) => ({
      'TXN #':           tx.transactionNumber,
      'Date':            tx.transactionDate ? new Date(tx.transactionDate).toLocaleDateString('en-IN') : '',
      'Type':            TYPE_LABELS[tx.transactionType] || tx.transactionType,
      'Product':         tx.product?.name || '',
      'Product Code':    tx.product?.code || '',
      'From Dept':       tx.fromDepartment?.name || '',
      'To Dept':         tx.toDepartment?.name || '',
      'Quantity':        tx.quantity,
      'Unit':            tx.unit?.symbol || '',
      'Supplier':        tx.supplier?.name || '',
      'Rate (₹)':        tx.rate || '',
      'Total Value (₹)': tx.totalValue || '',
      'Recorded By':     tx.createdBy?.name || '',
      'Status':          tx.isVoided ? 'Voided' : 'Active',
    }));
    const dateStr = localDateStr();
    exportToExcel(rows, `Transactions_${dateStr}`, 'Transactions');
  };

  const clearProductFilter = () => {
    setFilter('product', '');
    setSelectedProductName('');
    setProductSearch('');
  };

  const closeVoid = () => { setVoidTarget(null); setVoidReason(''); };

  const hasFilters = filters.transactionType || filters.department || filters.product || filters.startDate || filters.endDate;
  // The product search stays visible on phones; this counts what's folded away.
  const hiddenFilterCount = [filters.transactionType, filters.department, filters.startDate, filters.endDate].filter(Boolean).length;
  const hasPages = pagination && pagination.totalPages > 1;

  return (
    <div>
      <PageHeader
        title="Transaction History"
        breadcrumbs={[{ label: 'Transactions' }, { label: 'History' }]}
        actions={
          txns.length > 0 && (
            <button onClick={handleExport} className="btn btn-ghost text-sm flex items-center gap-1.5">
              <Download className="h-4 w-4" /> {t('Export Excel')}
            </button>
          )
        }
      />

      {/* ── Filters ── phones: product search + a toggle for the rest */}
      <div className="card p-3 sm:p-4 mb-4 flex flex-wrap items-end gap-3">

        <div className="flex w-full items-end gap-2 sm:w-auto">
          {/* Product search */}
          <div ref={productBoxRef} className="relative min-w-0 flex-1 sm:flex-none">
            <label className="label hidden sm:block">{t('Product')}</label>
            <div className="relative">
              <input
                type="text"
                value={selectedProductName || productSearch}
                onChange={(e) => {
                  if (filters.product) clearProductFilter();
                  setProductSearch(e.target.value);
                  setShowProductDropdown(true);
                }}
                onFocus={() => setShowProductDropdown(true)}
                placeholder={t('Search product…')}
                enterKeyHint="search"
                className={`input text-sm sm:w-48 ${filters.product ? 'pr-10' : ''}`}
              />
              {filters.product && (
                <button
                  onClick={clearProductFilter}
                  aria-label={t('Clear product filter')}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                </button>
              )}
            </div>
            {showProductDropdown && !filters.product && (
              <div className="absolute left-0 z-20 top-full mt-1 w-full sm:w-64 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 sm:max-h-52 overflow-y-auto overscroll-contain">
                {filteredProducts.length === 0 ? (
                  <div className="p-3 text-sm text-gray-400">{t('No products found')}</div>
                ) : (
                  filteredProducts.map((p) => (
                    <button
                      key={p._id}
                      className="w-full text-left px-3 py-3 sm:py-2 text-sm hover:bg-gray-50 active:bg-gray-100 flex items-center gap-2"
                      onClick={() => {
                        setFilter('product', p._id);
                        setSelectedProductName(p.name);
                        setProductSearch('');
                        setShowProductDropdown(false);
                      }}
                    >
                      <span className="flex-1 font-medium truncate">{p.name}</span>
                      <span className="text-xs text-gray-400 font-mono">{p.code}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className={`btn-secondary relative shrink-0 px-3 sm:hidden ${showFilters ? 'bg-gray-100' : ''}`}>
            <SlidersHorizontal className="h-4 w-4" />
            <span className="sr-only">{t('Filters')}</span>
            {hiddenFilterCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary-600 px-1 text-[11px] font-semibold text-white">
                {hiddenFilterCount}
              </span>
            )}
          </button>
        </div>

        <div className={`${showFilters ? 'grid' : 'hidden'} w-full grid-cols-2 gap-3 sm:contents`}>
          {/* Type */}
          <div className="col-span-2">
            <label className="label">{t('Type')}</label>
            <select value={filters.transactionType} onChange={(e) => setFilter('transactionType', e.target.value)} className="input text-sm">
              <option value="">{t('All Types')}</option>
              {TYPES.map((ty) => <option key={ty} value={ty}>{t(TYPE_LABELS[ty])}</option>)}
            </select>
          </div>

          {/* Department */}
          <div className="col-span-2">
            <label className="label">{t('Department')}</label>
            <select value={filters.department} onChange={(e) => setFilter('department', e.target.value)} className="input text-sm">
              <option value="">{t('All Departments')}</option>
              {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </div>

          {/* Date range */}
          <div className="min-w-0 sm:min-w-[auto]">
            <label className="label">{t('From Date')}</label>
            <DatePicker
              selected={filters.startDate}
              onChange={(d) => setFilter('startDate', d)}
              dateFormat="dd/MM/yyyy"
              placeholderText={t('Start date')}
              className="input text-sm"
              maxDate={filters.endDate || new Date()}
              withPortal={isMobile}
            />
          </div>
          <div className="min-w-0 sm:min-w-[auto]">
            <label className="label">{t('To Date')}</label>
            <DatePicker
              selected={filters.endDate}
              onChange={(d) => setFilter('endDate', d)}
              dateFormat="dd/MM/yyyy"
              placeholderText={t('End date')}
              className="input text-sm"
              maxDate={new Date()}
              minDate={filters.startDate}
              withPortal={isMobile}
            />
          </div>

          {hasFilters && (
            <button
              onClick={() => {
                setFilters({ transactionType: '', department: '', product: '', startDate: null, endDate: null });
                setSelectedProductName('');
                setProductSearch('');
                setPage(1);
              }}
              className="btn btn-ghost text-sm col-span-2"
            >
              <span className="hidden sm:inline">{t('Clear')}</span>
              <span className="sm:hidden">{t('Clear all filters')}</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Phones: card list ── */}
      <div className="md:hidden">
        {isLoading ? (
          <PageLoader />
        ) : txns.length === 0 ? (
          <div className="card p-8 text-center text-gray-500">{t('No transactions found.')}</div>
        ) : (
          <div className="space-y-2.5">
            {txns.map((tx) => (
              <MobileCard
                key={tx._id}
                className={tx.isVoided ? 'opacity-60' : ''}
                title={tx.product?.name}
                subtitle={<><span className="font-mono">{tx.transactionNumber}</span> · {fDate(tx.transactionDate)}</>}
                aside={<Badge variant={TYPE_VARIANTS[tx.transactionType]} size="sm">{t(TYPE_LABELS[tx.transactionType])}</Badge>}
                fields={[
                  { label: t('Qty'), value: <span className="font-semibold text-gray-900">{tx.quantity} <span className="text-xs font-normal text-gray-400">{tx.unit?.symbol}</span></span> },
                  { label: t('By'), value: tx.createdBy?.name },
                  { label: t('From'), value: tx.fromDepartment?.name },
                  { label: t('To'), value: tx.toDepartment?.name },
                ]}
                footer={
                  <>
                    {tx.isVoided && <Badge variant="danger" size="sm" className="mr-auto">{t('Voided')}</Badge>}
                    <button
                      onClick={() => printTransactionReceipt(tx)}
                      className="btn-ghost p-2 text-gray-500"
                      aria-label={t('Print receipt')}
                    >
                      <Printer className="h-4 w-4" />
                    </button>
                    {can('transactions:delete') && !tx.isVoided && (
                      <button onClick={() => setVoidTarget(tx)} className="btn-ghost px-3 py-2 text-sm text-red-600">
                        {t('Void')}
                      </button>
                    )}
                  </>
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div className={`card overflow-hidden ${hasPages ? 'mt-3 md:mt-0' : 'hidden md:block'}`}>
        <div className="hidden md:block">
          {isLoading ? (
            <PageLoader />
          ) : txns.length === 0 ? (
            <div className="p-8 text-center text-gray-500">{t('No transactions found.')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="table-th">{t('TXN #')}</th>
                    <th className="table-th">{t('Date')}</th>
                    <th className="table-th">{t('Type')}</th>
                    <th className="table-th">{t('Product')}</th>
                    <th className="table-th">{t('From')}</th>
                    <th className="table-th">{t('To')}</th>
                    <th className="table-th text-right">{t('Qty')}</th>
                    <th className="table-th">{t('By')}</th>
                    <th className="table-th">{t('Status')}</th>
                    <th className="table-th" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {txns.map((tx) => (
                    <tr key={tx._id} className={`hover:bg-gray-50 ${tx.isVoided ? 'opacity-50' : ''}`}>
                      <td className="table-td font-mono text-xs">{tx.transactionNumber}</td>
                      <td className="table-td text-sm">{fDate(tx.transactionDate)}</td>
                      <td className="table-td">
                        <Badge variant={TYPE_VARIANTS[tx.transactionType]} size="sm">{t(TYPE_LABELS[tx.transactionType])}</Badge>
                      </td>
                      <td className="table-td">
                        <div className="text-sm font-medium">{tx.product?.name}</div>
                        <div className="text-xs text-gray-400">{tx.product?.code}</div>
                      </td>
                      <td className="table-td text-sm">{tx.fromDepartment?.name || '—'}</td>
                      <td className="table-td text-sm">{tx.toDepartment?.name || '—'}</td>
                      <td className="table-td text-right text-sm font-medium">
                        {tx.quantity} <span className="text-gray-400 text-xs">{tx.unit?.symbol}</span>
                      </td>
                      <td className="table-td text-sm">{tx.createdBy?.name}</td>
                      <td className="table-td">
                        {tx.isVoided
                          ? <Badge variant="danger"  size="sm">{t('Voided')}</Badge>
                          : <Badge variant="success" size="sm">{t('Active')}</Badge>
                        }
                      </td>
                      <td className="table-td">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => printTransactionReceipt(tx)}
                            className="p-1 text-gray-400 hover:text-primary-600 rounded"
                            title={t('Print receipt')}
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                          {can('transactions:delete') && !tx.isVoided && (
                            <button
                              onClick={() => setVoidTarget(tx)}
                              className="text-xs text-red-600 hover:underline"
                            >
                              {t('Void')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {hasPages && (
          <div className="flex items-center justify-between md:border-t px-4 py-2 md:py-3 text-sm text-gray-600">
            <span>{t('{n} transactions', { n: pagination.total })}</span>
            <div className="flex items-center gap-1 md:gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn btn-ghost min-h-[40px] disabled:opacity-40">{t('Prev')}</button>
              <span className="px-2 py-1">{page} / {pagination.totalPages}</span>
              <button disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)} className="btn btn-ghost min-h-[40px] disabled:opacity-40">{t('Next')}</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Void sheet ── */}
      <Modal open={!!voidTarget} onClose={closeVoid} title={t('Void Transaction')} size="md">
        {voidTarget && (
          <>
            <p className="text-sm text-gray-500 mb-4">
              {rich(t('Voiding {txn} will reverse its effect on stock balance.'), {
                txn: <span className="font-mono font-medium">{voidTarget.transactionNumber}</span>,
              })}
            </p>
            <label className="label">{t('Reason for Voiding')} *</label>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              className="input mb-4"
              rows={2}
              placeholder={t('Enter reason…')}
            />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button onClick={closeVoid} className="btn btn-ghost">{t('Cancel')}</button>
              <button
                onClick={() => voidMutation.mutate({ id: voidTarget._id, reason: voidReason })}
                disabled={!voidReason.trim() || voidMutation.isPending}
                className="btn btn-danger"
              >
                {voidMutation.isPending ? t('Voiding…') : t('Confirm Void')}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
};

export default TransactionHistory;
