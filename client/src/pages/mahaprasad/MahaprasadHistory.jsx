import { useEffect, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  History, RefreshCw, Printer, Search,
  FileSpreadsheet, CheckCircle2, Clock, IndianRupee, Gift, Share2,
} from 'lucide-react';
import { getCoupons, printCoupons } from '../../api/mahaprasad.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import MobileCard from '../../components/ui/MobileCard.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { exportToExcel } from '../../utils/exportToExcel.js';
import toast from 'react-hot-toast';
import { openFile } from '../../utils/fileSaver.js';
import { isNative } from '../../utils/platform.js';

const fmt   = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtTs = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const today = () => new Date().toISOString().split('T')[0];

const STATUS_V = { issued: 'yellow', redeemed: 'green' };
const TYPE_V   = { paid: 'blue', free: 'purple' };

// Row background by status
const ROW_BG = {
  redeemed: 'bg-green-50/60 hover:bg-green-50',
  issued:   'bg-amber-50/30 hover:bg-amber-50/60',
};

// ── Compact summary pill ──────────────────────────────────────────────────────

function SumPill({ icon: Icon, label, value, color }) {
  const colors = {
    green:  'text-green-700 bg-green-50 border-green-200',
    amber:  'text-amber-700 bg-amber-50 border-amber-200',
    blue:   'text-blue-700  bg-blue-50  border-blue-200',
    purple: 'text-purple-700 bg-purple-50 border-purple-200',
    gray:   'text-gray-600  bg-gray-50  border-gray-200',
  };
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${colors[color] || colors.gray}`}>
      <Icon className="h-3.5 w-3.5" />
      <span>{label}:</span>
      <span>{value}</span>
    </div>
  );
}

export default function MahaprasadHistory() {
  const [date,        setDate]        = useState(today());
  const [status,      setStatus]      = useState('');
  const [type,        setType]        = useState('');
  const [page,        setPage]        = useState(1);
  const [printing,    setPrinting]    = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search,      setSearch]      = useState('');

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['mahaprasad-coupons', date, status, type, search, page],
    queryFn:  () => getCoupons({
      date:   search ? undefined : (date || undefined),
      status: status || undefined,
      type:   type   || undefined,
      search: search || undefined,
      page,
      limit: 50,
    }),
    staleTime: 30 * 1000,
  });

  const res     = data?.data?.data || {};
  const coupons = res.coupons || [];
  const total   = res.total   || 0;
  const pages   = res.pages   || 1;

  // Compute summary from current page's coupons
  const summary = useMemo(() => coupons.reduce((acc, c) => {
    acc.total++;
    if (c.status === 'redeemed')  acc.redeemed++;
    else                           acc.pending++;
    if (c.type === 'paid') { acc.paid++; acc.collected += (c.amount || 0); }
    if (c.type === 'free') acc.free++;
    return acc;
  }, { total: 0, redeemed: 0, pending: 0, paid: 0, free: 0, collected: 0 }), [coupons]);

  const handleReprint = async (coupon) => {
    setPrinting(true);
    try {
      const r = await printCoupons([coupon.couponNumber]);
      await openFile(r.data, `Coupon-${coupon.couponNumber}.pdf`);
    } catch { toast.error('Failed to generate PDF'); }
    finally   { setPrinting(false); }
  };

  const handleExport = async () => {
    if (coupons.length === 0) return;
    try {
      const rows = coupons.map((c) => ({
        'Coupon No.':    c.couponNumber,
        Date:            fmt(c.date),
        Type:            c.type === 'paid' ? 'Paid' : 'Free',
        Occasion:        c.occasion || '',
        Amount:          c.type === 'paid' ? c.amount : 0,
        Status:          c.status === 'redeemed' ? 'Redeemed' : 'Issued',
        'Issued By':     c.issuedBy?.name || '',
        'Redeemed At':   c.redeemedAt ? fmtTs(c.redeemedAt) : '',
        'Redeemed By':   c.redeemedBy?.name || '',
      }));
      const label = search ? 'search' : (date || 'all');
      await exportToExcel(rows, `mahaprasad-history-${label}`, 'Coupons');
    } catch { toast.error('Export failed'); }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Coupon History"
        subtitle="All issued Mahaprasad coupons"
        breadcrumbs={[{ label: 'Mahaprasad', to: '/mahaprasad' }, { label: 'History' }]}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={handleExport} disabled={coupons.length === 0}
              className="btn btn-ghost border text-sm flex items-center gap-1.5 disabled:opacity-40 max-sm:py-2.5">
              <FileSpreadsheet className="h-4 w-4" /> Export
            </button>
            <button onClick={() => refetch()} disabled={isFetching}
              className="btn btn-ghost border text-sm flex items-center gap-1.5 max-sm:py-2.5">
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        }
      />

      {/* Filters — phones: search and date full width, the two selects side by side */}
      <div className="card p-3 sm:p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
          {/* Coupon number search */}
          <div className="relative col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
              placeholder="Search MP-YYYYMMDD-NNN"
              autoCapitalize="characters"
              autoComplete="off"
              className="input pl-8 text-sm font-mono w-full sm:w-52"
            />
          </div>

          <input
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); setPage(1); }}
            disabled={!!search}
            aria-label="Date"
            className="input text-sm disabled:opacity-40 col-span-2 sm:w-auto"
          />

          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status" className="input text-sm min-w-0 sm:w-auto">
            <option value="">All Status</option>
            <option value="issued">Issued (Pending)</option>
            <option value="redeemed">Redeemed</option>
          </select>

          <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Type" className="input text-sm min-w-0 sm:w-auto">
            <option value="">All Types</option>
            <option value="paid">Paid</option>
            <option value="free">Free</option>
          </select>

          <span className="hidden sm:inline text-xs text-gray-400 ml-auto">{total} total</span>
        </div>

        {/* Summary pills — only when data loaded */}
        {!isLoading && coupons.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <SumPill icon={CheckCircle2} label="Redeemed" value={summary.redeemed} color="green" />
            <SumPill icon={Clock}        label="Pending"  value={summary.pending}  color="amber" />
            <SumPill icon={IndianRupee}  label="Paid"     value={summary.paid}     color="blue" />
            <SumPill icon={Gift}         label="Free"     value={summary.free}     color="purple" />
            {summary.collected > 0 && (
              <SumPill icon={IndianRupee} label="Collected" value={`₹${summary.collected.toLocaleString('en-IN')}`} color="green" />
            )}
            {pages > 1 && (
              <span className="hidden sm:inline text-xs text-gray-400 ml-auto">Showing page {page} of {pages}</span>
            )}
          </div>
        )}
        <p className="sm:hidden text-xs text-gray-400">
          {total} total{pages > 1 ? ` · page ${page} of ${pages}` : ''}
        </p>
      </div>

      {isLoading ? <PageLoader /> : coupons.length === 0 ? (
        <div className="card p-10 text-center">
          <History className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No coupons found</p>
          <p className="text-sm text-gray-400 mt-1">Try changing the date or filters</p>
        </div>
      ) : (
        <>
        {/* Phones: one card per coupon */}
        <div className="space-y-2.5 md:hidden">
          {coupons.map((c) => (
            <MobileCard
              key={c._id}
              className={c.status === 'redeemed' ? 'border-green-100' : ''}
              title={<span className="font-mono font-semibold text-sm">{c.couponNumber}</span>}
              subtitle={`${fmt(c.date)}${c.issuedBy?.name ? ` · ${c.issuedBy.name}` : ''}`}
              aside={
                <>
                  <Badge variant={STATUS_V[c.status]} size="sm">
                    {c.status === 'redeemed' ? 'Redeemed' : 'Pending'}
                  </Badge>
                  <button onClick={() => handleReprint(c)} disabled={printing}
                    aria-label={isNative ? 'Share or print PDF' : 'Reprint'}
                    className="-my-1.5 -mr-1.5 p-2.5 rounded-lg text-gray-400 active:bg-gray-100 disabled:opacity-40">
                    {isNative ? <Share2 className="h-[18px] w-[18px]" /> : <Printer className="h-[18px] w-[18px]" />}
                  </button>
                </>
              }
              fields={[
                { label: 'Type', value: c.type === 'free' ? `Free${c.occasion ? ` · ${c.occasion}` : ''}` : 'Paid' },
                { label: 'Amount', value: c.type === 'paid' ? `₹${c.amount}` : '—' },
                c.status === 'redeemed' && {
                  label: 'Redeemed',
                  full: true,
                  value: `${fmtTs(c.redeemedAt)}${c.redeemedBy?.name ? ` · ${c.redeemedBy.name}` : ''}`,
                },
              ]}
            />
          ))}
        </div>

        <div className={`card overflow-hidden ${pages > 1 ? '' : 'max-md:hidden'}`}>
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="table-th">Coupon No.</th>
                  <th className="table-th">Date</th>
                  <th className="table-th">Type</th>
                  <th className="table-th text-right">Amt</th>
                  <th className="table-th">Status</th>
                  <th className="table-th">Issued By</th>
                  <th className="table-th">Redeemed</th>
                  <th className="table-th w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {coupons.map((c) => (
                  <tr key={c._id} className={`text-sm transition-colors ${ROW_BG[c.status] || ''}`}>
                    <td className="table-td font-mono font-semibold text-gray-800 text-xs">{c.couponNumber}</td>
                    <td className="table-td text-gray-500 text-xs">{fmt(c.date)}</td>
                    <td className="table-td">
                      <Badge variant={TYPE_V[c.type]} size="sm">
                        {c.type === 'free'
                          ? <span title={c.occasion || undefined}>Free{c.occasion ? ` · ${c.occasion.length > 12 ? c.occasion.slice(0,12)+'…' : c.occasion}` : ''}</span>
                          : 'Paid'}
                      </Badge>
                    </td>
                    <td className="table-td text-right font-medium text-xs">
                      {c.type === 'paid' ? `₹${c.amount}` : '—'}
                    </td>
                    <td className="table-td">
                      <Badge variant={STATUS_V[c.status]} size="sm">
                        {c.status === 'redeemed' ? 'Redeemed' : 'Pending'}
                      </Badge>
                    </td>
                    <td className="table-td text-gray-500 text-xs">{c.issuedBy?.name || '—'}</td>
                    <td className="table-td text-xs">
                      {c.status === 'redeemed' ? (
                        <div>
                          <span className="text-gray-400">{fmtTs(c.redeemedAt)}</span>
                          {c.redeemedBy?.name && (
                            <span className="block text-gray-500 font-medium">{c.redeemedBy.name}</span>
                          )}
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="table-td">
                      <button onClick={() => handleReprint(c)} disabled={printing}
                        className="p-1.5 rounded hover:bg-white/60 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Reprint">
                        <Printer className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="px-4 py-3 md:border-t flex items-center justify-between gap-3 text-xs text-gray-500">
              <span>Page {page} of {pages} &nbsp;·&nbsp; {total} coupons</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)}
                  className="btn-secondary text-xs px-2 py-1 max-sm:px-4 disabled:opacity-40">Prev</button>
                <button disabled={page >= pages} onClick={() => setPage(page + 1)}
                  className="btn-secondary text-xs px-2 py-1 max-sm:px-4 disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>
        </>
      )}
    </div>
  );
}
