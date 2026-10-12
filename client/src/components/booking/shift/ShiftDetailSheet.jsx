import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, BadgeCheck, Clock, CreditCard, Loader2, Printer } from 'lucide-react';
import Sheet from '../../ui/Sheet.jsx';
import Modal from '../../ui/Modal.jsx';
import Badge from '../../ui/Badge.jsx';
import Spinner from '../../ui/Spinner.jsx';
import { getShift, verifyShift } from '../../../api/booking.api.js';
import { usePermissions } from '../../../hooks/usePermissions.js';
import { isNative } from '../../../utils/platform.js';
import haptics from '../../../utils/haptics.js';
import { rich, useT } from '../../../i18n/index.jsx';
import { MODE_BADGE, MODE_LABEL, fmtDateTime, fmtTime, rupees } from '../registerUtils.js';
import { DifferenceBadge, StatusBadge, useShiftSlip } from './ShiftBits.jsx';
import { TONE, denominationLines, differenceText, differenceTone, isVoidedAfterClose } from './shiftUtils.js';

const Section = ({ title, children, right }) => (
  <section className="mt-4">
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{title}</h3>
      {right}
    </div>
    {children}
  </section>
);

/** Label / value rows in a bordered box. */
const Rows = ({ rows }) => (
  <dl className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white text-sm">
    {rows.filter(Boolean).map(({ label, value, strong, className = '' }) => (
      <div key={label} className={`flex items-baseline justify-between gap-3 px-3 py-2 ${className}`}>
        <dt className="min-w-0 text-gray-600">{label}</dt>
        <dd className={`shrink-0 text-right tabular-nums ${strong ? 'font-bold text-gray-900' : 'text-gray-800'}`}>{value}</dd>
      </div>
    ))}
  </dl>
);

// Why a UPI / card booking needs a look before the handover is verified.
const FLAG_TEXT = {
  'no-ref': /*t*/ 'No reference',
  'mode-changed': /*t*/ 'Payment changed after booking',
  'ref-reused': /*t*/ 'Same reference on another booking',
};

function Flags({ b }) {
  const t = useT();
  if (!b.flags?.length) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {b.flags.map((f) => (
        <span key={f} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
          <AlertTriangle className="h-3 w-3" />{t(FLAG_TEXT[f] || f)}
          {f === 'mode-changed' && b.modeChange && ` (${t(MODE_LABEL[b.modeChange.from] || b.modeChange.from)} → ${t(MODE_LABEL[b.modeChange.to] || b.modeChange.to)})`}
        </span>
      ))}
    </span>
  );
}

/**
 * One closed shift: the numbers, the note count, the UPI / card payments to match with the bank
 * statement, the bookings in it, the handover slip, and the supervisor's "Verify"
 * (bookings:cash). `shift` is a list row; the full record is fetched.
 */
