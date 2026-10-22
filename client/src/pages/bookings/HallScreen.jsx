import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Eye, EyeOff, Maximize2, Minimize2, X } from 'lucide-react';
import { getHallBoard } from '../../api/booking.api.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { LanguageProvider, LanguageSwitch, useLanguage, useT } from '../../i18n/index.jsx';
import { fmtDay } from '../../components/booking/counter/counterUtils.js';
import { fitGrid, minutesUntil, pickPerHall, pickShown, savedHall, saveHall } from '../../components/booking/checkin/checkInUtils.js';
import { useHallEvents } from '../../utils/hallLive.js';
import { hallHeading, hallTitle } from '../../utils/halls.js';

// The hall screen: a TV at the hall shows one batch — the one running now — as a numbered
// board: every serial in order, always in the same place, grey until that devotee is scanned
// at the entrance and green after. Beside it, the serials that have not come yet. The whole
// batch fits on the screen (up to ~150 serials, no scrolling); names show under the numbers
// when the tiles are big enough to read them. At the batch's end time it moves on to the next
// batch; between batches it shows the next one, and after the day's last batch that batch
// stays up. Each scan arrives live: a card shows who was just let in (or, in amber, why not)
// and their tile pulses. Refreshes itself, keeps the screen on. Names only, never phone numbers.
// With no hall chosen, each hall gets a card side by side with its own batch.

const SPOTLIGHT_MS = 8000;
const CONTROLS_MS = 4000;    // the control bar hides this long after the last touch / mouse move
const GAP = 8;               // px between tiles
const NAMES_FROM = 100;      // px: tiles at least this big show the name under the number

// Text size: the whole screen scales together (numbers, names, times, clock). Automatic by
// screen width — a TV is read from across the hall — or chosen with A− / A+ (remembered on this
// device) or fixed in the link (?size=150). Never bigger than the screen has room for — past
// that the headings would leave no space for the numbered board.
const SIZES = [1, 1.15, 1.3, 1.5, 1.75, 2];
const SIZE_KEY = 'mgm-hall-size';
const autoSize = () => (window.innerWidth >= 1800 ? 1.3 : window.innerWidth >= 1280 ? 1.15 : 1);
const roomFor = () => {
  const room = Math.min(window.innerHeight / 600, window.innerWidth / 1000);
  return SIZES.filter((v) => v <= room).pop() ?? SIZES[0];
};
const chosenSize = (param) => {
  const fromLink = Number(param) / 100;
  if (SIZES.includes(fromLink)) return fromLink;
  try { const saved = Number(localStorage.getItem(SIZE_KEY)); return SIZES.includes(saved) ? saved : null; } catch { return null; }
};
const timeText = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const startOf = (label) => String(label || '').split(/\s*[–-]\s*/)[0];
const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);
const nowMinutes = (d) => d.getHours() * 60 + d.getMinutes();

// Wide letter-spacing suits English capitals but breaks up Devanagari.
const spacing = (lang) => (lang === 'mr' ? 'tracking-normal' : 'tracking-[0.2em]');
const sevaText = (g, lang) => (lang === 'mr' && g.sevaNamesMr?.length ? g.sevaNamesMr : g.sevaNames).join(', ');

const clockText = (d) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

// "starts in 12 min" when it is close, else "starts at 11:00 PM".
const startsText = (t, label, wait) => (wait <= 0 ? t('starting now')
  : wait <= 90 ? t('starts in {n} min', { n: wait }) : t('starts at {time}', { time: startOf(label) }));
// "ends in 25 min" for the batch running now.
const endsText = (t, left) => (left <= 0 ? t('ending now') : t('ends in {n} min', { n: left }));

