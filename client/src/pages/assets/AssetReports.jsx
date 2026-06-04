import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { BarChart2, IndianRupee, AlertTriangle, Package, Download, FileText } from 'lucide-react';
import { getUtilizationReport, getFineReport, exportAssetExcel, exportAssetPDF } from '../../api/assetReport.api.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import DataTable from '../../components/ui/DataTable.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import toast from 'react-hot-toast';

const col = createColumnHelper();

function fDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href    = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Stat card ───────────────────────────────────────────────────────────────
const Stat = ({ icon: Icon, label, value, color, bg, border }) => (
  <div className={`rounded-xl border-l-4 ${border} ${bg} px-4 py-3 flex items-center gap-3`}>
    <Icon className={`h-5 w-5 shrink-0 ${color}`} />
    <div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
    </div>
  </div>
);

// ── Utilization Tab ─────────────────────────────────────────────────────────
const utilColumns = [
  col.accessor('assetName', { header: 'Asset',          cell: (i) => <span className="font-medium text-gray-900">{i.getValue()}</span> }),
  col.accessor('category',  { header: 'Category', size: 110, cell: (i) => <Badge variant="blue">{i.getValue()}</Badge> }),
  col.accessor('totalBorrows',  { header: 'Total Borrows', size: 100, cell: (i) => <span className="font-semibold">{i.getValue()}</span> }),
  col.accessor('avgDurationDays', { header: 'Avg Duration', size: 110, cell: (i) => <span>{i.getValue() || 0} days</span> }),
  col.accessor('checkedOutNow', {
    header: 'Currently Out', size: 110,
    cell: (i) => i.getValue() > 0
      ? <span className="font-semibold text-blue-600">{i.getValue()}</span>
      : <span className="text-gray-400">0</span>,
  }),
  col.accessor('overdueNow', {
    header: 'Overdue', size: 80,
    cell: (i) => i.getValue() > 0
      ? <span className="font-semibold text-red-600 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />{i.getValue()}</span>
      : <span className="text-gray-400">0</span>,
  }),
  col.accessor('damageCount', {
    header: 'Damages', size: 80,
    cell: (i) => i.getValue() > 0
      ? <span className="font-semibold text-amber-600">{i.getValue()}</span>
      : <span className="text-gray-400">0</span>,
  }),
  col.accessor('totalLateDays', { header: 'Total Late Days', size: 110, cell: (i) => <span>{i.getValue() || 0}</span> }),
];

// ── Fine Report Tab ─────────────────────────────────────────────────────────
const fineColumns = [
  col.accessor('transactionNumber', { header: 'Ref No.',   size: 150, cell: (i) => <span className="font-mono text-xs font-bold text-gray-500">{i.getValue() || '—'}</span> }),
  col.accessor('asset.name',        { header: 'Asset',           cell: (i) => <span className="font-medium text-gray-900">{i.getValue()}</span> }),
  col.accessor('borrower.name',     { header: 'Borrower',        cell: (i) => <span className="text-gray-700">{i.getValue()}</span> }),
  col.accessor('lateDays',          { header: 'Late Days',  size: 80,  cell: (i) => <span className={i.getValue() > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}>{i.getValue() || 0}</span> }),
  col.accessor('fineAmount',        { header: 'Fine (₹)',   size: 90,  cell: (i) => <span className="font-semibold">₹{(i.getValue() || 0).toLocaleString('en-IN')}</span> }),
  col.display({
    id: 'fineStatus', header: 'Fine Status', size: 100,
    cell: ({ row }) => {
      const { fineApplied, fineWaived, lateDays } = row.original;
      if (fineApplied) return <Badge variant="red">Applied</Badge>;
      if (fineWaived)  return <Badge variant="gray">Waived</Badge>;
      if (lateDays > 0) return <Badge variant="yellow">Pending</Badge>;
      return <span className="text-gray-400">—</span>;
    },
  }),
  col.accessor('actualReturnDate', { header: 'Returned On', size: 110, cell: (i) => <span className="text-xs text-gray-500">{fDate(i.getValue())}</span> }),
];

