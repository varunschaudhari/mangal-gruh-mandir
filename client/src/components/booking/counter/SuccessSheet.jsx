import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileText, Loader2, MessageCircle, Plus, Printer, UserRound } from 'lucide-react';
import Sheet from '../../ui/Sheet.jsx';
import { useLanguage, useT } from '../../../i18n/index.jsx';
import { isNative } from '../../../utils/platform.js';
import { useHallNames } from '../../../utils/halls.js';
import { fmtDay, fmtMoney } from './counterUtils.js';
import { HallBadge, Kbd } from './bits.jsx';
import { sevaNames } from './SevaTiles.jsx';

const MODE = { cash: 'Cash', upi: 'UPI', card: 'Card', online: 'Online' };
const GUARD_MS = 600; // ignore a double-pressed Enter right after booking

/**
 * Shown after a booking: receipt no., serial, hall, batch and amount, with print / WhatsApp
 * buttons. Keys: P slip · A A4 · W WhatsApp · Enter / N / Esc new booking · a digit starts
 * the next mobile number.
 */
export default function SuccessSheet({ booking, sevaTypes, whatsappAuto, onNew, onSameDevotee, onSlip, onA4, onWhatsApp }) {
  const t = useT();
  const { lang } = useLanguage();
  const halls = useHallNames();
  const openedAt = useRef(0);
  const newBtn = useRef(null);
  const [busy, setBusy] = useState('');

  const open = Boolean(booking);

  useEffect(() => {
    if (!open) return undefined;
    openedAt.current = Date.now();
    const id = setTimeout(() => newBtn.current?.focus(), 30);
    return () => clearTimeout(id);
  }, [open, booking?._id]);

  const run = async (name, fn) => {
    if (busy) return;
    setBusy(name);
    try { await fn(booking); } finally { setBusy(''); }
  };
  const guarded = () => Date.now() - openedAt.current < GUARD_MS;
  const startNew = (digit = '') => { if (!guarded()) onNew(digit); };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
      if (guarded()) { if (e.key === 'Enter') e.preventDefault(); return; }
      const k = e.key.toLowerCase();
      if (k === 'p') { e.preventDefault(); run('slip', onSlip); }
      else if (k === 'a') { e.preventDefault(); run('a4', onA4); }
      else if (k === 'w') { e.preventDefault(); onWhatsApp(booking); }
      else if (k === 'n') { e.preventDefault(); onNew(''); }
      else if (/^\d$/.test(e.key)) { e.preventDefault(); onNew(e.key); }
      else if (e.key === 'Enter' && e.target?.tagName !== 'BUTTON') { e.preventDefault(); onNew(''); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (!booking) return null;
  const b = booking;
  const seva = sevaTypes.find((s) => String(s._id) === String(b.sevaType));
  const name = seva ? sevaNames(seva, lang).primary : b.sevaName;
  const time = b.batchLabel;

  return (
    <Sheet open={open} onClose={() => startNew('')} size="md">
      <div className="space-y-4 sm:pt-1">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-8 w-8 shrink-0 text-green-600" />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-green-800">{t('Booked')}</p>
            <p className="font-mono text-sm font-semibold text-gray-700">{b.receiptNo}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black tabular-nums text-gray-900">₹{fmtMoney(b.amount)}</p>
            <p className="text-xs font-medium text-gray-500">{t(MODE[b.paymentMode] || b.paymentMode)}{b.paymentRef ? ` · ${b.paymentRef}` : ''}</p>
          </div>
        </div>

        {(b.serialNo || b.hall) && (
          <div className={`grid gap-2 ${b.serialNo && b.hall ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {b.serialNo ? (
              <div className="rounded-xl bg-gray-900 px-3 py-2 text-center text-white">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-300">{t('Serial no.')}</p>
                <p className="text-4xl font-black tabular-nums leading-tight">{b.serialNo}</p>
              </div>
            ) : null}
            {b.hall ? (
              <div className="rounded-xl bg-gray-900 px-3 py-2 text-center text-white">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-300">{t('Hall')}</p>
                <p className="text-4xl font-black leading-tight">{b.hall}</p>
                {halls.name(b.hall) && <p className="truncate text-xs font-medium text-gray-300">{halls.name(b.hall)}</p>}
              </div>
            ) : null}
          </div>
        )}

        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-xl bg-gray-50 px-3 py-2.5 text-sm">
          <dt className="text-gray-500">{t('Seva')}</dt>
          <dd className="font-semibold text-gray-900">{name}</dd>
          {b.dateKey && (<>
            <dt className="text-gray-500">{t('Puja date')}</dt>
            <dd className="font-semibold text-gray-900">{fmtDay(b.dateKey, lang, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</dd>
          </>)}
          {time && (<>
            <dt className="text-gray-500">{b.schedule === 'batch' ? t('Batch') : t('Time')}</dt>
            <dd className="flex items-center gap-2 font-semibold text-gray-900">{time} {b.hall && <HallBadge hall={b.hall} title={halls.title(b.hall)} />}</dd>
          </>)}
          <dt className="text-gray-500">{t('Devotee')}</dt>
          <dd className="min-w-0 truncate font-semibold text-gray-900">
            {b.devotee?.name} <span className="font-normal tabular-nums text-gray-500">· {b.devotee?.phone}</span>
          </dd>
          {b.peopleCount > 1 && (<>
            <dt className="text-gray-500">{t('People')}</dt>
            <dd className="font-semibold text-gray-900">{b.peopleCount}</dd>
          </>)}
          {b.schedule === 'none' && b.devotee?.address && (<>
            <dt className="text-gray-500">{t('Postal address')}</dt>
            <dd className="text-gray-800">{b.devotee.address}</dd>
          </>)}
        </dl>

        {whatsappAuto && (
          <p className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-xs font-medium text-green-800">
            <MessageCircle className="h-4 w-4 shrink-0" /> {t('The receipt link was also sent to the devotee on WhatsApp automatically.')}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <button type="button" onClick={() => run('slip', onSlip)} disabled={busy === 'slip'}
            className="btn-secondary min-h-[44px] justify-center px-2">
            {busy === 'slip' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            {isNative ? t('Slip PDF') : t('Print slip')} <Kbd>P</Kbd>
          </button>
          <button type="button" onClick={() => run('a4', onA4)} disabled={busy === 'a4'}
            className="btn-secondary min-h-[44px] justify-center px-2">
            {busy === 'a4' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {t('A4 receipt')} <Kbd>A</Kbd>
          </button>
          <button type="button" onClick={() => onWhatsApp(b)}
            className="btn col-span-2 min-h-[44px] justify-center whitespace-nowrap px-2 border border-green-300 bg-white text-green-700 hover:bg-green-50 focus:ring-green-400 sm:col-span-1">
            <MessageCircle className="h-4 w-4" /> {t('Send on WhatsApp')} <Kbd>W</Kbd>
          </button>
        </div>

        <button ref={newBtn} type="button" onClick={() => startNew('')}
          className="btn-primary min-h-[52px] w-full text-base font-bold">
          <Plus className="h-5 w-5" /> {t('New Booking')} <Kbd className="border-white/30 bg-white/10 text-white/80">Enter</Kbd>
        </button>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => !guarded() && onSameDevotee()}
            className="inline-flex min-h-[40px] items-center gap-1.5 text-sm font-medium text-primary-700 hover:underline">
            <UserRound className="h-4 w-4" /> {t('Another seva for this devotee')}
          </button>
          <p className="hidden text-xs text-gray-400 lg:block">{t('Or just start typing the next mobile number')}</p>
        </div>
      </div>
    </Sheet>
  );
}
