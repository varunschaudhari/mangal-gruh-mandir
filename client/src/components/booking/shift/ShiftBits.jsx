// Small shared pieces of the shift close and the cash handover register.
import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import Badge from '../../ui/Badge.jsx';
import { printShiftSlip } from '../../../utils/shiftSlip.js';
import { useT } from '../../../i18n/index.jsx';
import { TONE, differenceText, differenceTone } from './shiftUtils.js';

/** Green "Matches", red "Short ₹200" or amber "Excess ₹150". */
export function DifferenceBadge({ difference, className = '' }) {
  const t = useT();
  return <Badge variant={TONE[differenceTone(difference)].badge} className={`whitespace-nowrap ${className}`}>{differenceText(t, difference)}</Badge>;
}

/** "To verify" until a supervisor signs it off, then "Verified". */
export function StatusBadge({ status }) {
  const t = useT();
  return status === 'verified'
    ? <Badge variant="green" className="gap-1 whitespace-nowrap"><CheckCircle2 className="h-3 w-3" /> {t('Verified')}</Badge>
    : <Badge variant="blue" className="gap-1 whitespace-nowrap"><Clock className="h-3 w-3" /> {t('To verify')}</Badge>;
}

/** Bookings voided after the shift was closed — the cash count included them. */
export function LateVoidFlag({ late, className = '' }) {
  const t = useT();
  if (!late?.count) return null;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ${className}`}
      title={t('Voided after the shift was closed — the cash count included them')}>
      <AlertTriangle className="h-3 w-3" /> {t('{n} voided after close', { n: late.count })}
    </span>
  );
}

/** print(shift) → prints the handover slip with friendly toasts; `printing` while it runs. */
export function useShiftSlip(settings) {
  const t = useT();
  const [printing, setPrinting] = useState(false);
  const print = useCallback(async (shift) => {
    if (!shift) return;
    setPrinting(true);
    try {
      const how = await printShiftSlip(shift, settings || {});
      if (how === 'thermal') toast.success(t('Handover slip printed'), { id: 'shift-slip' });
    } catch (err) {
      const reason = err?.message ? t(err.message) : t('Printer not reachable');
      toast.error(t('Handover slip not printed — {reason}', { reason }), { id: 'shift-slip', duration: 7000 });
    } finally {
      setPrinting(false);
    }
  }, [settings, t]);
  return { print, printing };
}
