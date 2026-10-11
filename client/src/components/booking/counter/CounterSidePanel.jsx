import { Banknote, CreditCard, FileText, MessageCircle, Printer, RefreshCw, Smartphone, Vault } from 'lucide-react';
import { useLanguage, useT } from '../../../i18n/index.jsx';
import { isNative } from '../../../utils/platform.js';
import { fmtMoney } from './counterUtils.js';
import { Toggle } from './bits.jsx';
import { sevaNames } from './SevaTiles.jsx';

/** My bookings today: count, amount and the cash / UPI / card split, and "Close shift" (onCloseShift). */
export function MyCollection({ query, compact = false, onCloseShift }) {
  const t = useT();
  const s = query.data;
  const mode = (m) => s?.byMode?.[m] || { count: 0, amount: 0 };
  const rows = [
    { key: 'cash', label: 'Cash', Icon: Banknote, tone: 'text-green-700' },
    { key: 'upi', label: 'UPI', Icon: Smartphone, tone: 'text-blue-700' },
    { key: 'card', label: 'Card', Icon: CreditCard, tone: 'text-purple-700' },
  ];
  return (
    <div className={compact ? '' : 'card p-4'}>
      {!compact && (
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('My bookings today')}</h2>
          <button type="button" onClick={() => query.refetch()} aria-label={t('Refresh')} title={t('Refresh')}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      )}
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-3xl font-black tabular-nums leading-none text-gray-900">{s?.totals?.count ?? '—'}</p>
          <p className="mt-1 text-xs text-gray-500">{t('bookings')}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black tabular-nums leading-none text-primary-700">₹{fmtMoney(s?.totals?.amount)}</p>
          <p className="mt-1 text-xs text-gray-500">{t('collected')}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {rows.map(({ key, label, Icon, tone }) => (
          <div key={key} className="rounded-lg bg-gray-50 px-2 py-1.5">
            <p className="flex items-center gap-1 text-[11px] font-medium text-gray-500"><Icon className="h-3 w-3" /> {t(label)}</p>
            <p className={`text-sm font-bold tabular-nums ${tone}`}>₹{fmtMoney(mode(key).amount)}</p>
            <p className="text-[10px] tabular-nums text-gray-400">{mode(key).count}×</p>
          </div>
        ))}
      </div>
      {query.isError && <p className="mt-2 text-xs text-red-500">{t('Could not load your totals')}</p>}
      {onCloseShift && (
        <button type="button" onClick={onCloseShift}
          className="btn-secondary mt-3 min-h-[40px] w-full max-lg:min-h-[44px]">
          <Vault className="h-4 w-4 text-green-700" /> {t('Close shift')}
        </button>
      )}
    </div>
  );
}

/** The last few bookings made at this counter, with reprint / WhatsApp buttons. */
export function SessionBookings({ list, sevaTypes, onSlip, onA4, onWhatsApp, compact = false }) {
  const t = useT();
  const { lang } = useLanguage();
  const iconBtn = 'flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800 max-lg:h-11 max-lg:w-11';
  return (
    <div className={compact ? '' : 'card p-4'}>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">{t('Booked at this counter')}</h2>
      {list.length === 0 ? (
        <p className="py-2 text-sm text-gray-400">{t('Bookings you make will appear here for reprinting.')}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {list.map((b) => {
            const seva = sevaTypes.find((s) => String(s._id) === String(b.sevaType));
            const name = seva ? sevaNames(seva, lang).primary : b.sevaName;
            return (
              <li key={b._id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-gray-900">{b.devotee?.name}</span>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-gray-700">₹{fmtMoney(b.amount)}</span>
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {[name, b.batchLabel, b.hall, b.serialNo && `#${b.serialNo}`].filter(Boolean).join(' · ')}
                  </p>
                  <p className="font-mono text-[11px] text-gray-400">{b.receiptNo}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => onSlip(b)} className={iconBtn} title={isNative ? t('Slip PDF') : t('Print slip')} aria-label={isNative ? t('Slip PDF') : t('Print slip')}>
                    <Printer className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => onA4(b)} className={iconBtn} title={t('A4 receipt')} aria-label={t('A4 receipt')}>
                    <FileText className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => onWhatsApp(b)} className={`${iconBtn} text-green-600`} title={t('Send on WhatsApp')} aria-label={t('Send on WhatsApp')}>
                    <MessageCircle className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Auto-print and "keep seva/date/batch" switches. */
export function CounterOptions({ prefs, setPref, compact = false }) {
  const t = useT();
  return (
    <div className={compact ? 'space-y-1' : 'card space-y-1 px-4 py-2'}>
      {!isNative && (
        <Toggle checked={prefs.autoPrint} onChange={(v) => setPref('autoPrint', v)} hint={t('Prints the slip as soon as the booking is saved')}>
          {t('Auto-print slip')}
        </Toggle>
      )}
      <Toggle checked={prefs.keep} onChange={(v) => setPref('keep', v)} hint={t('Only the devotee’s details are cleared')}>
        {t('Keep seva, date and batch for the next booking')}
      </Toggle>
    </div>
  );
}

const SHORTCUTS = [
  ['Enter', 'Book (Ctrl+Enter inside notes)'],
  ['F2', 'Mobile number'],
  ['Esc', 'Clear the devotee'],
  ['Alt+1…9', 'Choose seva'],
  ['Alt+C / U / K', 'Cash / UPI / Card'],
  ['← →', 'Move between dates, batches'],
];

/** Desktop shortcut legend, kept quiet. */
export function ShortcutLegend() {
  const t = useT();
  return (
    <div className="hidden rounded-xl border border-dashed border-gray-200 px-4 py-3 lg:block">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{t('Keyboard shortcuts')}</h2>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        {SHORTCUTS.map(([k, label]) => (
          <div key={k} className="contents">
            <dt><kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 font-mono text-[11px] font-semibold text-gray-500">{k}</kbd></dt>
            <dd className="text-gray-500">{t(label)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
