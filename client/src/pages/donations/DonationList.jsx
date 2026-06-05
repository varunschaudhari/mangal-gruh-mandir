import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Printer, ChevronLeft, ChevronRight, IndianRupee, Package, Heart, Search, FileSpreadsheet, FileText, Download } from 'lucide-react';
import { getDonations, getDonationStats, voidDonation, exportDonationsExcel, exportDonationsPDF } from '../../api/donation.api.js';
import { getOccasions } from '../../api/donationOccasion.api.js';
import { printDonationReceipt } from '../../utils/donationReceipt.js';
import DataTable from '../../components/ui/DataTable.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import toast from 'react-hot-toast';

const TYPE_COLORS = { named: 'green', hundi: 'blue', anonymous: 'gray' };
const TYPE_LABELS = { named: 'Named', hundi: 'Hundi', anonymous: 'Anonymous' };
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const col = createColumnHelper();

const DonationList = () => {
  const { can } = usePermissions();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [typeFilter, setTypeFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to,   setTo]   = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(null);
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['donations', typeFilter, from, to, search, page],
    queryFn: () => getDonations({
      ...(typeFilter ? { type: typeFilter } : {}),
      ...(from   ? { from }   : {}),
      ...(to     ? { to }     : {}),
      ...(search ? { search } : {}),
      page, limit: 20,
    }),
    keepPreviousData: true,
  });

  const doExport = async (format) => {
    setExporting(format);
    try {
      const params = {
        ...(typeFilter ? { type: typeFilter } : {}),
        ...(from ? { from } : {}),
        ...(to   ? { to }   : {}),
      };
      const res = format === 'excel'
        ? await exportDonationsExcel(params)
        : await exportDonationsPDF(params);
      const url = URL.createObjectURL(res.data);
      const a   = document.createElement('a');
      a.href = url; a.download = `donations-${new Date().toISOString().split('T')[0]}.${format === 'excel' ? 'xlsx' : 'pdf'}`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Export failed'); }
    finally { setExporting(null); }
  };

  const { data: statsRes } = useQuery({
    queryKey: ['donation-stats', from, to],
    queryFn: () => getDonationStats({ from: from || undefined, to: to || undefined }),
  });

  const { data: occasionsRes } = useQuery({ queryKey: ['donation-occasions'], queryFn: () => getOccasions({ active: true }) });

  const voidMut = useMutation({
    mutationFn: () => voidDonation(voidTarget._id, { voidReason }),
    onSuccess: () => { toast.success('Donation voided'); qc.invalidateQueries({ queryKey: ['donations'] }); setVoidTarget(null); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const result   = data?.data?.data;
  const donations = result?.data  || [];
  const total     = result?.total || 0;
  const pages     = result?.pages || 1;
  const stats     = statsRes?.data?.data;

  const columns = [
    col.accessor('donationNumber', {
      header: 'Receipt No.', size: 150,
      cell: (i) => <span className="font-mono text-xs font-bold text-primary-600">{i.getValue() || '—'}</span>,
    }),
    col.accessor('date', {
      header: 'Date', size: 110,
      cell: (i) => <span className="text-sm text-gray-600">{fmt(i.getValue())}</span>,
    }),
    col.accessor('donationType', {
      header: 'Type', size: 95,
      cell: (i) => <Badge variant={TYPE_COLORS[i.getValue()]}>{TYPE_LABELS[i.getValue()]}</Badge>,
    }),
    col.display({
      id: 'donor', header: 'Donor',
      cell: ({ row }) => {
        const { donor, donorName, donationType } = row.original;
        const name = donor?.name || donorName;
        if (!name) return <span className="text-gray-400">{donationType === 'hundi' ? 'Hundi' : 'Anonymous'}</span>;
        return <span className="font-medium text-gray-900">{name}</span>;
      },
    }),
    col.accessor('occasion.name', {
      header: 'Occasion', size: 130,
      cell: (i) => <span className="text-gray-500 text-sm">{i.getValue() || '—'}</span>,
    }),
    col.accessor('cashAmount', {
      header: 'Cash', size: 100,
      cell: (i) => i.getValue() > 0
        ? <span className="font-semibold text-green-700">₹{i.getValue().toLocaleString('en-IN')}</span>
        : <span className="text-gray-400">—</span>,
    }),
    col.accessor('kindItems', {
      header: 'Kind Items', size: 90,
      cell: (i) => i.getValue()?.length > 0
        ? <span className="text-blue-600 font-semibold">{i.getValue().length} item{i.getValue().length > 1 ? 's' : ''}</span>
        : <span className="text-gray-400">—</span>,
    }),
    col.accessor('totalEstimatedValue', {
      header: 'Total Value', size: 110,
      cell: (i) => <span className="font-semibold text-gray-800">₹{(i.getValue() || 0).toLocaleString('en-IN')}</span>,
    }),
    col.display({
      id: 'actions', header: '', size: 90,
      cell: ({ row }) => {
        const { donationType, isVoided } = row.original;
        if (isVoided) return <span className="text-xs text-red-400">Voided</span>;
        return (
          <div className="flex gap-1">
            {donationType !== 'hundi' && (
              <button onClick={() => printDonationReceipt(row.original)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded" title="Print receipt">
                <Printer className="h-4 w-4" />
              </button>
            )}
            {can('donations:write') && (
              <button onClick={() => { setVoidTarget(row.original); setVoidReason(''); }}
                className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded">
                Void
              </button>
            )}
          </div>
        );
      },
    }),
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Donation History"
        subtitle="Cash and kind donations received"
        breadcrumbs={[{ label: 'Donations' }, { label: 'History' }]}
        actions={
          <div className="flex gap-2">
            <div className="relative">
              <button onClick={() => setExporting(exporting ? null : 'menu')} disabled={!!exporting && exporting !== 'menu'}
                className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50">
                <Download className="h-4 w-4" /> Export
              </button>
              {exporting === 'menu' && (
                <div className="absolute right-0 top-10 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-36">
                  <button onClick={() => doExport('excel')} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    <FileSpreadsheet className="h-4 w-4 text-green-600" /> Excel (.xlsx)
                  </button>
                  <button onClick={() => doExport('pdf')} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    <FileText className="h-4 w-4 text-red-500" /> PDF
                  </button>
                </div>
              )}
            </div>
            {can('donations:write') && (
              <Link to="/donations/new" className="btn-primary"><Plus className="h-4 w-4" /> Record Donation</Link>
            )}
          </div>
        }
      />

      {/* Stats strip */}
      {stats && (
        <div className="bg-white rounded-xl border border-gray-100 grid grid-cols-2 sm:grid-cols-5 divide-x divide-gray-100 overflow-hidden">
          {[
            { label: 'Total Records',    value: stats.totalCount,                                                                icon: Heart,        color: 'text-gray-700' },
            { label: 'Cash Collected',   value: `₹${(stats.totalCash || 0).toLocaleString('en-IN')}`,                         icon: IndianRupee,  color: 'text-green-600' },
            { label: 'Kind Value (Est)', value: `₹${(stats.totalKindValue || 0).toLocaleString('en-IN')}`,                    icon: Package,      color: 'text-blue-600' },
            { label: 'Named Donors',     value: stats.namedCount,                                                              icon: Heart,        color: 'text-purple-600' },
            { label: 'Hundi Entries',    value: stats.hundiCount,                                                              icon: Heart,        color: 'text-orange-600' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="px-4 py-3 text-center">
              <p className={`text-xl font-black ${color}`}>{value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search donor or receipt no…" className="input pl-9 text-sm py-1.5 w-56" />
        </div>
        <div className="flex gap-2 items-center">
          <label className="text-xs font-semibold text-gray-500 uppercase">From</label>
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="input text-sm py-1.5" />
        </div>
        <div className="flex gap-2 items-center">
          <label className="text-xs font-semibold text-gray-500 uppercase">To</label>
          <input type="date" value={to} max={new Date().toISOString().split('T')[0]}
            onChange={(e) => { setTo(e.target.value); setPage(1); }} className="input text-sm py-1.5" />
        </div>
        <div className="flex gap-1.5">
          {[['', 'All'], ['named', 'Named'], ['hundi', 'Hundi'], ['anonymous', 'Anonymous']].map(([val, label]) => (
            <button key={val} onClick={() => { setTypeFilter(val); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${typeFilter === val ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <DataTable columns={columns} data={donations} loading={isLoading}
        onRowClick={(row) => navigate(`/donations/${row._id}`)} />

      {pages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-gray-500">{total} record{total !== 1 ? 's' : ''} · Page {page} of {pages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary p-1.5 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages} className="btn-secondary p-1.5 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      <Modal open={!!voidTarget} onClose={() => setVoidTarget(null)} title="Void Donation" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Void <strong>{voidTarget?.donationNumber}</strong>? This cannot be undone.</p>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Reason</label>
            <input type="text" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} className="input" placeholder="e.g. Entered by mistake" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setVoidTarget(null)} className="btn-secondary">Cancel</button>
            <button onClick={() => voidMut.mutate()} disabled={voidMut.isPending} className="btn-danger">{voidMut.isPending ? 'Voiding…' : 'Yes, Void'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DonationList;
