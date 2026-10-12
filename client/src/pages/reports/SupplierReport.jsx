import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Truck, FileText, Sheet, ChevronDown, ChevronRight } from 'lucide-react';
import { getSupplierReport, downloadSupplierPDF, downloadSupplierExcel } from '../../api/report.api.js';
import { getSuppliers } from '../../api/supplier.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import toast from 'react-hot-toast';
import { useIsMobile } from '../../hooks/useMediaQuery.js';
import { localDateStr } from '../../utils/formatters.js';
import { useT } from '../../i18n/index.jsx';

const fmt     = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const SupplierReport = () => {
  const t = useT();
  const isMobile = useIsMobile();
  const [startDate, setStartDate] = useState(null);
  const [endDate,   setEndDate]   = useState(null);
  const [supplierId, setSupplierId] = useState('');
  const [expanded,   setExpanded]  = useState({});

  const { data: suppRes } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => getSuppliers({ active: true }),
  });
  const supplierOptions = suppRes?.data?.data || [];

  const params = {
    ...(startDate  && { startDate: localDateStr(startDate) }),
    ...(endDate    && { endDate:   localDateStr(endDate) }),
    ...(supplierId && { supplier:  supplierId }),
  };

  const { data, isLoading } = useQuery({
    queryKey: ['supplier-report', params],
    queryFn: () => getSupplierReport(params),
  });

  const result     = data?.data?.data;
  const suppliers  = result?.suppliers || [];
  const grandTotal = result?.grandTotal || 0;
  const totalTxns  = result?.total || 0;

  const pdfMut = useMutation({
    mutationFn: () => downloadSupplierPDF(params),
    onError: () => toast.error(t('PDF export failed')),
  });

  const excelMut = useMutation({
    mutationFn: () => downloadSupplierExcel(params),
    onError: () => toast.error(t('Excel export failed')),
  });

  const toggle = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Supplier Purchase Report"
        subtitle="Purchases grouped by supplier"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Supplier Report' }]}
        actions={
          suppliers.length > 0 && (
            <div className="flex gap-2">
              <button onClick={() => pdfMut.mutate()} disabled={pdfMut.isPending}
                className="btn btn-ghost text-sm flex items-center gap-1.5 border">
                <FileText className="h-4 w-4 text-red-500" />
                {pdfMut.isPending ? t('Generating…') : 'PDF'}
              </button>
              <button onClick={() => excelMut.mutate()} disabled={excelMut.isPending}
                className="btn btn-ghost text-sm flex items-center gap-1.5 border">
                <Sheet className="h-4 w-4 text-green-600" />
                {excelMut.isPending ? t('Generating…') : t('Excel')}
              </button>
            </div>
          )
        }
      />

      {/* Filters */}
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">{t('From Date')}</label>
          <DatePicker
            selected={startDate}
            onChange={(d) => setStartDate(d)}
            selectsStart startDate={startDate} endDate={endDate}
            maxDate={endDate || new Date()}
            dateFormat="dd/MM/yyyy" isClearable placeholderText="All dates"
            className="input text-sm"
            withPortal={isMobile}
            customInput={<input inputMode={isMobile ? 'none' : 'text'} />}
          />
        </div>
        <div>
          <label className="label">{t('To Date')}</label>
          <DatePicker
            selected={endDate}
            onChange={(d) => setEndDate(d)}
            selectsEnd startDate={startDate} endDate={endDate}
            minDate={startDate} maxDate={new Date()}
            dateFormat="dd/MM/yyyy" isClearable placeholderText="All dates"
            className="input text-sm"
            withPortal={isMobile}
            customInput={<input inputMode={isMobile ? 'none' : 'text'} />}
          />
        </div>
        <div className="flex-1 min-w-[180px] max-w-xs">
          <label className="label">{t('Supplier')}</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="input text-sm">
            <option value="">{t('All Suppliers')}</option>
            {supplierOptions.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : suppliers.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <Truck className="h-10 w-10 mx-auto mb-3 text-gray-200" />
          <p>{t('No purchase transactions found for the selected filters.')}</p>
        </div>
      ) : (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="card px-4 py-3 border-l-4 border-primary-500">
              <p className="text-xs text-gray-500">{t('Total Purchased')}</p>
              <p className="text-xl font-bold text-primary-600">₹{fmt(grandTotal)}</p>
            </div>
            <div className="card px-4 py-3 border-l-4 border-blue-400">
              <p className="text-xs text-gray-500">{t('Suppliers')}</p>
              <p className="text-xl font-bold text-blue-600">{suppliers.length}</p>
            </div>
            <div className="card px-4 py-3 border-l-4 border-gray-300">
              <p className="text-xs text-gray-500">{t('Transactions')}</p>
              <p className="text-xl font-bold text-gray-700">{totalTxns}</p>
            </div>
          </div>

          {/* Per-supplier accordion */}
          <div className="space-y-3">
            {suppliers.map((sup) => {
              const sid = sup.supplier?._id;
              const open = !!expanded[sid];
              return (
                <div key={sid} className="card overflow-hidden">
                  {/* Supplier header */}
                  <button
                    onClick={() => toggle(sid)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                      <div className="text-left">
                        <p className="font-semibold text-gray-900">{sup.supplier?.name}</p>
                        {sup.supplier?.phone && <p className="text-xs text-gray-400">{sup.supplier.phone}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-900">₹{fmt(sup.totalValue)}</p>
                      <p className="text-xs text-gray-400">{sup.count} {t('transaction')}{sup.count !== 1 ? 's' : ''}</p>
                    </div>
                  </button>

                  {open && (
                    <div className="border-t border-gray-100 overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="table-th">{t('Date')}</th>
                            <th className="table-th">{t('Product')}</th>
                            <th className="table-th">{t('To Dept')}</th>
                            <th className="table-th text-right">{t('Qty')}</th>
                            <th className="table-th text-right">{t('Rate (₹)')}</th>
                            <th className="table-th text-right">{t('Value (₹)')}</th>
                            <th className="table-th">{t('Invoice')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {sup.transactions.map((txn) => (
                            <tr key={txn._id} className="hover:bg-gray-50">
                              <td className="table-td text-gray-500 text-xs">{fmtDate(txn.transactionDate)}</td>
                              <td className="table-td">
                                <p className="font-medium">{txn.product?.name}</p>
                                <p className="text-xs text-gray-400 font-mono">{txn.product?.code}</p>
                              </td>
                              <td className="table-td text-gray-600">{txn.toDepartment?.name}</td>
                              <td className="table-td text-right font-semibold">
                                {txn.quantity} <span className="text-xs text-gray-400">{txn.unit?.symbol}</span>
                              </td>
                              <td className="table-td text-right text-gray-600">
                                {txn.rate > 0 ? `₹${fmt(txn.rate)}` : '—'}
                              </td>
                              <td className="table-td text-right font-bold text-gray-900">
                                {txn.totalValue > 0 ? `₹${fmt(txn.totalValue)}` : '—'}
                              </td>
                              <td className="table-td text-xs text-gray-400 font-mono">{txn.invoiceNumber || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-orange-50 border-t border-orange-100">
                            <td className="table-td font-semibold text-primary-700" colSpan={5}>
                              {t('Subtotal —')} {sup.supplier?.name}
                            </td>
                            <td className="table-td text-right font-black text-primary-700">₹{fmt(sup.totalValue)}</td>
                            <td className="table-td" />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Grand total */}
          <div className="card px-4 py-3 bg-primary-50 border border-primary-200 flex justify-between items-center">
            <span className="font-bold text-primary-800">{t('Grand Total (')}{totalTxns} {t('transactions)')}</span>
            <span className="font-black text-primary-700 text-lg">₹{fmt(grandTotal)}</span>
          </div>
        </>
      )}
    </div>
  );
};

export default SupplierReport;
