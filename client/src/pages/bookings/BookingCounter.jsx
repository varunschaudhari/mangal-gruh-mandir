import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, ChevronDown, Loader2, Settings2 } from 'lucide-react';
import { createBooking, getAvailability, getBookingOptions, getBookingSummary, lookupDevotee } from '../../api/booking.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StickyActionBar from '../../components/ui/StickyActionBar.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import haptics from '../../utils/haptics.js';
import { isNative } from '../../utils/platform.js';
import { useLanguage, useT } from '../../i18n/index.jsx';
import SevaTiles, { sevaNames } from '../../components/booking/counter/SevaTiles.jsx';
import DateChips from '../../components/booking/counter/DateChips.jsx';
import BatchPanel from '../../components/booking/counter/BatchPanel.jsx';
import { DevoteeMore, PhoneAndName } from '../../components/booking/counter/DevoteeFields.jsx';
import SankalpPanel from '../../components/booking/counter/SankalpPanel.jsx';
import PaymentPicker, { PaymentModes, PaymentRefInput } from '../../components/booking/counter/PaymentPicker.jsx';
import SuccessSheet from '../../components/booking/counter/SuccessSheet.jsx';
import DuplicateSheet from '../../components/booking/counter/DuplicateSheet.jsx';
import { CounterOptions, MyCollection, SessionBookings, ShortcutLegend } from '../../components/booking/counter/CounterSidePanel.jsx';
import CloseShiftSheet from '../../components/booking/shift/CloseShiftSheet.jsx';
import { HallBadge, SectionTitle, playBeep } from '../../components/booking/counter/bits.jsx';
import { useCounterPrefs, useReceiptActions, useSessionBookings, useToday } from '../../components/booking/counter/hooks.js';
import {
  EMPTY_DEVOTEE, addDays, addFamilyNames, buildBookingBody, cleanPhoneInput, clearPrefilled, compactBatchLabel,
  devoteeFormValues, fillEmpty, fmtDay, fmtMoney, isAllowedDay, isValidPhone, lastBookableDay, newRequestId,
  nextAllowedDay, serverText, validateBooking,
} from '../../components/booking/counter/counterUtils.js';

// A mouse and a physical keyboard: Enter books, focus jumps between fields.
// Touch screens: no focus jumps that would pop the on-screen keyboard unasked.
const hasKeyboard = () => !isNative && Boolean(window.matchMedia?.('(hover: hover) and (pointer: fine)').matches);

const ERROR_ORDER = ['phone', 'name', 'seva', 'when', 'address', 'email', 'people'];

