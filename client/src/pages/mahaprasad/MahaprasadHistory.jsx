import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  History, RefreshCw, Printer, Search, FileText, Send, Loader2,
  CheckCircle2, Clock, IndianRupee, Gift, Share2,
} from 'lucide-react';
import { getCoupons, printCoupons, resendBatch } from '../../api/mahaprasad.api.js';
import WhatsAppStatus from '../../components/ui/WhatsAppStatus.jsx';
import { getSettings } from '../../api/settings.api.js';
import { printThermalCoupon } from '../../utils/thermalPrint.js';
import { useBluetoothPrinter } from '../../utils/bluetoothPrinter.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import MobileCard from '../../components/ui/MobileCard.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { exportRows as exportTable } from '../../utils/exportToPdf.js';
import ExportButtons from '../../components/ui/ExportButtons.jsx';
import toast from 'react-hot-toast';
import { openFile } from '../../utils/fileSaver.js';
import { isNative } from '../../utils/platform.js';
import { localDateStr } from '../../utils/formatters.js';
import { useT } from '../../i18n/index.jsx';

const fmt   = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtTs = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const today = () => localDateStr();

const STATUS_V     = { issued: 'yellow', redeemed: 'green', voided: 'red' };
const STATUS_LABEL = { issued: 'Pending', redeemed: 'Redeemed', voided: 'Voided' };
const TYPE_V   = { paid: 'blue', free: 'purple' };
// People on a coupon — a group coupon for 5 is 5
const persons = (c) => c.groupSize || 1;

// Row background by status
const ROW_BG = {
  redeemed: 'bg-green-50/60 hover:bg-green-50',
  issued:   'bg-amber-50/30 hover:bg-amber-50/60',
  voided:   'bg-gray-50 text-gray-400',
};

// "5 persons" beside the coupon number — every coupon, single ones too
function PersonsPill({ n }) {
  const t = useT();
  return (
    <span className="inline-flex items-baseline gap-1 rounded-full bg-purple-50 border border-purple-200 px-2 py-0.5 text-xs font-semibold text-purple-700 whitespace-nowrap">
      <span className="tabular-nums">{n}</span> {t(n === 1 ? 'person|count' : 'persons|count')}
    </span>
  );
}

// ── Compact summary pill ──────────────────────────────────────────────────────

// value is persons; coupons (the slips) is shown beside it when group coupons make it differ
function SumPill({ icon: Icon, label, value, coupons, color }) {
  const t = useT();
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
      {coupons != null && coupons !== value && (
        <span className="font-normal opacity-75">({t('{n} coupons', { n: coupons })})</span>
      )}
    </div>
  );
}