// ── Main Page ───────────────────────────────────────────────────────────────
const AssetReports = () => {
  const [tab,     setTab]     = useState('utilization');
  const [from,    setFrom]    = useState('');
  const [to,      setTo]      = useState('');
  const [exporting, setExporting] = useState(false);

  const debouncedFrom = useDebounce(from, 400);
  const debouncedTo   = useDebounce(to,   400);

  const { data: utilRes, isLoading: utilLoading } = useQuery({
    queryKey: ['asset-utilization'],
    queryFn: getUtilizationReport,
  });

  const { data: fineRes, isLoading: fineLoading } = useQuery({
    queryKey: ['asset-fines', debouncedFrom, debouncedTo],
    queryFn: () => getFineReport({ from: debouncedFrom || undefined, to: debouncedTo || undefined }),
  });

  const utilData   = utilRes?.data?.data || [];
  const fineResult = fineRes?.data?.data || {};
  const fineTxns   = fineResult.transactions || [];
  const fineSummary = fineResult.summary || {};

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const res = await exportAssetExcel({ from: from || undefined, to: to || undefined });
      downloadBlob(res.data, `asset-report-${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch { toast.error('Export failed'); }
    finally { setExporting(false); }
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const res = await exportAssetPDF({ from: from || undefined, to: to || undefined });
      downloadBlob(res.data, `asset-report-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch { toast.error('Export failed'); }
    finally { setExporting(false); }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Asset Reports"
        subtitle="Utilization and fine collection analytics"
        breadcrumbs={[{ label: 'Assets' }, { label: 'Reports' }]}
        actions={
          <div className="flex gap-2">
            <button onClick={handleExportExcel} disabled={exporting} className="btn-secondary flex items-center gap-2 text-sm">
              <Download className="h-4 w-4" /> Excel
            </button>
            <button onClick={handleExportPDF} disabled={exporting} className="btn-secondary flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4" /> PDF
            </button>
          </div>
        }
      />

      {/* Date range filter */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input text-sm py-1.5" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">To</label>
          <input type="date" value={to} max={new Date().toISOString().split('T')[0]} onChange={(e) => setTo(e.target.value)} className="input text-sm py-1.5" />
        </div>
        {(from || to) && (
          <button onClick={() => { setFrom(''); setTo(''); }} className="text-xs text-gray-400 hover:text-gray-600 underline">Clear</button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { key: 'utilization', icon: BarChart2, label: 'Utilization' },
          { key: 'fines',       icon: IndianRupee, label: 'Fine Collection' },
        ].map(({ key, icon: Icon, label }) => (
          <button
            key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* ── Utilization Tab ── */}
      {tab === 'utilization' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat icon={Package}      label="Total Assets Tracked"  value={utilData.length}                               color="text-purple-600" bg="bg-purple-50" border="border-purple-400" />
            <Stat icon={BarChart2}    label="Total Borrows"         value={utilData.reduce((s, r) => s + r.totalBorrows, 0)} color="text-blue-600"   bg="bg-blue-50"   border="border-blue-400"   />
            <Stat icon={AlertTriangle} label="Currently Overdue"    value={utilData.reduce((s, r) => s + r.overdueNow, 0)}  color="text-red-600"    bg="bg-red-50"    border="border-red-400"    />
            <Stat icon={Package}      label="Total Damages"         value={utilData.reduce((s, r) => s + r.damageCount, 0)} color="text-amber-600"  bg="bg-amber-50"  border="border-amber-400"  />
          </div>
          <DataTable columns={utilColumns} data={utilData} loading={utilLoading} />
        </div>
      )}

      {/* ── Fine Collection Tab ── */}
      {tab === 'fines' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat icon={IndianRupee}   label="Total Fines Collected" value={`₹${(fineSummary.totalFineAmount || 0).toLocaleString('en-IN')}`} color="text-green-600"  bg="bg-green-50"  border="border-green-400"  />
            <Stat icon={IndianRupee}   label="Fines Applied"         value={fineSummary.fineAppliedCount || 0}                                color="text-blue-600"   bg="bg-blue-50"   border="border-blue-400"   />
            <Stat icon={Package}       label="Fines Waived"          value={fineSummary.fineWaivedCount  || 0}                                color="text-gray-600"   bg="bg-gray-50"   border="border-gray-400"   />
            <Stat icon={AlertTriangle} label="Pending (Overdue)"     value={fineSummary.overdueCount     || 0}                                color="text-red-600"    bg="bg-red-50"    border="border-red-400"    />
          </div>
          <DataTable columns={fineColumns} data={fineTxns} loading={fineLoading} />
        </div>
      )}
    </div>
  );
};

export default AssetReports;