export default function ShiftDetailSheet({ shift: initial, onClose, settings }) {
  const t = useT();
  const { can, user, role } = usePermissions();
  const qc = useQueryClient();
  const id = initial?._id;
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [note, setNote] = useState('');
  const [digitalOk, setDigitalOk] = useState(false);
  const { print, printing } = useShiftSlip(settings);

  const { data: full, isLoading, isError, error } = useQuery({
    queryKey: ['booking-shift', id],
    queryFn: () => getShift(id),
    select: (r) => r.data.data,
    enabled: !!id,
    staleTime: 30_000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['booking-shift', id] });
    qc.invalidateQueries({ queryKey: ['booking-shifts'] });
  };

  const verifyMut = useMutation({
    mutationFn: () => verifyShift(id, note.trim(), digitalOk),
    onSuccess: () => {
      haptics.success();
      toast.success(t('Handover verified'));
      setVerifyOpen(false);
      setNote('');
      setDigitalOk(false);
      refresh();
    },
    onError: (e) => {
      haptics.error();
      const msg = e.response?.data?.message;
      toast.error(msg ? t(msg) : t('Could not verify the handover'));
      if (e.response?.status === 400) { setVerifyOpen(false); refresh(); }
    },
  });

  const close = () => { setVerifyOpen(false); setNote(''); setDigitalOk(false); onClose(); };

  if (!initial) return null;
  const s = full || initial;
  const totals = s.totals || {};
  const tone = differenceTone(s.difference);
  const mine = String(s.user?._id || s.user) === String(user?._id || user?.id);
  const ownNotAllowed = mine && !['admin', 'super_admin'].includes(role);
  const canVerify = can('bookings:cash') && s.status === 'closed' && !ownNotAllowed;
  const notes = denominationLines(s.denominations);
  const late = s.voidedAfterClose;
  const bookings = full?.bookings || [];
  const digitalTotal = (totals.upi || 0) + (totals.card || 0);
  const digital = full?.digital;
  const digitalRows = bookings.filter((b) => b.status === 'confirmed' && ['upi', 'card'].includes(b.paymentMode));
  const flagged = digital ? digital.noRef + digital.modeChanged + digital.reused : 0;

  const footer = (
    <div className={`grid gap-2 sm:flex sm:justify-end ${canVerify ? 'grid-cols-2' : 'grid-cols-1'}`}>
      <button type="button" onClick={() => print(s)} disabled={printing} className="btn-secondary">
        {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
        {isNative ? t('Handover slip PDF') : t('Print slip')}
      </button>
      {canVerify && (
        <button type="button" onClick={() => { haptics.tap(); setVerifyOpen(true); }} className="btn-primary">
          <BadgeCheck className="h-4 w-4" /> {t('Verify')}
        </button>
      )}
    </div>
  );

  return (
    <>
      <Sheet open={!!initial} onClose={close} title={t('Cash handover')} size="lg" footer={footer} full>
        {/* Who, when, and the result */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-words text-lg font-bold text-gray-900">{s.user?.name || '—'}</p>
            <p className="text-sm text-gray-500">{t('Closed {time}', { time: fmtDateTime(s.closedAt) })}</p>
            <div className="mt-1.5"><StatusBadge status={s.status} /></div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">{t('Counted')}</p>
            <p className="text-xl font-black tabular-nums text-gray-900">{rupees(s.countedCash)}</p>
            <DifferenceBadge difference={s.difference} />
          </div>
        </div>

        {late?.count > 0 && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <p className="flex items-start gap-1.5 font-semibold">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {t('{n} voided after close · {amount}', { n: late.count, amount: rupees(late.amount) })}
            </p>
            <p className="mt-1 text-red-700">
              {t('These bookings were voided after the shift was closed. The cash count included them — settle that money separately.')}
            </p>
          </div>
        )}

        <Section title={t('Bookings')}>
          <Rows rows={[
            { label: t('From'), value: fmtDateTime(s.startedAt) },
            { label: t('To'), value: fmtDateTime(s.closedAt) },
            { label: t('Bookings'), value: (totals.count ?? 0).toLocaleString('en-IN'), strong: true },
            { label: t('Amount'), value: rupees(totals.amount), strong: true },
            { label: t('Cash'), value: rupees(totals.cash) },
            { label: t('UPI'), value: rupees(totals.upi) },
            { label: t('Card'), value: rupees(totals.card) },
            totals.voidedCount > 0 && { label: t('Voided (not counted)'), value: totals.voidedCount },
          ]} />
        </Section>

        <Section title={t('Cash')}>
          <Rows rows={[
            s.openingFloat > 0 && { label: t('Opening float'), value: rupees(s.openingFloat) },
            s.openingFloat > 0 && { label: t('Cash bookings'), value: rupees(totals.cash) },
            { label: t('Expected cash'), value: rupees(s.expectedCash), strong: true },
            { label: t('Counted cash'), value: rupees(s.countedCash), strong: true },
            {
              label: t('Difference'),
              value: <span className={`font-black ${TONE[tone].text}`}>{differenceText(t, s.difference)}</span>,
              className: `rounded-b-xl ${TONE[tone].box}`,
            },
          ]} />
        </Section>

        {digitalTotal > 0 && (
          <Section title={t('UPI and card')} right={flagged > 0 && <Badge variant="yellow">{t('{n} to check', { n: flagged })}</Badge>}>
            <div className="rounded-xl border border-gray-100 bg-white">
              <Rows rows={[
                totals.upi > 0 && { label: `${t('UPI')} · ${digital?.upi.count ?? ''}`, value: rupees(totals.upi), strong: true },
                totals.card > 0 && { label: `${t('Card')} · ${digital?.card.count ?? ''}`, value: rupees(totals.card), strong: true },
              ]} />
            </div>
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-gray-500">
              <CreditCard className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t('Match these with the bank / UPI app / card machine statement before verifying.')}
            </p>
            {digitalRows.length > 0 && (
              <ul className="mt-2 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100 bg-white text-sm">
                {digitalRows.map((b) => (
                  <li key={b._id || b.receiptNo} className={`flex items-start justify-between gap-3 px-3 py-2 ${b.flags?.length ? 'bg-amber-50/60' : ''}`}>
                    <div className="min-w-0">
                      <p className="font-mono text-sm text-gray-900">{b.paymentRef || '—'}</p>
                      <p className="truncate text-xs text-gray-500">{b.receiptNo} · {b.devotee?.name || '—'} · {fmtTime(b.paidAt)}</p>
                      <Flags b={b} />
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold tabular-nums text-gray-900">{rupees(b.amount)}</p>
                      <Badge variant={MODE_BADGE[b.paymentMode]}>{t(MODE_LABEL[b.paymentMode] || b.paymentMode)}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {s.status === 'verified' && s.digitalChecked && (
              <p className="mt-1.5 text-xs text-green-700">{t('Matched with the statement by {name}', { name: s.verifiedBy?.name || '—' })}</p>
            )}
          </Section>
        )}

        {notes.length > 0 && (
          <Section title={t('Notes and coins')}>
            <div className="rounded-xl border border-gray-100 bg-white px-3 py-1 text-sm">
              {notes.map((l) => (
                <div key={l.note} className="flex items-center justify-between gap-3 border-b border-gray-50 py-1.5 tabular-nums last:border-0">
                  <span className="text-gray-700"><b>₹{l.note}</b> × {l.count}</span>
                  <span className="font-medium text-gray-800">{rupees(l.total)}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {s.notes && (
          <Section title={t('Note from the counter')}>
            <p className="whitespace-pre-wrap break-words rounded-xl border border-gray-100 bg-white p-3 text-sm text-gray-800">{s.notes}</p>
          </Section>
        )}

        <Section title={t('Verification')}>
          {s.status === 'verified' ? (
            <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">
              <p className="flex items-center gap-1.5 font-semibold">
                <BadgeCheck className="h-4 w-4" /> {t('Verified by {name}', { name: s.verifiedBy?.name || '—' })}
              </p>
              <p className="mt-0.5 text-xs text-green-800">{fmtDateTime(s.verifiedAt)}</p>
              {s.verifyNote && <p className="mt-1.5 break-words">{s.verifyNote}</p>}
            </div>
          ) : (
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
              <p className="flex items-center gap-1.5 font-semibold"><Clock className="h-4 w-4" /> {t('Waiting for verification')}</p>
              {can('bookings:cash') && ownNotAllowed && (
                <p className="mt-1 text-xs text-blue-800">{t('Someone else has to verify your handover')}</p>
              )}
            </div>
          )}
        </Section>

        <Section title={t('Bookings in this shift')} right={bookings.length > 0 && <span className="text-xs text-gray-400">{bookings.length}</span>}>
          {isLoading ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : isError ? (
            <p className="rounded-xl border border-gray-100 p-3 text-sm text-red-600">{t(error?.response?.data?.message || 'Could not load the bookings')}</p>
          ) : bookings.length === 0 ? (
            <p className="rounded-xl border border-gray-100 p-3 text-sm text-gray-500">{t('No bookings')}</p>
          ) : (
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100 bg-white">
              {bookings.map((b) => {
                const voided = b.status === 'voided';
                const lateVoid = isVoidedAfterClose(b, s);
                return (
                  <li key={b._id || b.receiptNo} className={`px-3 py-2 ${lateVoid ? 'bg-amber-50' : voided ? 'bg-red-50/40' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`truncate text-sm font-medium ${voided ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{b.devotee?.name || '—'}</p>
                        <p className="truncate text-xs text-gray-500">{[b.sevaName, b.batchLabel].filter(Boolean).join(' · ')}</p>
                        <p className="font-mono text-[11px] text-gray-400">{b.receiptNo} · {fmtTime(b.paidAt)}{b.paymentRef ? ` · ${b.paymentRef}` : ''}</p>
                        <Flags b={b} />
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-sm font-semibold tabular-nums ${voided ? 'text-red-500 line-through' : 'text-gray-900'}`}>{rupees(b.amount)}</p>
                        {lateVoid
                          ? <Badge variant="yellow" className="whitespace-nowrap">{t('Voided after close')}</Badge>
                          : voided
                            ? <Badge variant="red">{t('Voided')}</Badge>
                            : <Badge variant={MODE_BADGE[b.paymentMode]}>{t(MODE_LABEL[b.paymentMode] || b.paymentMode)}</Badge>}
                      </div>
                    </div>
                    {voided && (b.voidReason || b.voidedAt) && (
                      <p className="mt-1 text-xs text-gray-500">
                        {[b.voidReason, b.voidedAt && fmtDateTime(b.voidedAt)].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </Sheet>

      {/* Supervisor sign-off */}
      <Modal open={verifyOpen} onClose={() => setVerifyOpen(false)} title={t('Verify handover')} size="sm">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            {rich(t('Confirm you received {amount} in cash from {name}.'), {
              amount: <strong className="tabular-nums">{rupees(s.countedCash)}</strong>,
              name: <strong>{s.user?.name || '—'}</strong>,
            })}
          </p>
          {tone !== 'match' && (
            <p className={`rounded-lg border px-3 py-2 text-xs ${TONE[tone].box} ${TONE[tone].text}`}>
              {differenceText(t, s.difference)}{s.notes ? ` — ${s.notes}` : ''}
            </p>
          )}
          {late?.count > 0 && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {t('{n} voided after close · {amount}', { n: late.count, amount: rupees(late.amount) })}
            </p>
          )}
          {digitalTotal > 0 && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 rounded" checked={digitalOk} onChange={(e) => setDigitalOk(e.target.checked)} />
              <span>
                {rich(t('UPI {upi} and card {card} match the bank / card statement.'), {
                  upi: <strong className="tabular-nums">{rupees(totals.upi)}</strong>,
                  card: <strong className="tabular-nums">{rupees(totals.card)}</strong>,
                })}
                {flagged > 0 && <span className="mt-0.5 block text-xs text-amber-700">{t('{n} payments are flagged — check them first.', { n: flagged })}</span>}
              </span>
            </label>
          )}
          <div>
            <label className="label" htmlFor="verify-note">{t('Note (optional)')}</label>
            <textarea id="verify-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)}
              className="input" placeholder={t('e.g. Short amount recovered')} />
          </div>
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setVerifyOpen(false)} className="btn-secondary">{t('Cancel')}</button>
            <button type="button" onClick={() => verifyMut.mutate()} disabled={verifyMut.isPending || (digitalTotal > 0 && !digitalOk)} className="btn-primary">
              {verifyMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
              {t('Verify handover')}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