export default function MahaprasadHistory() {
  const t = useT();
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
  // Totals for everything the filters match (every page), in persons like the Report
  const summary = res.summary;

  // A slip printed again on the thermal printer: the phone's Bluetooth printer, the desktop app's
  // printer, or the one named in Settings → Mahaprasad (QZ Tray). Without one, only the PDF.
  const btPrinter = useBluetoothPrinter();
  const { data: settingsRes } = useQuery({ queryKey: ['settings'], queryFn: getSettings, staleTime: 5 * 60 * 1000 });
  const settings = settingsRes?.data?.data || {};
  const canThermal = isNative ? Boolean(btPrinter) : Boolean(window.electronAPI?.isElectron || settings.mahaprasadPrinterName);
  const handleThermalPrint = async (coupon) => {
    setPrinting(true);
    try {
      await printThermalCoupon(coupon, settings);
      toast.success(t('Printed {number}', { number: coupon.couponNumber }));
    } catch (err) { toast.error(t(err.message || 'Thermal print failed')); }
    finally { setPrinting(false); }
  };

  // WhatsApp sends coupons by itself: each coupon shows whether its sale's message arrived, and can
  // go again (it didn't arrive, or the devotee deleted it)
  const canResend = Boolean(settings.waEnabled && settings.waTemplates?.mahaprasadCoupons);
  const [sending, setSending] = useState(null);
  const handleResend = async (coupon) => {
    setSending(coupon.batchId);
    try {
      await resendBatch(coupon.batchId);
      toast.success(t('Sent on WhatsApp again'));
    } catch (err) {
      toast.error(err.response?.data?.message || t('WhatsApp message not sent'));
    } finally {
      setSending(null);
      refetch();
    }
  };
  const resendable = (c) => canResend && c.mobile && c.batchId && c.status !== 'voided';

  const handleReprint = async (coupon) => {
    setPrinting(true);
    try {
      const r = await printCoupons([coupon.couponNumber]);
      await openFile(r.data, `Coupon-${coupon.couponNumber}.pdf`);
    } catch { toast.error(t('Failed to generate PDF')); }
    finally   { setPrinting(false); }
  };

  const handleExport = async (format) => {
    if (coupons.length === 0) return;
    try {
      const rows = coupons.map((c) => ({
        'Coupon No.':    c.couponNumber,
        Date:            fmt(c.date),
        Type:            c.type === 'paid' ? 'Paid' : 'Free',
        Occasion:        c.occasion || '',
        Name:            c.name || '',
        Mobile:          c.mobile || '',
        Persons:         persons(c),
        Amount:          c.type === 'paid' ? c.amount : 0,
        Status:          c.status === 'redeemed' ? 'Redeemed' : c.status === 'voided' ? 'Voided' : 'Issued',
        'Issued By':     c.issuedBy?.name || '',
        'Redeemed At':   c.redeemedAt ? fmtTs(c.redeemedAt) : '',
        'Redeemed By':   c.redeemedBy?.name || '',
      }));
      const label = search ? 'search' : (date || 'all');
      await exportTable(format, rows, `mahaprasad-history-${label}`, 'Mahaprasad coupons', { subtitle: search ? `Search: ${search}` : (date || '') });
    } catch { toast.error(t('Export failed')); }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Coupon History"
        subtitle="All issued Mahaprasad coupons"
        breadcrumbs={[{ label: 'Mahaprasad', to: '/mahaprasad' }, { label: 'History' }]}
        actions={
          <div className="flex items-center gap-2">
            <ExportButtons onExport={handleExport} disabled={coupons.length === 0}
              className="btn btn-ghost border text-sm flex items-center gap-1.5 disabled:opacity-40 max-sm:py-2.5" />
            <button onClick={() => refetch()} disabled={isFetching}
              className="btn btn-ghost border text-sm flex items-center gap-1.5 max-sm:py-2.5">
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> {t('Refresh')}
            </button>
          </div>
        }
      />

      {/* Filters — phones: search and date full width, the two selects side by side */}
      <div className="card p-3 sm:p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
          {/* Search by coupon number or the devotee's mobile number */}
          <div className="relative col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
              placeholder={t('Coupon no., mobile or name')}
              autoCapitalize="characters"
              autoComplete="off"
              className="input pl-8 text-sm font-mono w-full sm:w-56"
            />
          </div>

          <input
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); setPage(1); }}
            disabled={!!search}
            aria-label={t('Date')}
            className="input text-sm disabled:opacity-40 col-span-2 sm:w-auto"
          />

          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label={t('Status')} className="input text-sm min-w-0 sm:w-auto">
            <option value="">{t('All Status')}</option>
            <option value="issued">{t('Issued (Pending)')}</option>
            <option value="redeemed">{t('Redeemed')}</option>
          </select>

          <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label={t('Type')} className="input text-sm min-w-0 sm:w-auto">
            <option value="">{t('All Types')}</option>
            <option value="paid">{t('Paid|coupon')}</option>
            <option value="free">{t('Free')}</option>
          </select>

          <span className="hidden sm:inline text-xs text-gray-400 ml-auto">{t('{n} total', { n: total })}</span>
        </div>

        {/* Summary pills — only when data loaded */}
        {!isLoading && coupons.length > 0 && summary && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <SumPill icon={CheckCircle2} label={t('Redeemed')}    value={summary.redeemed} coupons={summary.redeemedCoupons} color="green" />
            <SumPill icon={Clock}        label={t('Pending')}     value={summary.pending}  coupons={summary.pendingCoupons}  color="amber" />
            <SumPill icon={IndianRupee}  label={t('Paid|coupon')} value={summary.paid}     coupons={summary.paidCoupons}     color="blue" />
            <SumPill icon={Gift}         label={t('Free')}        value={summary.free}     coupons={summary.freeCoupons}     color="purple" />
            {summary.collected > 0 && (
              <SumPill icon={IndianRupee} label={t('Collected')} value={`₹${summary.collected.toLocaleString('en-IN')}`} color="green" />
            )}
            {pages > 1 && (
              <span className="hidden sm:inline text-xs text-gray-400 ml-auto">{t('Showing page {page} of {pages}', { page, pages })}</span>
            )}
          </div>
        )}
        <p className="sm:hidden text-xs text-gray-400">
          {t('{n} total', { n: total })}{pages > 1 ? ` · ${t('page {page} of {pages}', { page, pages })}` : ''}
        </p>
      </div>

      {isLoading ? <PageLoader /> : coupons.length === 0 ? (
        <div className="card p-10 text-center">
          <History className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">{t('No coupons found')}</p>
          <p className="text-sm text-gray-400 mt-1">{t('Try changing the date or filters')}</p>
        </div>
      ) : (
        <>
        {/* Phones: one card per coupon */}
        <div className="space-y-2.5 md:hidden">
          {coupons.map((c) => (
            <MobileCard
              key={c._id}
              className={c.status === 'redeemed' ? 'border-green-100' : c.status === 'voided' ? 'opacity-70' : ''}
              title={
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={`font-mono font-semibold text-sm ${c.status === 'voided' ? 'line-through' : ''}`}>{c.couponNumber}</span>
                  <PersonsPill n={persons(c)} />
                </span>
              }
              subtitle={(
                <>
                  {[fmt(c.date), c.name, c.mobile, c.issuedBy?.name].filter(Boolean).join(' · ')}
                  {c.whatsapp && <WhatsAppStatus whatsapp={c.whatsapp} className="ml-1.5 align-middle" />}
                </>
              )}
              aside={
                <>
                  <Badge variant={STATUS_V[c.status]} size="sm">
                    {t(STATUS_LABEL[c.status] || 'Pending')}
                  </Badge>
                  {resendable(c) && (
                    <button onClick={() => handleResend(c)} disabled={sending === c.batchId}
                      aria-label={t('Send on WhatsApp again')} title={t('Send on WhatsApp again')}
                      className="-my-1.5 p-2.5 rounded-lg text-green-700 active:bg-gray-100 disabled:opacity-40">
                      {sending === c.batchId ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Send className="h-[18px] w-[18px]" />}
                    </button>
                  )}
                  {c.status !== 'voided' && canThermal && (
                    <button onClick={() => handleThermalPrint(c)} disabled={printing} aria-label={t('Print')} title={t('Print')}
                      className="-my-1.5 p-2.5 rounded-lg text-gray-600 active:bg-gray-100 disabled:opacity-40">
                      <Printer className="h-[18px] w-[18px]" />
                    </button>
                  )}
                  {c.status !== 'voided' && (
                    <button onClick={() => handleReprint(c)} disabled={printing}
                      aria-label={isNative ? t('Share or print PDF') : t('Reprint')}
                      className="-my-1.5 -mr-1.5 p-2.5 rounded-lg text-gray-400 active:bg-gray-100 disabled:opacity-40">
                      {isNative ? <Share2 className="h-[18px] w-[18px]" /> : canThermal ? <FileText className="h-[18px] w-[18px]" /> : <Printer className="h-[18px] w-[18px]" />}
                    </button>
                  )}
                </>
              }
              fields={[
                { label: t('Type'), value: c.type === 'free' ? `${t('Free')}${c.occasion ? ` · ${c.occasion}` : ''}` : t('Paid|coupon') },
                { label: t('Amount'), value: c.type === 'paid' ? `₹${c.amount}` : '—' },
                c.status === 'redeemed' && {
                  label: t('Redeemed'),
                  full: true,
                  value: `${fmtTs(c.redeemedAt)}${c.redeemedBy?.name ? ` · ${c.redeemedBy.name}` : ''}`,
                },
                c.status === 'voided' && {
                  label: t('Voided'),
                  full: true,
                  value: `${fmtTs(c.voidedAt)}${c.voidReason ? ` · ${c.voidReason}` : ''}`,
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
                  <th className="table-th">{t('Coupon No.')}</th>
                  <th className="table-th">{t('Date')}</th>
                  <th className="table-th">{t('Type')}</th>
                  <th className="table-th">{t('Name / Mobile')}</th>
                  <th className="table-th text-center">{t('Persons')}</th>
                  <th className="table-th text-right">{t('Amt')}</th>
                  <th className="table-th">{t('Status')}</th>
                  <th className="table-th">{t('Issued By')}</th>
                  <th className="table-th">{t('Redeemed')}</th>
                  <th className="table-th w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {coupons.map((c) => (
                  <tr key={c._id} className={`text-sm transition-colors ${ROW_BG[c.status] || ''}`}>
                    <td className={`table-td font-mono font-semibold text-xs ${c.status === 'voided' ? 'line-through text-gray-400' : 'text-gray-800'}`}>{c.couponNumber}</td>
                    <td className="table-td text-gray-500 text-xs">{fmt(c.date)}</td>
                    <td className="table-td">
                      <Badge variant={TYPE_V[c.type]} size="sm">
                        {c.type === 'free'
                          ? <span title={c.occasion || undefined}>{t('Free')}{c.occasion ? ` · ${c.occasion.length > 12 ? c.occasion.slice(0,12)+'…' : c.occasion}` : ''}</span>
                          : t('Paid|coupon')}
                      </Badge>
                    </td>
                    <td className="table-td text-gray-600 text-xs tabular-nums">
                      {c.name && <span className="block font-semibold text-gray-800 not-italic">{c.name}</span>}
                      {c.mobile || (c.name ? null : '—')}
                      {c.whatsapp && <span className="mt-0.5 block"><WhatsAppStatus whatsapp={c.whatsapp} /></span>}
                    </td>
                    <td className="table-td text-center">
                      <span className={`tabular-nums ${c.status === 'voided' ? 'text-sm text-gray-400' : persons(c) > 1 ? 'text-base font-bold text-purple-700' : 'text-sm text-gray-600'}`}>{persons(c)}</span>
                    </td>
                    <td className="table-td text-right font-medium text-xs">
                      {c.type === 'paid' ? `₹${c.amount}` : '—'}
                    </td>
                    <td className="table-td">
                      <Badge variant={STATUS_V[c.status]} size="sm">
                        {t(STATUS_LABEL[c.status] || 'Pending')}
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
                      ) : c.status === 'voided' ? (
                        <div className="max-w-[12rem]">
                          <span className="text-red-700 font-medium">{t('Voided')}</span> <span className="text-gray-400">{fmtTs(c.voidedAt)}</span>
                          {c.voidReason && <span className="block text-gray-500 truncate" title={c.voidReason}>{c.voidReason}</span>}
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="table-td">
                      {c.status !== 'voided' && (
                        <div className="flex items-center gap-0.5">
                          {resendable(c) && (
                            <button onClick={() => handleResend(c)} disabled={sending === c.batchId}
                              className="p-1.5 rounded hover:bg-white/60 text-green-700 hover:text-green-800 transition-colors disabled:opacity-40"
                              title={t('Send on WhatsApp again')} aria-label={t('Send on WhatsApp again')}>
                              {sending === c.batchId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                            </button>
                          )}
                          {canThermal && (
                            <button onClick={() => handleThermalPrint(c)} disabled={printing}
                              className="p-1.5 rounded hover:bg-white/60 text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-40"
                              title={t('Print')} aria-label={t('Print')}>
                              <Printer className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button onClick={() => handleReprint(c)} disabled={printing}
                            className="p-1.5 rounded hover:bg-white/60 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40"
                            title={canThermal ? 'PDF' : t('Reprint')} aria-label={canThermal ? 'PDF' : t('Reprint')}>
                            {canThermal ? <FileText className="h-3.5 w-3.5" /> : <Printer className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="px-4 py-3 md:border-t flex items-center justify-between gap-3 text-xs text-gray-500">
              <span>{t('Page {page} of {pages}', { page, pages })} &nbsp;·&nbsp; {t('{n} coupons', { n: total })}</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)}
                  className="btn-secondary text-xs px-2 py-1 max-sm:px-4 disabled:opacity-40">{t('Prev')}</button>
                <button disabled={page >= pages} onClick={() => setPage(page + 1)}
                  className="btn-secondary text-xs px-2 py-1 max-sm:px-4 disabled:opacity-40">{t('Next')}</button>
              </div>
            </div>
          )}
        </div>
        </>
      )}
    </div>
  );
}
