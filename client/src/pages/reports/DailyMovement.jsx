import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getDailyReport, getDailyWhatsApp, downloadDailyPDF, downloadDailyExcel } from '../../api/report.api.js';
import { getDepartments } from '../../api/department.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { fDate } from '../../utils/formatters.js';
import { FileText, Sheet, MessageCircle, Copy, Check } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import toast from 'react-hot-toast';

const TYPE_LABELS = {
  STOCK_IN: 'Stock In', STOCK_OUT: 'Stock Out',
  TRANSFER: 'Transfer', WASTAGE: 'Wastage',
  OPENING_BALANCE: 'Opening', ADJUSTMENT: 'Adjustment',
};
const TYPE_VARIANTS = {
  STOCK_IN: 'success', STOCK_OUT: 'warning',
  TRANSFER: 'info', WASTAGE: 'danger',
};

const StatBox = ({ label, count, qty, color }) => (
  <div className={`card px-4 py-3 border-l-4 ${color}`}>
    <p className="text-xs text-gray-500 font-medium">{label}</p>
    <p className="text-2xl font-bold text-gray-900">{count}</p>
    <p className="text-xs text-gray-400">Total: {qty} units</p>
  </div>
);

const DailyMovement = () => {
  const [date, setDate] = useState(new Date());
  const [deptId, setDeptId] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [whatsappText, setWhatsappText] = useState('');
  const [copied, setCopied] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);

  const { data: deptsRes } = useQuery({ queryKey: ['departments'], queryFn: () => getDepartments() });
  const departments = deptsRes?.data?.data || [];

  const dateStr = date ? date.toISOString().split('T')[0] : '';
  const params = { date: dateStr, ...(deptId && { department: deptId }) };

  const { data, isLoading } = useQuery({
    queryKey: ['report-daily', dateStr, deptId],
    queryFn: () => getDailyReport(params),
    enabled: submitted && Boolean(dateStr),
    staleTime: 30000,
  });

  const report = data?.data?.data;
  const transactions = report?.transactions || [];
  const summary = report?.summary || { STOCK_IN: {}, STOCK_OUT: {}, TRANSFER: {}, WASTAGE: {} };

  const handleView = (e) => { e.preventDefault(); setSubmitted(true); setShowWhatsApp(false); };

  const pdfMutation = useMutation({
    mutationFn: () => downloadDailyPDF(params, dateStr),
    onError: () => toast.error('PDF export failed'),
  });

  const excelMutation = useMutation({
    mutationFn: () => downloadDailyExcel(params, dateStr),
    onError: () => toast.error('Excel export failed'),
  });

  const whatsappMutation = useMutation({
    mutationFn: () => getDailyWhatsApp(params),
    onSuccess: (res) => {
      setWhatsappText(res.data.data.text);
      setShowWhatsApp(true);
    },
    onError: () => toast.error('Failed to generate summary'),
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(whatsappText);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsAppOpen = () => {
    const encoded = encodeURIComponent(whatsappText);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  return (
    <div>
      <PageHeader
        title="Daily Movement Report"
        subtitle="All transactions for a selected date"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Daily Movement' }]}
      />

      {/* Filter form */}
      <form onSubmit={handleView} className="card p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Date *</label>
            <DatePicker
              selected={date}
              onChange={(d) => { setDate(d); setSubmitted(false); }}
              dateFormat="dd/MM/yyyy"
              maxDate={new Date()}
              className="input text-sm"
              required
            />
          </div>
          <div className="flex-1 min-w-[160px] max-w-xs">
            <label className="label">Department</label>
            <select
              value={deptId}
              onChange={(e) => { setDeptId(e.target.value); setSubmitted(false); }}
              className="input text-sm"
            >
              <option value="">All Departments</option>
              {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </div>
          <button type="submit" disabled={!date} className="btn btn-primary">View Report</button>
        </div>
      </form>

      {submitted && isLoading && <PageLoader />}

      {submitted && !isLoading && report && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <StatBox label="Stock In"  count={summary.STOCK_IN?.count || 0}  qty={summary.STOCK_IN?.totalQty || 0}  color="border-green-500" />
            <StatBox label="Stock Out" count={summary.STOCK_OUT?.count || 0} qty={summary.STOCK_OUT?.totalQty || 0} color="border-amber-500" />
            <StatBox label="Transfers" count={summary.TRANSFER?.count || 0}  qty={summary.TRANSFER?.totalQty || 0}  color="border-blue-500"  />
            <StatBox label="Wastage"   count={summary.WASTAGE?.count || 0}   qty={summary.WASTAGE?.totalQty || 0}   color="border-red-500"   />
          </div>

          {/* Export buttons */}
          <div className="card p-4 mb-4 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-600 mr-2">Export:</span>
            <button
              onClick={() => pdfMutation.mutate()}
              disabled={pdfMutation.isPending || transactions.length === 0}
              className="btn btn-ghost text-sm flex items-center gap-1.5 border"
            >
              <FileText className="h-4 w-4 text-red-500" />
              {pdfMutation.isPending ? 'Generating…' : 'PDF'}
            </button>
            <button
              onClick={() => excelMutation.mutate()}
              disabled={excelMutation.isPending || transactions.length === 0}
              className="btn btn-ghost text-sm flex items-center gap-1.5 border"
            >
              <Sheet className="h-4 w-4 text-green-600" />
              {excelMutation.isPending ? 'Generating…' : 'Excel'}
            </button>
            <button
              onClick={() => whatsappMutation.mutate()}
              disabled={whatsappMutation.isPending}
              className="btn btn-ghost text-sm flex items-center gap-1.5 border"
            >
              <MessageCircle className="h-4 w-4 text-green-500" />
              {whatsappMutation.isPending ? 'Preparing…' : 'WhatsApp Summary'}
            </button>
          </div>

          {/* WhatsApp preview */}
          {showWhatsApp && whatsappText && (
            <div className="card p-4 mb-4 bg-green-50 border border-green-200">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-sm text-green-800 flex items-center gap-1.5">
                  <MessageCircle className="h-4 w-4" /> WhatsApp Summary
                </h4>
                <div className="flex gap-2">
                  <button onClick={handleCopy} className="btn btn-ghost text-xs flex items-center gap-1 border border-green-300">
                    {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button onClick={handleWhatsAppOpen} className="btn text-xs bg-green-500 text-white hover:bg-green-600 flex items-center gap-1 px-3 py-1.5 rounded-md">
                    <MessageCircle className="h-3 w-3" /> Open WhatsApp
                  </button>
                </div>
              </div>
              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed bg-white rounded p-3 border border-green-100 max-h-60 overflow-y-auto">
                {whatsappText}
              </pre>
            </div>
          )}

          {/* Transactions table */}
          {transactions.length === 0 ? (
            <div className="card p-10 text-center text-gray-500">
              No transactions recorded for {fDate(date)}.
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="px-4 py-2.5 border-b bg-gray-50 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">{transactions.length} transactions on {fDate(date)}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="table-th">TXN #</th>
                      <th className="table-th">Type</th>
                      <th className="table-th">Product</th>
                      <th className="table-th">From</th>
                      <th className="table-th">To</th>
                      <th className="table-th text-right">Qty</th>
                      <th className="table-th text-right">Value (₹)</th>
                      <th className="table-th">Ref</th>
                      <th className="table-th">By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {transactions.map((t) => (
                      <tr key={t._id} className="hover:bg-gray-50 text-sm">
                        <td className="table-td font-mono text-xs">{t.transactionNumber}</td>
                        <td className="table-td">
                          <Badge variant={TYPE_VARIANTS[t.transactionType] || 'default'} size="sm">
                            {TYPE_LABELS[t.transactionType]}
                          </Badge>
                        </td>
                        <td className="table-td">
                          <div className="font-medium">{t.product?.name}</div>
                          <div className="text-xs text-gray-400">{t.product?.code}</div>
                        </td>
                        <td className="table-td text-sm">{t.fromDepartment?.name || '—'}</td>
                        <td className="table-td text-sm">{t.toDepartment?.name || '—'}</td>
                        <td className="table-td text-right font-medium">
                          {t.quantity} <span className="text-xs text-gray-400">{t.unit?.symbol}</span>
                        </td>
                        <td className="table-td text-right text-gray-600">
                          {t.totalValue > 0 ? `₹${t.totalValue.toFixed(2)}` : '—'}
                        </td>
                        <td className="table-td text-xs text-gray-500">
                          {t.invoiceNumber || t.supplier?.name || t.donorName || ''}
                        </td>
                        <td className="table-td text-xs">{t.createdBy?.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!submitted && (
        <div className="card p-12 text-center text-gray-400">
          Select a date above to view the daily movement report.
        </div>
      )}
    </div>
  );
};

export default DailyMovement;
