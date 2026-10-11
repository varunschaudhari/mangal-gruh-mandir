import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  AlertTriangle, Ban, Banknote, CheckCircle2, CreditCard, Eraser, History, Loader2, Minus, Plus, Printer, Smartphone, Vault,
} from 'lucide-react';
import Sheet from '../../ui/Sheet.jsx';
import Spinner from '../../ui/Spinner.jsx';
import { closeShift, getCurrentShift } from '../../../api/booking.api.js';
import { isNative } from '../../../utils/platform.js';
import haptics from '../../../utils/haptics.js';
import { useT } from '../../../i18n/index.jsx';
import { fmtMoney } from '../counter/counterUtils.js';
import { useShiftSlip } from './ShiftBits.jsx';
import {
  DENOMS, TONE, buildCloseBody, cleanDigits, countedFrom, denominationTotal, differenceText, differenceTone, fmtWhen,
  parseRupees, readShiftPrefs, saveShiftPrefs, shiftCash, toCount,
} from './shiftUtils.js';

// Close my shift at the booking counter: what I took since my last close, count the drawer
// (note by note or one total), see Expected / Counted / Difference live, explain any difference,
// then print the handover slip for the supervisor. The count survives closing the sheet by
// mistake; it is cleared once the shift is closed.

const emptyCounts = () => Object.fromEntries(DENOMS.map((d) => [String(d), '']));
const EMPTY_TOTALS = { count: 0, amount: 0, cash: 0, upi: 0, card: 0, voidedCount: 0 };

const stepBtn = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 '
  + 'hover:bg-gray-50 active:bg-gray-100 disabled:opacity-30 max-sm:h-11 max-sm:w-11';

/** ₹500 [−] [ 3 ] [+]  ₹1,500 */
function NoteRow({ note, value, onChange, inputRef, onEnter }) {
  const t = useT();
  const n = toCount(value);
  const step = (delta) => {
    haptics.tap();
    const next = Math.max(0, n + delta);
    onChange(next ? String(next) : '');
  };
  return (
    <div className="flex items-center gap-1.5 py-1">
      <span className="w-11 shrink-0 text-right text-sm font-bold tabular-nums text-gray-700">₹{note}</span>
      <button type="button" tabIndex={-1} onClick={() => step(-1)} disabled={!n} aria-label={t('One less ₹{d} note', { d: note })} className={stepBtn}>
        <Minus className="h-4 w-4" />
      </button>
      <input
        ref={inputRef} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" placeholder="0"
        value={value}
        onChange={(e) => onChange(cleanDigits(e.target.value, 4))}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } }}
        aria-label={t('₹{d} notes', { d: note })}
        className="input w-16 px-1 text-center font-semibold tabular-nums max-sm:w-[4.5rem]"
      />
      <button type="button" tabIndex={-1} onClick={() => step(1)} aria-label={t('One more ₹{d} note', { d: note })} className={stepBtn}>
        <Plus className="h-4 w-4" />
      </button>
      <span className={`ml-auto min-w-[4rem] text-right text-sm tabular-nums ${n ? 'font-semibold text-gray-800' : 'text-gray-300'}`}>
        ₹{fmtMoney(note * n)}
      </span>
    </div>
  );
}

