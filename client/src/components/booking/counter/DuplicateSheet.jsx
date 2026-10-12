import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import Sheet from '../../ui/Sheet.jsx';
import { useLanguage, useT } from '../../../i18n/index.jsx';
import { fmtDay, toKey } from './counterUtils.js';
import { HallBadge } from './bits.jsx';
import { useHallNames } from '../../../utils/halls.js';
import { sevaNames } from './SevaTiles.jsx';

const Row = ({ label, children }) => (children || children === 0 ? (
  <div className="flex items-baseline justify-between gap-3 py-1">
    <dt className="shrink-0 text-xs text-gray-500">{label}</dt>
    <dd className="min-w-0 break-words text-right text-sm font-semibold text-gray-900">{children}</dd>
  </div>
) : null);

/**
 * The server found the same mobile number already booked for this seva on that day.
 * Shows that booking and asks before booking it again. "Don't book" has the focus, so a
 * second Enter never books twice by accident.
 */
export default function DuplicateSheet({ booking, sevaTypes = [], onCancel, onBookAgain }) {
  const t = useT();
  const { lang } = useLanguage();
  const halls = useHallNames();
  const cancelRef = useRef(null);
  const open = Boolean(booking);

  useEffect(() => {
    if (!open) return undefined;
    const id = setTimeout(() => cancelRef.current?.focus(), 30);
    return () => clearTimeout(id);
  }, [open]);

  if (!booking) return null;
  const b = booking;
  const seva = sevaTypes.find((s) => String(s._id) === String(b.sevaType));
  const sevaName = seva ? sevaNames(seva, lang).primary : b.sevaName;
  const day = b.dateKey || (b.paidAt ? toKey(new Date(b.paidAt)) : '');

  return (
    <Sheet open={open} onClose={onCancel} title={t('Already booked')} size="sm">
      <div className="space-y-3">
        <p className="flex items-start gap-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t('This devotee already has this seva booked for that day')}
        </p>
        <dl className="divide-y divide-gray-100 rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-1.5">
          <Row label={t('Receipt No.')}><span className="font-mono">{b.receiptNo}</span></Row>
          <Row label={t('Devotee name')}>{b.devoteeName}</Row>
          <Row label={t('Seva')}>{sevaName}</Row>
          <Row label={b.dateKey ? t('Puja date') : t('Booked on')}>{day && fmtDay(day, lang, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</Row>
          <Row label={t('Batch')}>{b.batchLabel}</Row>
          <Row label={t('Hall')}>{b.hall && <span className="inline-flex items-center gap-1.5"><HallBadge hall={b.hall} />{halls.name(b.hall)}</span>}</Row>
          <Row label={t('Serial')}>{b.serialNo}</Row>
        </dl>
        <p className="text-xs text-gray-500">{t('Book again only if the devotee really wants a second booking.')}</p>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button ref={cancelRef} type="button" onClick={onCancel} className="btn-secondary min-h-[48px]">{t('Don’t book')}</button>
          <button type="button" onClick={onBookAgain} className="btn min-h-[48px] bg-amber-600 text-white hover:bg-amber-700 focus:ring-amber-500">
            {t('Book again')}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
