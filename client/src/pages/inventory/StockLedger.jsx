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
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

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
      <form onSubmit={handleView} className="card p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="label">Product *</label>
            <SearchableSelect
              value={productId}
              onChange={(v) => { setProductId(v); setSubmitted(false); }}
              options={products.map((p) => ({ value: p._id, label: p.name, sub: p.code }))}
              placeholder="Select product…"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="label">Department *</label>
            <SearchableSelect
              value={departmentId}
              onChange={(v) => { setDepartmentId(v); setSubmitted(false); }}
              options={departments.map((d) => ({ value: d._id, label: d.name }))}
              placeholder="Select department…"
            />
          </div>
          <div>
            <label className="label">From Date</label>
            <DatePicker
              selected={startDate}
              onChange={(d) => { setStartDate(d); setSubmitted(false); }}
              dateFormat="dd/MM/yyyy"
              placeholderText="All time"
              className="input text-sm"
              maxDate={endDate || new Date()}
              isClearable
            />
          </div>
          <div>
            <label className="label">To Date</label>
            <DatePicker
              selected={endDate}
              onChange={(d) => { setEndDate(d); setSubmitted(false); }}
              dateFormat="dd/MM/yyyy"
              placeholderText="Till today"
              className="input text-sm"
              maxDate={new Date()}
              minDate={startDate}
              isClearable
            />
          </div>
          <button type="submit" disabled={!productId || !departmentId} className="btn btn-primary">
            View Ledger
          </button>
        </div>
      </form>

      {/* Results */}
      {submitted && (isLoading || isFetching) && <PageLoader />}

      {submitted && !isLoading && ledger && (
        <>
          {/* Summary bar */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="card px-4 py-3 flex items-center gap-2 text-sm">
              <span className="text-gray-500">Product:</span>
              <span className="font-semibold">{ledger.product?.name}</span>
              <span className="text-gray-400 font-mono text-xs">{ledger.product?.code}</span>
            </div>
            <div className="card px-4 py-3 flex items-center gap-2 text-sm">
              <span className="text-gray-500">Department:</span>
              <span className="font-semibold">{ledger.department?.name}</span>
            </div>
            <div className="card px-4 py-3 flex items-center gap-2 text-sm">
              <span className="text-gray-500">Opening:</span>
              <span className="font-bold">{ledger.openingBalance} {unitSymbol}</span>
            </div>
            <div className="card px-4 py-3 flex items-center gap-2 text-sm">
              <span className="text-gray-500">Closing:</span>
              <span className="font-bold text-primary-700">{ledger.closingBalance} {unitSymbol}</span>
            </div>
            <div className="card px-4 py-3 text-sm text-gray-500">
              {rows.length} transaction{rows.length !== 1 ? 's' : ''}
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="card p-8 text-center text-gray-500">
              No transactions found for the selected period.
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="table-th">Date</th>
                      <th className="table-th">TXN #</th>
                      <th className="table-th">Type</th>
                      <th className="table-th">From / To</th>
                      <th className="table-th text-right">In ({unitSymbol})</th>
                      <th className="table-th text-right">Out ({unitSymbol})</th>
                      <th className="table-th text-right">Balance ({unitSymbol})</th>
                      <th className="table-th">Ref / Notes</th>
                      <th className="table-th">By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {/* Opening balance row */}
                    {startDate && (
                      <tr className="bg-blue-50 text-sm font-medium">
                        <td className="table-td text-gray-500">{fDate(startDate)}</td>
                        <td className="table-td text-gray-400 font-mono text-xs">—</td>
                        <td className="table-td"><Badge variant="default" size="sm">Opening</Badge></td>
                        <td className="table-td" colSpan={3} />
                        <td className="table-td text-right font-bold text-blue-700">{ledger.openingBalance}</td>
                        <td className="table-td text-gray-400 text-xs">Balance brought forward</td>
                        <td className="table-td" />
                      </tr>
                    )}

                    {rows.map((row) => (
                      <tr key={row._id} className="hover:bg-gray-50 text-sm">
                        <td className="table-td whitespace-nowrap">{fDate(row.transactionDate)}</td>
                        <td className="table-td font-mono text-xs text-gray-500">{row.transactionNumber}</td>
                        <td className="table-td">
                          <Badge variant={TYPE_VARIANTS[row.transactionType]} size="sm">
                            {TYPE_LABELS[row.transactionType]}
                          </Badge>
                        </td>
                        <td className="table-td text-xs text-gray-500">
                          {row.fromDepartment && <span>From: {row.fromDepartment.name}</span>}
                          {row.toDepartment && <span>To: {row.toDepartment.name}</span>}
                        </td>
                        <td className="table-td text-right text-green-700 font-medium">
                          {row.inQty > 0 ? `+${row.inQty}` : ''}
                        </td>
                        <td className="table-td text-right text-red-600 font-medium">
                          {row.outQty > 0 ? `-${row.outQty}` : ''}
                        </td>
                        <td className="table-td text-right font-bold">{row.balance}</td>
                        <td className="table-td text-xs text-gray-500">
                          {row.invoiceNumber && <span>Inv: {row.invoiceNumber} </span>}
                          {row.supplier?.name && <span>{row.supplier.name} </span>}
                          {row.donorName && <span>Donor: {row.donorName} </span>}
                          {row.notes && <span>{row.notes}</span>}
                        </td>
                        <td className="table-td text-xs">{row.createdBy?.name}</td>
                      </tr>
                    ))}

                    {/* Closing balance row */}
                    <tr className="bg-primary-50 text-sm font-medium border-t-2 border-primary-200">
                      <td className="table-td text-gray-500" colSpan={6}>Closing Balance</td>
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
        <div className="card p-12 text-center text-gray-400">
          Select a product and department above to view the ledger.
        </div>
      )}
    </div>
  );
};

export default StockLedger;