/** A rupee box with a ₹ in front (digits only). */
function RupeeInput({ id, value, onChange, inputRef, big = false, label }) {
  return (
    <div className="relative">
      <span className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-400 ${big ? 'text-xl' : 'text-sm'}`}>₹</span>
      <input
        id={id} ref={inputRef} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" placeholder="0"
        value={value} onChange={(e) => onChange(cleanDigits(e.target.value))} onFocus={(e) => e.target.select()}
        aria-label={label}
        className={`input tabular-nums ${big ? 'h-14 pl-9 !text-2xl font-black' : 'pl-7 font-semibold'}`}
      />
    </div>
  );
}

const ModeTile = ({ icon: Icon, label, amount, tone }) => (
  <div className="min-w-0 rounded-lg bg-white px-2 py-1.5">
    <p className="flex items-center gap-1 text-[11px] font-medium text-gray-500"><Icon className="h-3 w-3 shrink-0" /> <span className="truncate">{label}</span></p>
    <p className={`truncate text-sm font-bold tabular-nums ${tone}`}>₹{fmtMoney(amount)}</p>
  </div>
);

/**
 * `settings` = booking settings (printer name, paper width, temple name) for the handover slip.
 * `historyLink` adds "See all handovers" to the done screen (off on the Cash Handover page itself).
 */
export default function CloseShiftSheet({ open, onClose, settings, historyLink = true }) {
  const t = useT();
  const qc = useQueryClient();
  const [prefs] = useState(readShiftPrefs);
  const [mode, setMode] = useState(prefs.mode);           // 'notes' | 'total'
  const [counts, setCounts] = useState(emptyCounts);
  const [typed, setTyped] = useState('');
  const [openingFloat, setOpeningFloat] = useState(prefs.float);
  const [notes, setNotes] = useState('');
  const [notesError, setNotesError] = useState('');
  const [done, setDone] = useState(null);                 // the closed shift
  const notesRef = useRef(null);
  const typedRef = useRef(null);
  const noteRefs = useRef([]);
  const { print, printing } = useShiftSlip(settings);

  // The opening float and the way of counting are remembered on this device.
  useEffect(() => { saveShiftPrefs({ float: openingFloat, mode }); }, [openingFloat, mode]);

  const currentQ = useQuery({
    queryKey: ['booking-shift-current'],
    queryFn: () => getCurrentShift().then((r) => r.data.data),
    enabled: Boolean(open) && !done,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const cur = currentQ.data;
  const totals = { ...EMPTY_TOTALS, ...cur?.totals };
  const hasBookings = Boolean(totals.count || totals.voidedCount);

  const counted = countedFrom(mode, counts, typed);
  const floatValue = parseRupees(openingFloat) ?? 0;
  const { expectedCash, difference } = shiftCash(totals.cash, floatValue, counted ?? 0);
  const tone = counted === null ? null : differenceTone(difference);
  const needsNote = Boolean(tone && tone !== 'match');
  const notesTotal = denominationTotal(counts);

  const focusNotes = () => setTimeout(() => {
    notesRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    notesRef.current?.focus({ preventScroll: true });
  }, 40);

  const closeMut = useMutation({
    mutationFn: (body) => closeShift(body).then((r) => r.data.data),
    onSuccess: (shift) => {
      haptics.success();
      setDone(shift);
      qc.invalidateQueries({ queryKey: ['booking-shift-current'] });
      qc.invalidateQueries({ queryKey: ['booking-shifts'] });
      qc.invalidateQueries({ queryKey: ['booking-summary-mine'] });
    },
    onError: (err) => {
      haptics.error();
      const res = err?.response;
      const msg = res?.data?.message;
      if (!res) {
        toast.error(t('No answer from the server — check the connection. If the shift was closed, it is listed in Cash Handover.'), { id: 'shift-close', duration: 8000 });
      } else if (/add a note/.test(msg || '')) {
        setNotesError(msg);
        focusNotes();
      } else {
        toast.error(msg ? t(msg) : t('Could not close the shift'), { id: 'shift-close', duration: 6000 });
      }
      currentQ.refetch(); // the numbers may have moved (a booking made or voided meanwhile)
    },
  });

  const finish = () => {
    setDone(null);
    setCounts(emptyCounts());
    setTyped('');
    setNotes('');
    setNotesError('');
    onClose();
  };
  const close = () => (done ? finish() : onClose());

  const chooseMode = (key) => {
    haptics.select();
    if (key === 'total' && !typed && notesTotal) setTyped(String(notesTotal));
    setMode(key);
  };

  const submit = () => {
    if (closeMut.isPending || !hasBookings) return;
    const body = buildCloseBody({ mode, counts, typed, openingFloat, notes });
    if (!body) {
      haptics.warning();
      toast.error(t('Enter the cash you counted'), { id: 'shift-close' });
      typedRef.current?.focus();
      return;
    }
    if (needsNote && !body.notes) {
      haptics.warning();
      setNotesError(difference < 0 ? 'Cash is short — add a note explaining it' : 'Cash is more than expected — add a note explaining it');
      focusNotes();
      return;
    }
    closeMut.mutate(body);
  };

  const countedText = counted === null ? '—' : `₹${fmtMoney(counted)}`;
  const diffText = tone ? differenceText(t, difference) : '—';
  const since = cur?.since || cur?.firstAt;

  // ── Done: the numbers as saved, and the slip ────────────────────────────────
  if (done) {
    const dTone = differenceTone(done.difference);
    return (
      <Sheet
        open={open} onClose={close} title={t('Shift closed')} size="md"
        footer={(
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <button type="button" onClick={() => print(done)} disabled={printing} className="btn-primary">
              {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              {isNative ? t('Handover slip PDF') : t('Print handover slip')}
            </button>
            <button type="button" onClick={finish} className="btn-secondary">{t('Done')}</button>
          </div>
        )}
      >
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
          <p className="mt-2 text-lg font-bold text-gray-900">{t('Shift closed')}</p>
          <p className="text-sm text-gray-500">{t('Hand over the cash with the printed slip.')}</p>
        </div>
        <dl className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-100 text-sm">
          {[
            [t('Bookings'), `${done.totals?.count ?? 0} · ₹${fmtMoney(done.totals?.amount)}`],
            [t('Expected cash'), `₹${fmtMoney(done.expectedCash)}`],
            [t('Counted cash'), `₹${fmtMoney(done.countedCash)}`],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <dt className="text-gray-600">{label}</dt>
              <dd className="font-semibold tabular-nums text-gray-900">{value}</dd>
            </div>
          ))}
          <div className={`flex items-center justify-between gap-3 rounded-b-xl px-3 py-2.5 ${TONE[dTone].box}`}>
            <dt className="font-semibold text-gray-700">{t('Difference')}</dt>
            <dd className={`text-base font-black tabular-nums ${TONE[dTone].text}`}>{differenceText(t, done.difference)}</dd>
          </div>
        </dl>
        {done.notes && <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{t('Note')}: {done.notes}</p>}
        <p className="mt-3 text-center text-xs text-gray-500">{t('A supervisor verifies the handover in Cash Handover.')}</p>
        {historyLink && (
          <Link to="/bookings/shifts" onClick={finish}
            className="mx-auto mt-2 flex min-h-[44px] w-fit items-center gap-1.5 px-2 text-sm font-medium text-primary-700 hover:underline">
            <History className="h-4 w-4" /> {t('See all handovers')}
          </Link>
        )}
      </Sheet>
    );
  }

  // ── Count and close ─────────────────────────────────────────────────────────
  const footer = (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{t('Counted')}</p>
        <p className="flex flex-wrap items-baseline gap-x-2 leading-tight">
          <span className="text-xl font-black tabular-nums text-gray-900">{countedText}</span>
          {tone && <span className={`text-xs font-bold ${TONE[tone].text}`}>{diffText}</span>}
        </p>
      </div>
      <button type="button" onClick={submit} disabled={closeMut.isPending || !hasBookings || !cur}
        className="btn-primary min-h-[48px] shrink-0 px-5 text-base font-bold">
        {closeMut.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Vault className="h-5 w-5" />}
        {closeMut.isPending ? t('Closing…') : t('Close shift')}
      </button>
    </div>
  );

  return (
    <Sheet open={open} onClose={close} title={t('Close shift')} size="lg" full footer={footer}>
      {currentQ.isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : currentQ.isError && !cur ? (
        <div className="py-8 text-center">
          <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-amber-500" />
          <p className="text-sm text-gray-600">{t(currentQ.error?.response?.data?.message || 'Could not load your shift')}</p>
          <button type="button" onClick={() => currentQ.refetch()} className="btn-secondary mt-3">{t('Try again')}</button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* What I took since my last close */}
          <section className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-gray-500">{since ? t('Bookings since {time}', { time: fmtWhen(since) }) : t('Bookings')}</p>
                <p className="text-3xl font-black tabular-nums leading-tight text-gray-900">{totals.count}</p>
              </div>
              <div className="min-w-0 text-right">
                <p className="text-xs text-gray-500">{t('collected')}</p>
                <p className="truncate text-2xl font-black tabular-nums leading-tight text-primary-700">₹{fmtMoney(totals.amount)}</p>
              </div>
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-1.5">
              <ModeTile icon={Banknote} label={t('Cash')} amount={totals.cash} tone="text-green-700" />
              <ModeTile icon={Smartphone} label={t('UPI')} amount={totals.upi} tone="text-blue-700" />
              <ModeTile icon={CreditCard} label={t('Card')} amount={totals.card} tone="text-purple-700" />
            </div>
            {totals.voidedCount > 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-600">
                <Ban className="h-3.5 w-3.5 shrink-0 text-red-500" /> {t('{n} voided — not counted', { n: totals.voidedCount })}
              </p>
            )}
            <p className="mt-1.5 text-xs text-gray-500">{t('UPI and card money goes to the bank, not the drawer — count only the cash.')}</p>
            {cur?.lastShift?.closedAt && (
              <p className="mt-1 text-[11px] text-gray-400">{t('Last closed {time}', { time: fmtWhen(cur.lastShift.closedAt) })}</p>
            )}
          </section>

          {!hasBookings ? (
            <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center">
              <p className="font-semibold text-gray-700">{t('Nothing to hand over yet')}</p>
              <p className="mt-1 text-sm text-gray-500">{t('No bookings to hand over since your last close')}</p>
            </div>
          ) : (
            <>
              {/* Opening float */}
              <div className="sm:max-w-xs">
                <label htmlFor="shift-float" className="label">{t('Opening float')}</label>
                <RupeeInput id="shift-float" value={openingFloat} onChange={setOpeningFloat} />
                <p className="mt-1 text-xs text-gray-400">{t('Change you started with. Remembered on this device.')}</p>
              </div>

              {/* Count the cash */}
              <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('Count the cash')}</h3>
                  {mode === 'notes' && notesTotal > 0 && (
                    <button type="button" onClick={() => setCounts(emptyCounts())}
                      className="flex min-h-[36px] items-center gap-1 rounded-md px-2 text-xs font-medium text-gray-500 hover:bg-gray-100 max-sm:min-h-[44px]">
                      <Eraser className="h-3.5 w-3.5" /> {t('Clear')}
                    </button>
                  )}
                </div>
                <div role="radiogroup" aria-label={t('How to count')} className="grid grid-cols-2 rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-sm">
                  {[['notes', 'Count notes'], ['total', 'Type the total']].map(([key, label]) => (
                    <button key={key} type="button" role="radio" aria-checked={mode === key} onClick={() => chooseMode(key)}
                      className={`min-h-[40px] rounded-md px-3 font-medium transition-colors max-sm:min-h-[44px] ${mode === key ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500'}`}>
                      {t(label)}
                    </button>
                  ))}
                </div>
                <p className="mb-2 mt-1.5 text-xs text-gray-400">{t('Count all the cash in the drawer, including the opening float.')}</p>

                {mode === 'notes' ? (
                  <>
                    <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
                      {DENOMS.map((d, i) => (
                        <NoteRow
                          key={d} note={d} value={counts[String(d)]}
                          onChange={(v) => setCounts((c) => ({ ...c, [String(d)]: v }))}
                          inputRef={(el) => { noteRefs.current[i] = el; }}
                          onEnter={() => (noteRefs.current[i + 1] || notesRef.current)?.focus()}
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
                      <span className="text-sm text-gray-500">{t('Total of notes')}</span>
                      <span className="text-lg font-black tabular-nums text-gray-900">₹{fmtMoney(notesTotal)}</span>
                    </div>
                  </>
                ) : (
                  <div className="sm:max-w-xs">
                    <RupeeInput value={typed} onChange={setTyped} inputRef={typedRef} big label={t('Cash counted')} />
                  </div>
                )}
              </section>

              {/* Expected / Counted / Difference */}
              <section className={`rounded-xl border p-3 ${tone ? TONE[tone].box : 'border-gray-200 bg-white'}`} aria-live="polite">
                <dl className="space-y-1.5 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-gray-600">{t('Expected cash')}</dt>
                    <dd className="font-bold tabular-nums text-gray-900">₹{fmtMoney(expectedCash)}</dd>
                  </div>
                  {floatValue > 0 && (
                    <p className="text-right text-[11px] text-gray-500">
                      {t('₹{float} float + ₹{cash} cash bookings', { float: fmtMoney(floatValue), cash: fmtMoney(totals.cash) })}
                    </p>
                  )}
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-gray-600">{t('Counted')}</dt>
                    <dd className="font-bold tabular-nums text-gray-900">{countedText}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-black/5 pt-2">
                    <dt className="font-semibold text-gray-700">{t('Difference')}</dt>
                    <dd className={`flex items-center gap-1.5 text-lg font-black tabular-nums ${tone ? TONE[tone].text : 'text-gray-400'}`}>
                      {tone === 'match' && <CheckCircle2 className="h-5 w-5" />}
                      {tone && tone !== 'match' && <AlertTriangle className="h-5 w-5" />}
                      {diffText}
                    </dd>
                  </div>
                </dl>
              </section>

              {/* Notes — required when the count is off */}
              <div>
                <label htmlFor="shift-notes" className="label">
                  {needsNote ? (difference < 0 ? t('Why is the cash short?') : t('Why is there extra cash?')) : t('Notes')}
                  {needsNote && <span className="text-red-500"> *</span>}
                </label>
                <textarea
                  id="shift-notes" ref={notesRef} rows={2} maxLength={500} value={notes}
                  onChange={(e) => { setNotes(e.target.value); if (notesError) setNotesError(''); }}
                  placeholder={needsNote ? t('Say why the count is different') : t('Anything the supervisor should know (optional)')}
                  className={`input ${notesError ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`}
                />
                {notesError && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {t(notesError)}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
