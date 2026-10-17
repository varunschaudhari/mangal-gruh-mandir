import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, FileSpreadsheet, Globe, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { getOnlineOrders } from '../../api/mahaprasadOnline.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import MobileCard from '../../components/ui/MobileCard.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { exportToExcel } from '../../utils/exportToExcel.js';
import { localDateStr } from '../../utils/formatters.js';
import { publicUrl } from '../../utils/platform.js';
import { useT } from '../../i18n/index.jsx';

// Mahaprasad coupons bought by devotees on the public page (/prasad), paid through Razorpay — every
// order, paid or not, with its Razorpay payment id, to match against the Razorpay dashboard and
// its settlements. The trust's website (NGOGuru) uses the same Razorpay account: its payments are
// not here.

const fmtTs = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const STATUS = {
  paid:     { label: 'Paid',              variant: 'green' },
  pending:  { label: 'Waiting for payment', variant: 'yellow' },
  issuing:  { label: 'Confirming',        variant: 'blue' },
  expired:  { label: 'Not paid',          variant: 'gray' },
  refunded: { label: 'Refunded',          variant: 'orange' },
  failed:   { label: 'Failed',            variant: 'red' },
};

export default function MahaprasadOnlineOrders() {
  const t = useT();
  const [from, setFrom] = useState(localDateStr());
  const [to, setTo] = useState(localDateStr());
  const [status, setStatus] = useState('');

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['mahaprasad-online-orders', from, to, status],
    queryFn: () => getOnlineOrders({ from, to, status: status || undefined }).then((r) => r.data.data),
    refetchInterval: 60_000,
  });
  const orders = data?.orders || [];
  const totals = data?.totals;
  const state = data?.state;

  const handleExport = async () => {
    try {
      await exportToExcel(orders.map((o) => ({
        'Ordered':      fmtTs(o.createdAt),
        'Mahaprasad day': fmtDay(o.date),
        'Plates':       o.plates,
        'Amount (₹)':   o.amount,
        'Status':       t(STATUS[o.status]?.label || o.status),
        'Coupon No.':   o.couponNumber || '',
        'Mobile':       o.mobile,
        'Name':         o.name || '',
        'Paid by':      o.method || '',
        'Razorpay payment':  o.paymentId || '',
        'Razorpay order':    o.razorpayOrderId || '',
        'Refund':       o.refundId ? `${o.refundId} — ${o.refundReason || ''}` : '',
      })), `mahaprasad-online-${from}-to-${to}`, 'Online orders');
    } catch { toast.error(t('Export failed')); }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Online orders"
        subtitle="Mahaprasad coupons bought on the public page, paid through Razorpay"
        breadcrumbs={[{ label: 'Mahaprasad', to: '/mahaprasad' }, { label: 'Online orders' }]}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={handleExport} disabled={orders.length === 0}
              className="btn btn-ghost border text-sm flex items-center gap-1.5 disabled:opacity-40 max-sm:py-2.5">
              <FileSpreadsheet className="h-4 w-4" /> {t('Export')}
            </button>
            <button onClick={() => refetch()} disabled={isFetching}
              className="btn btn-ghost border text-sm flex items-center gap-1.5 max-sm:py-2.5">
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> {t('Refresh')}
            </button>
          </div>
        }
      />

      {state && !state.enabled && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {!state.keysSet
            ? t('Online coupons are off: the Razorpay keys are not on the server yet.')
            : t('Online coupons are switched off (Settings → Mahaprasad).')}
        </div>
      )}
      {state?.enabled && state.mode === 'test' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t('Test mode: Razorpay test keys are on the server, so no real money is taken.')}
        </div>
      )}

      <div className="card p-3 sm:p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
          <label className="text-xs text-gray-500">{t('From')}
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input text-sm mt-0.5 w-full sm:w-auto" />
          </label>
          <label className="text-xs text-gray-500">{t('To')}
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input text-sm mt-0.5 w-full sm:w-auto" />
          </label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('Status')} className="input text-sm col-span-2 sm:w-auto sm:self-end">
            <option value="">{t('All Status')}</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{t(v.label)}</option>)}
          </select>
          <a href={publicUrl('/prasad')} target="_blank" rel="noopener noreferrer"
            className="col-span-2 sm:ml-auto sm:self-end inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700">
            <ExternalLink className="h-4 w-4" /> {t('Open the public page')}
          </a>
        </div>
        {totals && (
          <div className="flex flex-wrap gap-2 pt-1 text-sm">
            <span className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 font-semibold text-green-800">
              {t('Paid')}: {rupees(totals.paid)} · {t(totals.paidCount === 1 ? '{n} order' : '{n} orders', { n: totals.paidCount })} · {t(totals.plates === 1 ? '{n} plate' : '{n} plates', { n: totals.plates })}
            </span>
            {totals.refundedCount > 0 && (
              <span className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 font-semibold text-orange-800">
                {t('Refunded')}: {rupees(totals.refunded)} · {t(totals.refundedCount === 1 ? '{n} order' : '{n} orders', { n: totals.refundedCount })}
              </span>
            )}
          </div>
        )}
        <p className="text-xs text-gray-400">{t('Match the paid total with the Razorpay dashboard (Transactions → Payments). Payments of the temple website share the same Razorpay account and are not listed here.')}</p>
      </div>

      {isLoading ? <PageLoader /> : orders.length === 0 ? (
        <div className="card p-10 text-center">
          <Globe className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">{t('No online orders')}</p>
          <p className="text-sm text-gray-400 mt-1">{t('Try changing the dates or filters')}</p>
        </div>
      ) : (
        <>
          <div className="space-y-2.5 md:hidden">
            {orders.map((o) => (
              <MobileCard
                key={o._id}
                title={<span className="font-semibold">{rupees(o.amount)} · {t(o.plates === 1 ? '{n} plate' : '{n} plates', { n: o.plates })}</span>}
                subtitle={[fmtTs(o.createdAt), o.mobile, o.name].filter(Boolean).join(' · ')}
                aside={<Badge variant={STATUS[o.status]?.variant}>{t(STATUS[o.status]?.label || o.status)}</Badge>}
                fields={[
                  { label: t('Mahaprasad day'), value: fmtDay(o.date) },
                  { label: t('Coupon No.'), value: o.couponNumber },
                  { label: t('Razorpay payment'), value: o.paymentId, full: true },
                  o.refundReason && { label: t('Refund'), value: t(o.refundReason), full: true },
                ]}
                footer={o.couponUrl && (
                  <a href={o.couponUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-primary-700">{t('Coupon page')}</a>
                )}
              />
            ))}
          </div>

          <div className="card overflow-x-auto max-md:hidden">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="table-th">{t('Ordered')}</th>
                  <th className="table-th">{t('Mahaprasad day')}</th>
                  <th className="table-th text-right">{t('Plates')}</th>
                  <th className="table-th text-right">{t('Amount')}</th>
                  <th className="table-th">{t('Status')}</th>
                  <th className="table-th">{t('Coupon No.')}</th>
                  <th className="table-th">{t('Mobile')}</th>
                  <th className="table-th">{t('Razorpay payment')}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o._id} className="border-t border-gray-100">
                    <td className="table-td text-xs text-gray-500">{fmtTs(o.createdAt)}</td>
                    <td className="table-td text-xs">{fmtDay(o.date)}</td>
                    <td className="table-td text-right tabular-nums">{o.plates}</td>
                    <td className="table-td text-right font-medium tabular-nums">{rupees(o.amount)}</td>
                    <td className="table-td">
                      <Badge variant={STATUS[o.status]?.variant}>{t(STATUS[o.status]?.label || o.status)}</Badge>
                      {o.refundReason && <p className="mt-0.5 max-w-[220px] text-[11px] text-gray-500">{t(o.refundReason)}</p>}
                    </td>
                    <td className="table-td font-mono text-xs">
                      {o.couponUrl ? <a href={o.couponUrl} target="_blank" rel="noopener noreferrer" className="text-primary-700 hover:underline">{o.couponNumber}</a> : '—'}
                    </td>
                    <td className="table-td text-xs tabular-nums">{o.mobile}{o.name ? <span className="block text-gray-400">{o.name}</span> : null}</td>
                    <td className="table-td font-mono text-[11px] text-gray-600">{o.paymentId || '—'}{o.method ? <span className="block text-gray-400">{o.method}</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