export default function BookingCounter() {
  const t = useT();
  const { lang } = useLanguage();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { can } = usePermissions();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const isWide = useMediaQuery('(min-width: 640px)'); // tablets up: payment sits in the Book bar
  const today = useToday();
  const [prefs, setPref] = useCounterPrefs();
  const [session, addToSession] = useSessionBookings();

  const phoneRef = useRef(null);
  const nameRef = useRef(null);
  const addressRef = useRef(null);
  const sevaRef = useRef(null);
  const whenRef = useRef(null);

  // ── Setup from the server ───────────────────────────────────────────────────
  const optionsQ = useQuery({
    queryKey: ['booking-options'],
    queryFn: getBookingOptions,             // same cache shape as the register, day sheet and reports
    select: (r) => r.data.data,
    staleTime: 5 * 60_000,
  });
  const sevaTypes = useMemo(() => optionsQ.data?.sevaTypes || [], [optionsQ.data]);
  const settings = useMemo(() => optionsQ.data?.settings || {}, [optionsQ.data]);
  const { printSlip, printA4, sendWhatsApp } = useReceiptActions(settings);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [phone, setPhone] = useState('');
  const [devotee, setDevotee] = useState(EMPTY_DEVOTEE);
  const [familyDraft, setFamilyDraft] = useState('');
  const [notes, setNotes] = useState('');
  const [peopleCount, setPeopleCount] = useState(1);
  const [sevaId, setSevaId] = useState(null);
  const [date, setDate] = useState(today);
  const [batchId, setBatchId] = useState(null);
  const [paymentMode, setPaymentMode] = useState('cash');
  const [paymentRef, setPaymentRef] = useState('');
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);   // the kept batch filled up
  const [booked, setBooked] = useState(null);   // success sheet
  const [duplicate, setDuplicate] = useState(null); // { booking, body } — already booked that day; ask first
  const [stripOpen, setStripOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false); // close shift & hand over cash

  const seva = sevaTypes.find((s) => s._id === sevaId) || sevaTypes[0] || null;
  const needsDate = Boolean(seva && seva.schedule !== 'none');
  const lastDay = lastBookableDay(today, settings.maxAdvanceDays);

  // Past midnight on an open counter: move on to the new day.
  useEffect(() => { setDate((d) => (d < today ? today : d)); }, [today]);

  // ── Seats ───────────────────────────────────────────────────────────────────
  const availQ = useQuery({
    queryKey: ['booking-availability', seva?._id, date],
    queryFn: () => getAvailability(seva._id, date).then((r) => r.data.data),
    enabled: needsDate && Boolean(date),
    refetchInterval: 30_000,
    staleTime: 5_000,
    retry: 1,
  });
  const avail = needsDate ? availQ.data : undefined;
  const capacityUnit = avail?.capacityUnit || settings.capacityUnit || 'bookings';

  // Pick the first open batch once per seva + date (never over the staff's choice), and
  // drop the chosen batch when it fills up or finishes.
  const autoPicked = useRef('');
  useEffect(() => {
    if (!seva || seva.schedule !== 'batch' || !avail?.open) return;
    const seats = capacityUnit === 'people' ? peopleCount : 1;
    const list = avail.batches || [];
    if (batchId) {
      const cur = list.find((b) => b._id === batchId);
      if (!cur || cur.ended || cur.left < seats) {
        setBatchId(null);
        if (cur && !cur.ended) setNotice(cur);
      }
      return;
    }
    const key = `${seva._id}|${date}`;
    if (autoPicked.current === key) return;
    autoPicked.current = key;
    const first = list.find((b) => !b.ended && b.left >= seats);
    if (first) setBatchId(first._id);
  }, [avail, batchId, seva, date, capacityUnit, peopleCount]);

  // ── Returning devotee ───────────────────────────────────────────────────────
  const phone10 = isValidPhone(phone) ? phone : '';
  const lookupQ = useQuery({
    queryKey: ['booking-devotee', phone10],
    queryFn: () => lookupDevotee(phone10).then((r) => r.data.data),
    enabled: Boolean(phone10),
    staleTime: 60_000,
    retry: false,
  });

  const prefill = useRef({ phone: '', values: null });
  useEffect(() => {
    if (!phone10 || prefill.current.phone === phone10) return;
    if (!lookupQ.isSuccess && !lookupQ.isError) return;
    const found = lookupQ.isSuccess ? lookupQ.data : null;
    const values = found?.devotee ? devoteeFormValues(found.devotee) : null;
    prefill.current = { phone: phone10, values };
    if (values) {
      setDevotee((cur) => fillEmpty(cur, values));
      if (found.peopleCount > 1) setPeopleCount((n) => (n === 1 ? Math.min(found.peopleCount, seva?.maxPeople || 99) : n));
    }
    // Move on from the mobile number: to the name (new devotee, or a keyboard to correct it).
    if (document.activeElement === phoneRef.current) {
      if (values && !hasKeyboard()) phoneRef.current.blur();
      else setTimeout(() => { nameRef.current?.focus(); nameRef.current?.select(); }, 0);
    }
  }, [phone10, lookupQ.isSuccess, lookupQ.isError, lookupQ.data, seva]);

  // ── My collection today ─────────────────────────────────────────────────────
  const userId = user?._id || user?.id;
  const summaryQ = useQuery({
    queryKey: ['booking-summary-mine', today, userId],
    queryFn: () => getBookingSummary({ from: today, to: today, createdBy: userId }).then((r) => r.data.data),
    enabled: Boolean(userId),
    refetchInterval: 60_000,
    staleTime: 15_000,
  });

  // ── Field handlers ──────────────────────────────────────────────────────────
  const clearError = useCallback((...keys) => {
    setErrors((e) => (keys.some((k) => e[k]) ? { ...e, ...Object.fromEntries(keys.map((k) => [k, undefined])) } : e));
  }, []);

  const onPhone = (raw) => {
    const next = cleanPhoneInput(raw);
    setPhone(next);
    clearError('phone');
    const p = prefill.current;
    if (p.phone && p.phone !== next) {
      if (p.values) setDevotee((cur) => clearPrefilled(cur, p.values));
      prefill.current = { phone: '', values: null };
    }
  };

  const setField = useCallback((key, value) => {
    setDevotee((d) => ({ ...d, [key]: value }));
    clearError(key);
  }, [clearError]);

  const chooseSeva = useCallback((s) => {
    if (!s) return;
    haptics.select();
    setSevaId(s._id);
    clearError('seva', 'when', 'address', 'people');
    if (s._id !== seva?._id) { setBatchId(null); setNotice(null); }
    if (s.schedule === 'slot' && !isAllowedDay(date, s.weekdays)) {
      const next = nextAllowedDay(today, s.weekdays, lastDay);
      if (next) setDate(next);
    }
    if (s.maxPeople) setPeopleCount((n) => Math.min(n, s.maxPeople));
  }, [seva, date, today, lastDay, clearError]);

  const chooseDate = useCallback((key) => {
    haptics.select();
    setDate(key);
    if (key !== date) { setBatchId(null); setNotice(null); }
    clearError('when');
  }, [date, clearError]);

  const choosePayment = useCallback((m) => { haptics.select(); setPaymentMode(m); }, []);

  const pickBatch = useCallback((b) => {
    haptics.select();
    setBatchId(b._id);
    setNotice(null);
    clearError('when');
  }, [clearError]);

  const focusPhone = useCallback(() => setTimeout(() => {
    const el = phoneRef.current;
    if (!el) return;
    el.focus();
    const n = el.value.length;
    try { el.setSelectionRange(n, n); } catch { /* type=tel supports it; ignore elsewhere */ }
  }, 40), []);

  const pending = useRef(null); // { hash, id } — the same booking retried keeps its request id

  // New booking: clear the devotee; keep seva / date / batch when that option is on.
  const resetForNext = useCallback((digit = '', { keepWhen = prefs.keep } = {}) => {
    setBooked(null);
    setErrors({});
    setNotice(null);
    setPhone(cleanPhoneInput(digit));
    setDevotee(EMPTY_DEVOTEE);
    setFamilyDraft('');
    setNotes('');
    setPeopleCount(1);
    setPaymentMode('cash');
    setPaymentRef('');
    prefill.current = { phone: '', values: null };
    pending.current = null;
    if (!keepWhen) {
      setSevaId(null);
      setDate(today);
      setBatchId(null);
      autoPicked.current = '';
    }
    focusPhone();
  }, [prefs.keep, today, focusPhone]);

  const sameDevotee = () => {
    setBooked(null);
    pending.current = null;
    setTimeout(() => sevaRef.current?.querySelector('[role="radio"][tabindex="0"]')?.focus(), 40);
  };

  // ── Booking ─────────────────────────────────────────────────────────────────
  const bookMut = useMutation({
    mutationFn: (body) => createBooking(body).then((r) => r.data.data),
    onSuccess: (booking) => {
      pending.current = null;
      playBeep();
      haptics.success();
      addToSession(booking);
      setBooked(booking);
      qc.invalidateQueries({ queryKey: ['booking-availability'] });
      qc.invalidateQueries({ queryKey: ['booking-summary-mine'] });
      qc.invalidateQueries({ queryKey: ['booking-devotee'] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
      if (prefs.autoPrint && !isNative) printSlip(booking);
    },
    onError: (err, body) => {
      const res = err?.response;
      // Same mobile number already has this seva that day: nothing was saved — ask before booking again.
      const dup = res?.status === 409 && res.data?.errors?.[0]?.code === 'DUPLICATE' ? res.data.errors[0].booking : null;
      if (dup) {
        haptics.warning();
        toast.dismiss('booking-error');
        setDuplicate({ booking: dup, body });
        return;
      }
      haptics.error();
      const msg = serverText(t, res?.data?.message, { sevaTypes, lang });
      if (!res) {
        toast.error(t('No answer from the server. Press Book again — it will not be booked twice.'), { id: 'booking-error', duration: 7000 });
        return;
      }
      toast.error(msg || t('Booking failed'), { id: 'booking-error', duration: 6000 });
      if (res.status === 409 || res.status === 400) availQ.refetch();
    },
  });

  const errorText = (key) => (errors[key] ? serverText(t, errors[key], { sevaTypes, lang }) : undefined);

  const focusError = (key) => {
    const go = (el) => { el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); el?.focus?.({ preventScroll: true }); };
    if (key === 'phone') go(phoneRef.current);
    else if (key === 'name') go(nameRef.current);
    else if (key === 'address') go(addressRef.current);
    else if (key === 'seva') sevaRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    else if (key === 'when') whenRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    else if (key === 'email') go(document.getElementById('bk-email'));
    else if (key === 'people') go(document.getElementById('bk-people'));
  };

  const submit = () => {
    if (bookMut.isPending || !seva) return;
    // A family name typed but not yet added with Enter still counts.
    const familyNames = familyDraft.trim() ? addFamilyNames(devotee.familyNames, familyDraft) : devotee.familyNames;
    if (familyDraft.trim()) { setDevotee((d) => ({ ...d, familyNames })); setFamilyDraft(''); }
    const dv = { ...devotee, familyNames };

    const errs = validateBooking({ seva, phone, devotee: dv, date, batchId, availability: avail, peopleCount, capacityUnit });
    const first = ERROR_ORDER.find((k) => errs[k]);
    if (first) {
      setErrors(errs);
      haptics.warning();
      toast.error(serverText(t, errs[first], { sevaTypes, lang }), { id: 'booking-check' });
      focusError(first);
      if (first === 'when' && avail) availQ.refetch();
      return;
    }
    setErrors({});
    const body = buildBookingBody({ seva, phone, devotee: dv, date, batchId, peopleCount, paymentMode, paymentRef, notes });
    const hash = JSON.stringify(body);
    if (pending.current?.hash !== hash) pending.current = { hash, id: newRequestId() };
    bookMut.mutate({ ...body, clientRequestId: pending.current.id });
  };

  // ── Keyboard ────────────────────────────────────────────────────────────────
  // One document listener; it reads the latest handlers from a ref.
  const keys = useRef({});
  keys.current = {
    open: Boolean(booked || duplicate || shiftOpen),
    submit,
    chooseSeva: (i) => chooseSeva(sevaTypes[i]),
    pay: choosePayment,
    clear: () => resetForNext('', { keepWhen: true }),
  };
  useEffect(() => {
    const onKey = (e) => {
      const k = keys.current;
      if (k.open || e.isComposing) return;   // the success sheet has its own keys
      if (e.key === 'F2') {
        e.preventDefault();
        phoneRef.current?.focus();
        phoneRef.current?.select();
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const digit = /^Digit([1-9])$/.exec(e.code);
        if (digit) { e.preventDefault(); k.chooseSeva(Number(digit[1]) - 1); return; }
        const mode = { KeyC: 'cash', KeyU: 'upi', KeyK: 'card' }[e.code];
        if (mode) { e.preventDefault(); k.pay(mode); return; }
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); k.submit(); return; }
      if (e.key === 'Escape' && !e.defaultPrevented) {
        if (e.target?.closest?.('[role="dialog"], [data-keep-esc]') || document.querySelector('[role="dialog"]')) return;
        e.preventDefault();
        k.clear();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Enter books from any field (keyboard counters). Buttons keep their own Enter, except the
  // seva / date / batch / payment choices, which behave like radio buttons in a form.
  const onFormKeyDown = (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
    if (e.defaultPrevented || !hasKeyboard()) return;
    const el = e.target;
    if (el.closest?.('[data-enter-skip]') || el.tagName === 'TEXTAREA') return;
    if ((el.tagName === 'BUTTON' || el.tagName === 'A') && !el.hasAttribute('data-enter-books')) return;
    e.preventDefault();
    submit();
  };

  // Ready to type on a counter PC.
  useEffect(() => {
    if (optionsQ.isSuccess && hasKeyboard()) phoneRef.current?.focus();
  }, [optionsQ.isSuccess]);

  // ── Render ──────────────────────────────────────────────────────────────────
  if (optionsQ.isLoading) return <PageLoader />;
  if (optionsQ.isError) {
    return (
      <div className="card mx-auto mt-8 max-w-md p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-amber-500" />
        <p className="font-semibold text-gray-800">{t('Could not load the booking counter')}</p>
        <p className="mt-1 text-sm text-gray-500">{serverText(t, optionsQ.error?.response?.data?.message) || t('Check your internet connection and try again.')}</p>
        <button type="button" onClick={() => optionsQ.refetch()} className="btn-primary mt-4">{t('Try again')}</button>
      </div>
    );
  }
  if (!sevaTypes.length) {
    return (
      <>
        <PageHeader title="Booking Counter" />
        <div className="card mx-auto max-w-md p-6 text-center">
          <Settings2 className="mx-auto mb-2 h-8 w-8 text-gray-400" />
          <p className="font-semibold text-gray-800">{t('No seva types are set up yet')}</p>
          <p className="mt-1 text-sm text-gray-500">{t('Add seva types, prices and batches in Booking Setup first.')}</p>
          {can('bookings:manage') && <Link to="/bookings/setup" className="btn-primary mt-4">{t('Booking Setup')}</Link>}
        </div>
      </>
    );
  }

  const total = seva?.price || 0;
  const selectedBatch = avail?.batches?.find((b) => b._id === batchId);
  const { primary: sevaName } = sevaNames(seva, lang);
  const choiceLine = [
    sevaName,
    needsDate && fmtDay(date, lang),
    seva?.schedule === 'batch' && selectedBatch && compactBatchLabel(selectedBatch.start, selectedBatch.end, selectedBatch.label),
    seva?.schedule === 'slot' && (avail?.slot?.label || seva.slotTime),
  ].filter(Boolean).join(' · ');
  const bookLabel = bookMut.isPending ? t('Booking…') : t('Book · ₹{amount}', { amount: fmtMoney(total) });
  const whenTitle = seva?.schedule === 'batch' ? t('Batch') : seva?.schedule === 'slot' ? t('Time') : null;
  const suggestDate = needsDate ? nextAllowedDay(date >= today ? addDays(date, 1) : today, seva.schedule === 'slot' ? seva.weekdays : null, lastDay) : null;
  const mine = summaryQ.data?.totals;
  // The seats panel already says why (closed day, full slot) — no second red line for it.
  const slotLeft = avail?.slot?.left;
  const panelExplains = Boolean(avail) && (!avail.open
    || (seva?.schedule === 'slot' && slotLeft != null && slotLeft < (capacityUnit === 'people' ? peopleCount : 1)));

  const receiptProps = { onSlip: printSlip, onA4: printA4, onWhatsApp: sendWhatsApp };

  return (
    <>
      <PageHeader
        title="Booking Counter"
        subtitle={fmtDay(today, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      />

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3" onKeyDown={onFormKeyDown}>
          {/* Phones / tablets: my totals and recent bookings fold away above the form */}
          {!isDesktop && (
            <div className="card overflow-hidden">
              <button type="button" onClick={() => setStripOpen((v) => !v)} aria-expanded={stripOpen}
                className="flex min-h-[48px] w-full items-center gap-2 px-4 py-2 text-left">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t('My bookings today')}</span>
                <span className="ml-auto text-sm font-bold tabular-nums text-gray-800">
                  {mine ? `${mine.count} · ₹${fmtMoney(mine.amount)}` : '—'}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${stripOpen ? 'rotate-180' : ''}`} />
              </button>
              {stripOpen && (
                <div className="space-y-4 border-t border-gray-100 px-4 py-3">
                  <MyCollection query={summaryQ} compact onCloseShift={() => setShiftOpen(true)} />
                  <SessionBookings list={session} sevaTypes={sevaTypes} compact {...receiptProps} />
                </div>
              )}
            </div>
          )}

          {/* 1 · Mobile number + name */}
          <section className="card p-4">
            <PhoneAndName
              phone={phone} onPhone={onPhone} phoneRef={phoneRef} lookup={lookupQ}
              errors={{ phone: errorText('phone'), name: errorText('name') }}
              name={devotee.name} onName={(v) => setField('name', v)} nameRef={nameRef}
              sevaTypes={sevaTypes} sevaId={seva?._id} date={needsDate ? date : ''}
            />
          </section>

          {/* 2 · Seva, date, batch */}
          <section className="card space-y-4 p-4">
            <div ref={sevaRef}>
              <SectionTitle>{t('Seva')}</SectionTitle>
              <SevaTiles sevaTypes={sevaTypes} value={seva?._id} onChange={chooseSeva} error={errorText('seva')} />
            </div>
            {needsDate && (
              <div>
                <SectionTitle>{t('Puja date')}</SectionTitle>
                <DateChips seva={seva} today={today} value={date} onChange={chooseDate} maxAdvanceDays={settings.maxAdvanceDays} />
              </div>
            )}
            <div ref={whenRef}>
              {whenTitle && (
                <SectionTitle right={selectedBatch && <span className="flex items-center gap-1.5 text-xs text-gray-500">{t('Chosen')}: <b className="text-gray-800">{compactBatchLabel(selectedBatch.start, selectedBatch.end, selectedBatch.label)}</b> <HallBadge hall={selectedBatch.hall} /></span>}>
                  {whenTitle}
                </SectionTitle>
              )}
              {errors.when && !panelExplains && (
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-red-600">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {errorText('when')}
                </p>
              )}
              <BatchPanel
                seva={seva} sevaTypes={sevaTypes} query={availQ} date={date} today={today}
                batchId={batchId} onPick={pickBatch} onDate={chooseDate} suggestDate={suggestDate}
                notice={notice} capacityUnit={capacityUnit} peopleCount={peopleCount}
              />
            </div>
          </section>

          {/* 3 · Devotee details + sankalp */}
          <section className="card space-y-3 p-4">
            <DevoteeMore
              seva={seva} devotee={devotee} setField={setField} addressRef={addressRef}
              peopleCount={peopleCount} setPeopleCount={(n) => { setPeopleCount(n); clearError('people'); }}
              errors={{ address: errorText('address'), email: errorText('email'), people: errorText('people') }}
            />
            <SankalpPanel
              open={prefs.sankalpOpen} onToggle={() => setPref('sankalpOpen', !prefs.sankalpOpen)}
              devotee={devotee} setField={setField}
              familyDraft={familyDraft} onFamilyDraft={setFamilyDraft}
              notes={notes} onNotes={setNotes}
            />
          </section>

          {/* 4 · Payment (phones; from tablets up it is in the Book bar) */}
          {!isWide && (
            <section className="card p-4">
              <SectionTitle>{t('Payment')}</SectionTitle>
              <PaymentPicker mode={paymentMode} onMode={choosePayment} paymentRef={paymentRef} onRef={setPaymentRef} />
            </section>
          )}

          {!isDesktop && (
            <section className="card px-4 py-2">
              <CounterOptions prefs={prefs} setPref={setPref} compact />
            </section>
          )}

          {/* Book — tablets and desktop (phones use the pinned bar below) */}
          {isWide && (
            <div className="sticky bottom-0 z-10 space-y-2 rounded-xl border border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-4px_14px_rgba(0,0,0,0.07)] backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-gray-500">{choiceLine}</p>
                  <p className="text-2xl font-black tabular-nums leading-tight text-gray-900">₹{fmtMoney(total)}</p>
                </div>
                <div className="w-[min(44%,300px)] shrink-0">
                  <PaymentModes mode={paymentMode} onMode={choosePayment} compact />
                </div>
                <button type="button" onClick={submit} disabled={bookMut.isPending}
                  className="btn-primary min-h-[52px] shrink-0 px-6 text-base font-bold shadow-sm xl:px-8">
                  {bookMut.isPending && <Loader2 className="h-5 w-5 animate-spin" />} {bookLabel}
                </button>
              </div>
              {paymentMode !== 'cash' && <PaymentRefInput mode={paymentMode} value={paymentRef} onChange={setPaymentRef} className="h-11" />}
              <p className="hidden text-[11px] text-gray-400 lg:block">
                <kbd className="font-mono">Enter</kbd> {t('book')} · <kbd className="font-mono">Esc</kbd> {t('clear')} · <kbd className="font-mono">F2</kbd> {t('mobile no.')} · <kbd className="font-mono">Alt+C / U / K</kbd> {t('Cash / UPI / Card')}
              </p>
            </div>
          )}
        </div>

        {isDesktop && (
          <aside className="space-y-3 lg:sticky lg:top-0">
            <MyCollection query={summaryQ} onCloseShift={() => setShiftOpen(true)} />
            <SessionBookings list={session} sevaTypes={sevaTypes} {...receiptProps} />
            <CounterOptions prefs={prefs} setPref={setPref} />
            <ShortcutLegend />
          </aside>
        )}
      </div>

      <StickyActionBar className="sm:hidden">
        <div className="!flex-none flex min-w-[88px] flex-col justify-center">
          <span className="max-w-[40vw] truncate text-[11px] text-gray-500">{sevaName}</span>
          <span className="text-xl font-black tabular-nums text-gray-900">₹{fmtMoney(total)}</span>
        </div>
        <button type="button" onClick={submit} disabled={bookMut.isPending}
          className="btn-primary min-h-[52px] text-base font-bold">
          {bookMut.isPending && <Loader2 className="h-5 w-5 animate-spin" />} {bookMut.isPending ? t('Booking…') : t('Book')}
        </button>
      </StickyActionBar>

      <CloseShiftSheet open={shiftOpen} onClose={() => setShiftOpen(false)} settings={settings} />

      <SuccessSheet
        booking={booked}
        sevaTypes={sevaTypes}
        whatsappAuto={settings.whatsappAuto}
        onNew={(digit) => resetForNext(digit)}
        onSameDevotee={sameDevotee}
        {...receiptProps}
      />

      <DuplicateSheet
        booking={duplicate?.booking}
        sevaTypes={sevaTypes}
        onCancel={() => setDuplicate(null)}
        onBookAgain={() => {
          const body = duplicate?.body;
          setDuplicate(null);
          if (body && !bookMut.isPending) bookMut.mutate({ ...body, allowDuplicate: true });
        }}
      />
    </>
  );
}