// The size of an element, kept up to date (the board fills whatever space the screen has).
function useBoxSize() {
  const ref = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox((b) => (Math.abs(b.w - width) < 1 && Math.abs(b.h - height) < 1 ? b : { w: Math.floor(width), h: Math.floor(height) }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box];
}

/**
 * Serial tiles sized to fill their box on a TV: grey = not come yet, green = came. On a phone
 * or small window they keep a fixed size and the page scrolls instead.
 */
function SerialTiles({ list, names, flash, max, wide }) {
  const [ref, box] = useBoxSize();
  const fit = wide ? fitGrid(list.length, box.w, box.h, GAP, max) : null;
  const withNames = names && (fit ? fit.h >= NAMES_FROM : list.length <= 30);
  const numSize = fit ? Math.min(fit.h * (withNames ? 0.38 : 0.52), fit.w * 0.42) : undefined;
  const nameSize = fit ? Math.max(12, Math.min(22, fit.h * 0.12)) : undefined;
  return (
    <div ref={ref} className={wide ? 'min-h-0 flex-1 overflow-hidden' : ''}>
      <ul
        className={fit ? 'grid content-start' : 'grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-1.5'}
        style={fit ? { gridTemplateColumns: `repeat(${fit.cols}, ${fit.w}px)`, gridAutoRows: `${fit.h}px`, gap: GAP } : undefined}
      >
        {list.map((b, i) => (
          <li key={b._id || `${b.serialNo ?? 'x'}-${i}`}
            className={`relative flex flex-col items-center justify-center overflow-hidden rounded-xl px-1 text-center transition-colors duration-500
              ${fit ? '' : 'min-h-[3.25rem]'}
              ${b.arrived ? 'bg-green-600 text-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.15)]' : 'bg-slate-800 text-slate-100 ring-1 ring-inset ring-slate-700'}
              ${flash?.has(String(b._id)) ? 'z-10 animate-pulse ring-4 ring-amber-300' : ''}`}>
            <span className={`font-black leading-none tabular-nums ${fit ? '' : 'text-xl'}`} style={fit ? { fontSize: numSize } : undefined}>{b.serialNo ?? '—'}</span>
            {withNames && (
              <span className={`mt-1 line-clamp-2 w-full break-words font-medium leading-tight ${b.arrived ? 'text-green-50' : 'text-slate-300'} ${fit ? '' : 'text-xs'}`}
                style={fit ? { fontSize: nameSize } : undefined}>{b.name}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// "Now" / "Next" / "Over" and its colours; "ends in 25 min" / "starts in 12 min".
function batchLook(t, kind, group, now) {
  const when = kind === 'next' ? startsText(t, group.label, minutesUntil(group.label, now) ?? 0)
    : kind === 'now' && group.end != null ? endsText(t, group.end - nowMinutes(now)) : '';
  const look = {
    now: { tag: t('Now'), tone: 'text-amber-400', whenTone: 'text-amber-300' },
    next: { tag: t('Next'), tone: 'text-sky-400', whenTone: 'text-sky-300' },
    over: { tag: t('Over'), tone: 'text-slate-400', whenTone: '' },
    today: { tag: t('Today'), tone: 'text-slate-300', whenTone: '' },
  }[kind] || { tag: '', tone: 'text-slate-300', whenTone: '' };
  return { ...look, when };
}

// One batch: time, sevas and how many have come; the numbered board; who has not come yet.
function BatchBoard({ group, kind, names, now, showHall, hallLabel, flash, wide }) {
  const t = useT();
  const { lang } = useLanguage();
  const total = group.bookings.length;
  const waiting = group.bookings.filter((b) => !b.arrived);
  const came = total - waiting.length;
  const look = batchLook(t, kind, group, now);
  const { when } = look;
  return (
    <section className={`flex min-w-0 flex-col gap-4 ${wide ? 'min-h-0 flex-1 overflow-hidden' : ''}`}>
      {/* The batch, and how many of it have come */}
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="min-w-0">
          <p className={`text-sm font-bold uppercase ${spacing(lang)} ${look.tone}`}>
            {look.tag}{showHall && group.hall ? ` · ${hallLabel || group.hall}` : ''}
          </p>
          <p className="mt-0.5 text-4xl font-black leading-tight text-white xl:text-5xl">{group.label || sevaText(group, lang)}</p>
          <p className="mt-0.5 line-clamp-2 text-lg text-slate-300 xl:text-xl">
            {group.label ? sevaText(group, lang) : ''}
            {when && <span className={`font-semibold ${look.whenTone}`}>{group.label ? ' · ' : ''}{when}</span>}
          </p>
        </div>
        {total > 0 && (
          <div className="flex min-w-[min(100%,26rem)] flex-1 items-center gap-5 sm:max-w-xl">
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm text-slate-400">
                <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-green-600" aria-hidden="true" />{t('Came')}</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-slate-700" aria-hidden="true" />{t('Not came yet')}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-800" role="presentation">
                <div className="h-full rounded-full bg-green-500 transition-[width] duration-700" style={{ width: `${pct(came, total)}%` }} />
              </div>
              {group.people !== total && (
                <p className="mt-1.5 text-sm text-slate-400">{t('{n} of {total} people', { n: group.arrivedPeople, total: group.people })}</p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-5xl font-black leading-none tabular-nums text-white xl:text-6xl">
                {came}<span className="text-3xl text-slate-500 xl:text-4xl">/{total}</span>
              </p>
              <p className="mt-1 text-sm font-semibold uppercase text-green-400">{t('came')}</p>
            </div>
          </div>
        )}
      </div>

      {total === 0 ? (
        <p className="rounded-3xl bg-slate-900/80 px-4 py-10 text-center text-2xl text-slate-400 ring-1 ring-slate-800">{t('No bookings yet — bookings made at the counter appear here')}</p>
      ) : (
        <div className={`grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] ${wide ? 'min-h-0 flex-1 lg:grid-rows-[minmax(0,1fr)]' : ''}`}>
          {/* Every serial in order: grey until scanned, then green */}
          <div className={`flex min-w-0 flex-col rounded-3xl bg-slate-900/70 p-3 ring-1 ring-slate-800 sm:p-4 ${wide ? 'min-h-0' : ''}`}>
            <SerialTiles list={group.bookings} names={names} flash={flash} max={190} wide={wide} />
          </div>

          {/* Who is still missing (first on a phone, where the page scrolls) */}
          <aside className={`order-first flex min-w-0 flex-col rounded-3xl lg:order-none bg-slate-900/70 p-3 ring-1 ring-slate-800 sm:p-4 ${wide ? 'min-h-0' : ''}`}>
            <p className={`mb-3 flex shrink-0 items-baseline justify-between gap-3 text-sm font-bold uppercase ${spacing(lang)} text-amber-400`}>
              <span>{kind === 'over' ? t('Did not come') : t('Not came yet')}</span>
              <span className="text-4xl tracking-normal tabular-nums">{waiting.length}</span>
            </p>
            {waiting.length
              ? <SerialTiles list={waiting} names={names} max={120} wide={wide} />
              : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl bg-green-950/50 px-4 py-8 text-center">
                  <Check className="h-12 w-12 text-green-400" aria-hidden="true" />
                  <p className="text-2xl font-bold text-green-400">{t('Everyone has come')}</p>
                </div>
              )}
          </aside>
        </div>
      )}
    </section>
  );
}

// The all-halls screen: one hall's batch as a card beside the others — the hall, the batch,
// how many have come and the numbered board (grey tiles are the ones still to come).
function HallCard({ group, kind, names, now, hallLabel, flash, wide }) {
  const t = useT();
  const { lang } = useLanguage();
  const total = group.bookings.length;
  const came = group.bookings.filter((b) => b.arrived).length;
  const look = batchLook(t, kind, group, now);
  return (
    <section className={`flex min-w-0 flex-col gap-3 overflow-hidden rounded-3xl bg-slate-900/70 p-4 ring-1 ring-slate-800 ${wide ? 'min-h-0' : ''}`}>
      <div className="min-w-0 shrink-0">
        <p className={`truncate text-sm font-bold uppercase ${spacing(lang)} ${look.tone}`}>
          {look.tag}{group.hall ? ` · ${hallLabel || group.hall}` : ''}
        </p>
        <p className="line-clamp-2 text-2xl font-black leading-tight text-white xl:text-3xl">{group.label || sevaText(group, lang)}</p>
        <p className="truncate text-base text-slate-300">
          {group.label ? sevaText(group, lang) : ''}
          {look.when && <span className={`font-semibold ${look.whenTone}`}>{group.label ? ' · ' : ''}{look.when}</span>}
        </p>
      </div>
      {total === 0 ? (
        <p className="flex flex-1 items-center justify-center rounded-2xl bg-slate-950/40 px-4 py-8 text-center text-lg text-slate-400">
          {t('No bookings yet — bookings made at the counter appear here')}
        </p>
      ) : (
        <>
          <div className="shrink-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="whitespace-nowrap text-4xl font-black leading-none tabular-nums text-white">
                {came}<span className="text-2xl text-slate-500">/{total}</span>
                <span className="ml-2 text-sm font-semibold uppercase text-green-400">{t('came')}</span>
              </p>
              {came < total && (
                <p className="whitespace-nowrap text-sm font-semibold text-amber-400">
                  <span className="text-2xl font-black tabular-nums">{total - came}</span> {kind === 'over' ? t('Did not come') : t('Not came yet')}
                </p>
              )}
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-800" role="presentation">
              <div className="h-full rounded-full bg-green-500 transition-[width] duration-700" style={{ width: `${pct(came, total)}%` }} />
            </div>
          </div>
          <SerialTiles list={group.bookings} names={names} flash={flash} max={140} wide={wide} />
        </>
      )}
    </section>
  );
}

// Who was just scanned at the entrance: green when let in, amber with the reason when not.
function Spotlight({ event, lang, hallNames }) {
  const t = useT();
  if (!event) return null;
  const b = event.booking;
  const seva = (lang === 'mr' && b.sevaNameMr) || b.sevaName;
  const letIn = event.checkedIn;
  const reason = {
    'other-hall': t('{hall} — please go there', { hall: hallHeading(t, b.hall, hallNames, lang) }),
    'batch-over': t('Batch {label} is over — please see the counter', { label: b.batchLabel }),
    early: t('Booked for {date}', { date: b.dateKey ? fmtDay(b.dateKey, lang, { weekday: 'long', day: 'numeric', month: 'long' }) : '' }),
    past: t('Was booked for {date}', { date: b.dateKey ? fmtDay(b.dateKey, lang, { day: 'numeric', month: 'long' }) : '' }),
    already: t('Already checked in at {time}', { time: b.checkedInAt ? timeText(b.checkedInAt) : '' }),
    voided: t('This booking was cancelled'),
    'no-visit': t('Postal seva — no visit to the hall'),
  }[event.result];
  return (
    <div role="status" aria-live="assertive"
      className={`fixed inset-x-4 top-4 z-20 mx-auto flex max-w-4xl items-center gap-5 rounded-3xl px-6 py-5 shadow-2xl sm:inset-x-8 ${letIn ? 'bg-green-600 text-white' : 'bg-amber-400 text-slate-950'}`}>
      <div className="shrink-0 text-center">
        <p className="text-sm font-bold uppercase">{t('Serial')}</p>
        <p className="text-6xl font-black leading-none tabular-nums">{b.serialNo ?? '—'}</p>
      </div>
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-bold uppercase">
          {letIn ? <Check className="h-5 w-5" aria-hidden="true" /> : <AlertTriangle className="h-5 w-5" aria-hidden="true" />}
          {letIn ? t('Just arrived') : t('Not for now')}
        </p>
        <p className="truncate text-3xl font-black sm:text-4xl">{b.name}</p>
        <p className="mt-1 text-lg font-medium">
          {letIn
            ? [b.people > 1 ? t('{n} people', { n: b.people }) : null, seva, b.batchLabel, b.hall ? hallHeading(t, b.hall, hallNames, lang) : null].filter(Boolean).join(' · ')
            : reason || seva}
        </p>
      </div>
    </div>
  );
}

function HallScreenBoard() {
  const t = useT();
  const { lang } = useLanguage();
  const { can } = usePermissions();
  const wide = useMediaQuery('(min-width: 1024px)');   // TV / laptop: the batch fits the screen
  const [params, setParams] = useSearchParams();
  const hall = params.has('hall') ? params.get('hall') : savedHall();
  const names = params.get('names') !== '0';
  const [now, setNow] = useState(() => new Date());
  const [chosen, setChosen] = useState(() => chosenSize(params.get('size')));   // null = automatic
  const [auto, setAuto] = useState(autoSize);
  const [room, setRoom] = useState(roomFor);
  const scale = Math.min(chosen ?? auto, room);
  useEffect(() => {
    const onResize = () => { setAuto(autoSize()); setRoom(roomFor()); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // rem-based sizes all follow the page's root font size; put it back when leaving the screen
  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.fontSize;
    html.style.fontSize = `${scale * 100}%`;
    return () => { html.style.fontSize = before; };
  }, [scale]);
  const stepSize = (dir) => {
    const at = SIZES.reduce((best, v, i) => (Math.abs(v - scale) < Math.abs(SIZES[best] - scale) ? i : best), 0);
    const next = SIZES[Math.min(SIZES.length - 1, Math.max(0, at + dir))];
    if (next > room) return;
    setChosen(next);
    try { localStorage.setItem(SIZE_KEY, String(next)); } catch { /* private window */ }
  };
  const [full, setFull] = useState(Boolean(document.fullscreenElement));
  const allowed = can('bookings:checkin');

  // The control bar stays out of the way: shown for a few seconds at the start and whenever the
  // screen is touched, the mouse moves or a key is pressed; hidden again after a short while.
  const [controls, setControls] = useState(true);
  useEffect(() => {
    let timer = setTimeout(() => setControls(false), CONTROLS_MS + 2000);
    const show = () => {
      setControls(true);
      clearTimeout(timer);
      timer = setTimeout(() => setControls(false), CONTROLS_MS);
    };
    const events = ['pointermove', 'pointerdown', 'keydown'];
    events.forEach((e) => window.addEventListener(e, show));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, show));
    };
  }, []);

  const [spot, setSpot] = useState(null);              // { event, until }
  const [flash, setFlash] = useState(() => new Map());  // booking id → until

  const qc = useQueryClient();
  const onEvent = useCallback((e) => {
    qc.invalidateQueries({ queryKey: ['booking-hall-board'] });
    if (e.type !== 'scan' || !e.booking) return;
    const forHere = !hall || e.booking.hall === hall || e.entrance === hall || !e.booking.hall;
    if (!forHere) return;
    const until = Date.now() + SPOTLIGHT_MS;
    setSpot({ event: e, until });
    if (e.checkedIn) setFlash((m) => new Map(m).set(String(e.booking._id), until));
  }, [hall, qc]);
  const live = useHallEvents(onEvent, { enabled: allowed });

  const q = useQuery({
    queryKey: ['booking-hall-board', hall],
    queryFn: () => getHallBoard({ hall: hall || undefined }).then((r) => r.data.data),
    // Live scans refresh it straight away; the timer is the fallback (quicker without the live link)
    refetchInterval: live === 'live' ? 15_000 : 5_000,
    refetchIntervalInBackground: true,
    enabled: allowed,
  });

  // The spotlight and the pulsing tiles fade after a few seconds
  useEffect(() => {
    if (spot && now.getTime() > spot.until) setSpot(null);
    if ([...flash.values()].some((u) => u < now.getTime())) {
      setFlash((m) => new Map([...m].filter(([, u]) => u >= Date.now())));
    }
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps

  // The clock and the batch shown follow the device clock between refreshes.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let lock = null;
    const acquire = async () => { try { if ('wakeLock' in navigator) lock = await navigator.wakeLock.request('screen'); } catch { /* not allowed */ } };
    acquire();
    const onVisible = () => { if (!document.hidden) acquire(); };
    const onFull = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('visibilitychange', onVisible);
    document.addEventListener('fullscreenchange', onFull);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('fullscreenchange', onFull);
      lock?.release().catch(() => {});
    };
  }, []);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key); else next.set(key, value);
    setParams(next, { replace: true });
  };
  const chooseHall = (h) => { saveHall(h); setParam('hall', h); };
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const data = q.data;
  // One hall: its batch. All halls: a card per hall, each with that hall's own batch.
  const groups = data?.groups || [];
  const one = pickShown(groups, now);
  const cards = hall ? one.shown.map((group) => ({ group, kind: one.kind })) : pickPerHall(groups, now);
  const showHall = !hall;
  const cols = cards.length <= 3 ? cards.length : Math.ceil(cards.length / 2);
  const titleOf = (h) => hallTitle(h, data?.hallNames, lang);        // "Shri Mangal Sabhagruh (H1)" or "H1"
  const headingOf = (h) => hallHeading(t, h, data?.hallNames, lang);  // … or "Hall H1"

  return (
    <div className={`flex flex-col bg-slate-950 px-4 pb-4 pt-[calc(0.75rem+var(--safe-top,0px))] text-white sm:px-8 ${wide ? 'h-[100dvh] overflow-hidden' : 'min-h-[100dvh]'}`}>
      {/* Header: temple and hall on the left, the clock on the right — one row, long names cut */}
      <header className="mb-4 flex shrink-0 items-center justify-between gap-6">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-amber-300">{data?.templeName || t('Mangal Grah Mandir')}</p>
          <p className="truncate text-3xl font-black leading-tight">{hall ? headingOf(hall) : t('All halls')}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-4xl font-black leading-none tabular-nums sm:text-5xl">{clockText(now)}</p>
          <p className="mt-1 whitespace-nowrap text-sm text-slate-400">
            <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${live === 'live' ? 'bg-green-500' : live === 'connecting' ? 'bg-amber-400' : 'bg-slate-600'}`}
              title={live === 'live' ? t('Live') : t('Updating every few seconds')} aria-hidden="true" />
            {data?.date ? fmtDay(data.date, lang, { weekday: 'long', day: 'numeric', month: 'long' }) : ''}
          </p>
        </div>
      </header>

      {/* Controls: a bar at the bottom, shown while someone is using the screen */}
      <div className={`fixed inset-x-0 bottom-[calc(1rem+var(--safe-bottom,0px))] z-30 flex justify-center px-4 transition-opacity duration-300 focus-within:pointer-events-auto focus-within:opacity-100
        ${controls ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-slate-900/95 p-1 shadow-2xl ring-1 ring-slate-700">
          {(data?.halls || []).length > 1 && (
            <select value={hall} onChange={(e) => chooseHall(e.target.value)} aria-label={t('Hall')}
              className="h-9 max-w-[14rem] truncate rounded-full border-0 bg-slate-800 px-3 text-sm text-white focus:ring-2 focus:ring-amber-400">
              <option value="">{t('All halls')}</option>
              {data.halls.map((h) => <option key={h} value={h}>{titleOf(h)}</option>)}
            </select>
          )}
          <button type="button" onClick={() => stepSize(-1)} disabled={scale <= SIZES[0]} title={t('Smaller text')} aria-label={t('Smaller text')}
            className="flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-sm font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-30">A−</button>
          <span className="min-w-[3ch] text-center text-xs tabular-nums text-slate-400">{Math.round(scale * 100)}%</span>
          <button type="button" onClick={() => stepSize(1)} disabled={scale >= room} title={t('Larger text')} aria-label={t('Larger text')}
            className="flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-lg font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-30">A+</button>
          <button type="button" onClick={() => setParam('names', names ? '0' : null)} title={names ? t('Hide names') : t('Show names')} aria-label={names ? t('Hide names') : t('Show names')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-200 hover:bg-slate-800">
            {names ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
          {document.documentElement.requestFullscreen && (
            <button type="button" onClick={toggleFull} title={full ? t('Exit fullscreen') : t('Fullscreen')} aria-label={full ? t('Exit fullscreen') : t('Fullscreen')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-200 hover:bg-slate-800">
              {full ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </button>
          )}
          <LanguageSwitch className="shrink-0 border-slate-700 bg-slate-800 [&_button[aria-checked='false']]:text-slate-300" />
          <Link to="/bookings/check-in" title={t('Close')} aria-label={t('Close')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-200 hover:bg-slate-800">
            <X className="h-5 w-5" />
          </Link>
        </div>
      </div>

      <Spotlight event={spot?.event} lang={lang} hallNames={data?.hallNames} />

      {!allowed ? (
        <p className="mt-16 text-center text-2xl text-slate-300">{t('You do not have access to the hall screen.')}</p>
      ) : q.isLoading ? (
        <p className="mt-16 text-center text-2xl text-slate-400">{t('Loading…')}</p>
      ) : q.isError && !data ? (
        <p className="mt-16 text-center text-2xl text-red-300">{t('Could not load the hall screen — retrying…')}</p>
      ) : cards.length === 1 ? (
        <main className={`flex flex-col ${wide ? 'min-h-0 flex-1' : ''}`}>
          <BatchBoard group={cards[0].group} kind={cards[0].kind} names={names} now={now} showHall={showHall}
            hallLabel={headingOf(cards[0].group.hall)} flash={flash} wide={wide} />
        </main>
      ) : cards.length ? (
        // Several halls (or several sevas without fixed times): side by side, each fits its card
        <main className={`grid gap-4 ${wide ? 'min-h-0 flex-1' : ''}`}
          style={wide ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: 'minmax(0, 1fr)' } : undefined}>
          {cards.map(({ group, kind }) => (
            <HallCard key={group.key} group={group} kind={kind} names={names} now={now} hallLabel={headingOf(group.hall)} flash={flash} wide={wide} />
          ))}
        </main>
      ) : (
        <div className="mt-16 text-center">
          <p className="text-4xl font-black text-slate-200">{data?.closed ? t('Closed for bookings today') : t('No bookings for today')}</p>
          {data?.closed?.reason && <p className="mt-3 text-2xl text-slate-400">{data.closed.reason}</p>}
        </div>
      )}
    </div>
  );
}

// The hall TV keeps its own language: switching it there leaves the app's language alone,
// also when the TV runs in the same browser as the app
export default function HallScreen() {
  return <LanguageProvider storageKey="mgm-lang-hall-screen"><HallScreenBoard /></LanguageProvider>;
}
