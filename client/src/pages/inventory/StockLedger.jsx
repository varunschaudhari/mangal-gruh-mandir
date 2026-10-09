import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getLedger } from '../../api/stockLedger.api.js';
import { getDepartments } from '../../api/department.api.js';
import { getProducts } from '../../api/product.api.js';
import SearchableSelect from '../../components/ui/SearchableSelect.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { fDate } from '../../utils/formatters.js';
import { useIsMobile } from '../../hooks/useMediaQuery.js';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useT } from '../../i18n/index.jsx';

const TYPE_LABELS = {
  STOCK_IN: 'Stock In',
  STOCK_OUT: 'Stock Out',
  TRANSFER: 'Transfer',
  WASTAGE: 'Wastage',
  OPENING_BALANCE: 'Opening',
  ADJUSTMENT: 'Adjustment',
};

const TYPE_VARIANTS = {
  STOCK_IN: 'success',
  STOCK_OUT: 'warning',
  TRANSFER: 'info',
  WASTAGE: 'danger',
  OPENING_BALANCE: 'default',
  ADJUSTMENT: 'default',
};

const StockLedger = () => {
  const [productId, setProductId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const isMobile = useIsMobile();
  const t = useT();

  const { data: deptsRes } = useQuery({ queryKey: ['departments'], queryFn: () => getDepartments() });
  const { data: prodsRes } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => getProducts({ limit: 500, isActive: true }),
  });

  const departments = deptsRes?.data?.data || [];
  const products = prodsRes?.data?.data?.products || prodsRes?.data?.data || [];

  const params = {
    product: productId,
    department: departmentId,
    ...(startDate && { startDate: startDate.toISOString() }),
    ...(endDate && { endDate: endDate.toISOString() }),
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['ledger', params],
    queryFn: () => getLedger(params),
    enabled: submitted && Boolean(productId && departmentId),
    staleTime: 30000,
  });

  const ledger = data?.data?.data;
  const rows = ledger?.transactions || [];
  const unitSymbol = ledger?.product?.unit?.symbol || '';

  const handleView = (e) => {
    e.preventDefault();
    if (productId && departmentId) setSubmitted(true);
  };

  return (
    <div>
      <PageHeader
        title="Stock Ledger"
        subtitle="Full movement history for a product in a department"
        breadcrumbs={[{ label: 'Inventory' }, { label: 'Stock Ledger' }]}
      />

      {/* Filter form */}
      {/* Phones: product and department full width, the two dates side by side */}
      <form onSubmit={handleView} className="card p-3 sm:p-4 mb-4">
        <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
          <div className="col-span-2 min-w-0 sm:flex-1 sm:min-w-[180px]">
            <label className="label">{t('Product')} *</label>
            <SearchableSelect
              value={productId}
              onChange={(v) => { setProductId(v); setSubmitted(false); }}
              options={products.map((p) => ({ value: p._id, label: p.name, sub: p.code }))}
              placeholder={t('Select product…')}
            />
          </div>
          <div className="col-span-2 min-w-0 sm:flex-1 sm:min-w-[160px]">
            <label className="label">{t('Department')} *</label>
            <SearchableSelect
              value={departmentId}
              onChange={(v) => { setDepartmentId(v); setSubmitted(false); }}
              options={departments.map((d) => ({ value: d._id, label: d.name }))}
              placeholder={t('Select department…')}
            />
          </div>
          <div className="min-w-0 sm:min-w-[auto]">
            <label className="label">{t('From Date')}</label>
            <DatePicker
              selected={startDate}
              onChange={(d) => { setStartDate(d); setSubmitted(false); }}
              dateFormat="dd/MM/yyyy"
              placeholderText={t('All time')}
              className="input text-sm"
              maxDate={endDate || new Date()}
              isClearable
              withPortal={isMobile}
            />
          </div>
          <div className="min-w-0 sm:min-w-[auto]">
            <label className="label">{t('To Date')}</label>
            <DatePicker
              selected={endDate}
              onChange={(d) => { setEndDate(d); setSubmitted(false); }}
              dateFormat="dd/MM/yyyy"
              placeholderText={t('Till today')}
              className="input text-sm"
              maxDate={new Date()}
              minDate={startDate}
              isClearable
              withPortal={isMobile}
            />
          </div>
          <button type="submit" disabled={!productId || !departmentId} className="btn btn-primary col-span-2">
            {t('View Ledger')}
          </button>
        </div>
      </form>

      {/* Results */}
      {submitted && (isLoading || isFetching) && <PageLoader />}

      {submitted && !isLoading && ledger && (
        <>
          {/* Phones: one summary card */}
          <div className="card mb-4 p-4 sm:hidden">
            <p className="text-[15px] font-semibold text-gray-900 break-words">{ledger.product?.name}</p>
            <p className="text-xs text-gray-400">
              <span className="font-mono">{ledger.product?.code}</span> · {ledger.department?.name}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-gray-400">{t('Opening')}</p>
                <p className="text-base font-bold text-gray-900">{ledger.openingBalance} <span className="text-xs font-normal text-gray-400">{unitSymbol}</span></p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-gray-400">{t('Closing')}</p>
                <p className="text-base font-bold text-primary-700">{ledger.closingBalance} <span className="text-xs font-normal text-gray-400">{unitSymbol}</span></p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-gray-400">{t('Entries')}</p>
                <p className="text-base font-bold text-gray-900">{rows.length}</p>
              </div>
            </div>
          </div>

          {/* Summary bar */}
          <div className="hidden sm:flex flex-wrap gap-3 mb-4">
            <div className="card px-4 py-3 flex items-center gap-2 text-sm">
              <span className="text-gray-500">{t('Product')}:</span>
              <span className="font-semibold">{ledger.product?.name}</span>
              <span className="text-gray-400 font-mono text-xs">{ledger.product?.code}</span>
            </div>
            <div className="card px-4 py-3 flex items-center gap-2 text-sm">
              <span className="text-gray-500">{t('Department')}:</span>
              <span className="font-semibold">{ledger.department?.name}</span>
            </div>
            <div className="card px-4 py-3 flex items-center gap-2 text-sm">
              <span className="text-gray-500">{t('Opening')}:</span>
              <span className="font-bold">{ledger.openingBalance} {unitSymbol}</span>
            </div>
            <div className="card px-4 py-3 flex items-center gap-2 text-sm">
              <span className="text-gray-500">{t('Closing')}:</span>
              <span className="font-bold text-primary-700">{ledger.closingBalance} {unitSymbol}</span>
            </div>
            <div className="card px-4 py-3 text-sm text-gray-500">
              {t(rows.length !== 1 ? '{n} transactions' : '{n} transaction', { n: rows.length })}
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="card p-8 text-center text-gray-500">
              {t('No transactions found for the selected period.')}
            </div>
          ) : (
            <div className="card overflow-hidden">
              {/* Phones: one row per movement — type & date, in/out on the right, running balance below */}
              <ul className="divide-y divide-gray-100 md:hidden">
                {startDate && (
                  <li className="flex items-center justify-between gap-3 bg-blue-50 px-4 py-2.5 text-sm">
                    <span className="text-gray-600">{t('Opening')} · {fDate(startDate)}</span>
                    <span className="font-bold text-blue-700">{ledger.openingBalance} <span className="text-xs font-normal text-gray-400">{unitSymbol}</span></span>
                  </li>
                )}
                {rows.map((row) => {
                  const ref = [
                    row.fromDepartment && t('From {name}', { name: row.fromDepartment.name }),
                    row.toDepartment && t('To {name}', { name: row.toDepartment.name }),
                    row.invoiceNumber && t('Inv {n}', { n: row.invoiceNumber }),
                    row.supplier?.name,
                    row.donorName && t('Donor: {name}', { name: row.donorName }),
                    row.notes,
                  ].filter(Boolean).join(' · ');
                  return (
                    <li key={row._id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <Badge variant={TYPE_VARIANTS[row.transactionType]} size="sm">{t(TYPE_LABELS[row.transactionType])}</Badge>
                          <span className="text-sm text-gray-700">{fDate(row.transactionDate)}</span>
                        </div>
                        <span className={`shrink-0 text-base font-semibold ${row.inQty > 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {row.inQty > 0 ? `+${row.inQty}` : row.outQty > 0 ? `-${row.outQty}` : '0'}
                        </span>
                      </div>
                      {ref && <p className="mt-1 text-xs text-gray-500 break-words">{ref}</p>}
                      <div className="mt-1 flex items-center justify-between gap-3 text-xs text-gray-400">
                        <span className="min-w-0 truncate">
                          <span className="font-mono">{row.transactionNumber}</span>
                          {row.createdBy?.name && ` · ${row.createdBy.name}`}
                        </span>
                        <span className="shrink-0">{t('Bal')} <span className="font-semibold text-gray-800">{row.balance}</span> {unitSymbol}</span>
                      </div>
                    </li>
                  );
                })}
                <li className="flex items-center justify-between gap-3 border-t-2 border-primary-200 bg-primary-50 px-4 py-3 text-sm font-medium">
                  <span className="text-gray-600">{t('Closing Balance')}</span>
                  <span className="text-base font-bold text-primary-700">{ledger.closingBalance} <span className="text-xs font-normal text-gray-400">{unitSymbol}</span></span>
                </li>
              </ul>

              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="table-th">{t('Date')}</th>
                      <th className="table-th">{t('TXN #')}</th>
                      <th className="table-th">{t('Type')}</th>
                      <th className="table-th">{t('From / To')}</th>
                      <th className="table-th text-right">{t('In ({unit})', { unit: unitSymbol })}</th>
                      <th className="table-th text-right">{t('Out ({unit})', { unit: unitSymbol })}</th>
                      <th className="table-th text-right">{t('Balance ({unit})', { unit: unitSymbol })}</th>
                      <th className="table-th">{t('Ref / Notes')}</th>
                      <th className="table-th">{t('By')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {/* Opening balance row */}
                    {startDate && (
                      <tr className="bg-blue-50 text-sm font-medium">
                        <td className="table-td text-gray-500">{fDate(startDate)}</td>
                        <td className="table-td text-gray-400 font-mono text-xs">—</td>
                        <td className="table-td"><Badge variant="default" size="sm">{t('Opening')}</Badge></td>
                        <td className="table-td" colSpan={3} />
                        <td className="table-td text-right font-bold text-blue-700">{ledger.openingBalance}</td>
                        <td className="table-td text-gray-400 text-xs">{t('Balance brought forward')}</td>
                        <td className="table-td" />
                      </tr>
                    )}

                    {rows.map((row) => (
                      <tr key={row._id} className="hover:bg-gray-50 text-sm">
                        <td className="table-td whitespace-nowrap">{fDate(row.transactionDate)}</td>
                        <td className="table-td font-mono text-xs text-gray-500">{row.transactionNumber}</td>
                        <td className="table-td">
                          <Badge variant={TYPE_VARIANTS[row.transactionType]} size="sm">
                            {t(TYPE_LABELS[row.transactionType])}
                          </Badge>
                        </td>
                        <td className="table-td text-xs text-gray-500">
                          {row.fromDepartment && <span>{t('From: {name}', { name: row.fromDepartment.name })}</span>}
                          {row.toDepartment && <span>{t('To: {name}', { name: row.toDepartment.name })}</span>}
                        </td>
                        <td className="table-td text-right text-green-700 font-medium">
                          {row.inQty > 0 ? `+${row.inQty}` : ''}
                        </td>
                        <td className="table-td text-right text-red-600 font-medium">
                          {row.outQty > 0 ? `-${row.outQty}` : ''}
                        </td>
                        <td className="table-td text-right font-bold">{row.balance}</td>
                        <td className="table-td text-xs text-gray-500">
                          {row.invoiceNumber && <span>{t('Inv: {n}', { n: row.invoiceNumber })} </span>}
                          {row.supplier?.name && <span>{row.supplier.name} </span>}
                          {row.donorName && <span>{t('Donor: {name}', { name: row.donorName })} </span>}
                          {row.notes && <span>{row.notes}</span>}
                        </td>
                        <td className="table-td text-xs">{row.createdBy?.name}</td>
                      </tr>
                    ))}

                    {/* Closing balance row */}
                    <tr className="bg-primary-50 text-sm font-medium border-t-2 border-primary-200">
                      <td className="table-td text-gray-500" colSpan={6}>{t('Closing Balance')}</td>
                      <td className="table-td text-right font-bold text-primary-700 text-base">
                        {ledger.closingBalance}
                      </td>
                      <td className="table-td" colSpan={2} />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!submitted && (
        <div className="card px-6 py-10 sm:p-12 text-center text-gray-400">
          {t('Select a product and department above to view the ledger.')}
        </div>
      )}
    </div>
  );
};

export default StockLedger;
