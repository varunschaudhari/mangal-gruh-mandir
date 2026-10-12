import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Eye, EyeOff, Maximize2, Minimize2, Users, X } from 'lucide-react';
import { getHallBoard } from '../../api/booking.api.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { LanguageSwitch, useLanguage, useT } from '../../i18n/index.jsx';
import { fmtDay } from '../../components/booking/counter/counterUtils.js';
import { minutesUntil, pickShown, savedHall, saveHall } from '../../components/booking/checkin/checkInUtils.js';
import { useHallEvents } from '../../utils/hallLive.js';
import { hallHeading, hallTitle } from '../../utils/halls.js';

// The hall screen: a TV or tablet at the hall shows one batch — the one running now — split
// into who has not come yet (big tiles, left) and who has come (green, right). At the batch's
// end time it moves on to the next batch; between batches it shows the next one, and after the
// day's last batch that batch stays up. Each scan at the entrance arrives live: a card shows
// who was just let in (or, in amber, why not — other hall, other day, batch over) and their
// tile moves across. Refreshes itself, keeps the screen on. Names only, never phone numbers.

const SPOTLIGHT_MS = 8000;

// Text size: the whole screen scales together (numbers, names, times, clock). Automatic by
// screen width — a TV is read from across the hall — or chosen with A− / A+ (remembered on this
// device) or fixed in the link (?size=150).
const SIZES = [1, 1.15, 1.3, 1.5, 1.75, 2];
const SIZE_KEY = 'mgm-hall-size';
const autoSize = () => (window.innerWidth >= 1800 ? 1.3 : window.innerWidth >= 1280 ? 1.15 : 1);
const chosenSize = (param) => {
  const fromLink = Number(param) / 100;
  if (SIZES.includes(fromLink)) return fromLink;
  try { const saved = Number(localStorage.getItem(SIZE_KEY)); return SIZES.includes(saved) ? saved : null; } catch { return null; }
};
const timeText = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const startOf = (label) => String(label || '').split(/\s*[–-]\s*/)[0];
const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);
const nowMinutes = (d) => d.getHours() * 60 + d.getMinutes();

// Tile sizes: fewer devotees, bigger tiles. "Not came yet" gets the big ones — that is what the
// hall volunteer watches; "Came" is smaller.
const TILE = {
  xl: { grid: 'grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]', num: 'text-5xl sm:text-7xl', name: 'text-base sm:text-xl', pad: 'py-4' },
  lg: { grid: 'grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]', num: 'text-5xl', name: 'text-base', pad: 'py-3' },
  md: { grid: 'grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))]', num: 'text-4xl', name: 'text-sm', pad: 'py-3' },
  sm: { grid: 'grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))]', num: 'text-3xl', name: 'text-xs', pad: 'py-2.5' },
  xs: { grid: 'grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))]', num: 'text-2xl', name: 'hidden', pad: 'py-2' },
};
const waitingSize = (n) => (n <= 8 ? 'xl' : n <= 20 ? 'lg' : n <= 48 ? 'md' : 'sm');
const cameSize = (n) => (n <= 12 ? 'md' : n <= 36 ? 'sm' : 'xs');

// Wide letter-spacing suits English capitals but breaks up Devanagari.
const spacing = (lang) => (lang === 'mr' ? 'tracking-normal' : 'tracking-[0.2em]');
const sevaText = (g, lang) => (lang === 'mr' && g.sevaNamesMr?.length ? g.sevaNamesMr : g.sevaNames).join(', ');

const clockText = (d) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

// "starts in 12 min" when it is close, else "starts at 11:00 PM".
const startsText = (t, label, wait) => (wait <= 0 ? t('starting now')
  : wait <= 90 ? t('starts in {n} min', { n: wait }) : t('starts at {time}', { time: startOf(label) }));
// "ends in 25 min" for the batch running now.
const endsText = (t, left) => (left <= 0 ? t('ending now') : t('ends in {n} min', { n: left }));

function Tiles({ list, size, names, came, flash }) {
  const s = TILE[size];
  return (
    <ul className={`grid gap-2.5 ${s.grid}`}>
      {list.map((b, i) => (
        <li key={b._id || `${b.serialNo ?? 'x'}-${i}`}
          className={`relative rounded-2xl px-2 text-center transition-all ${s.pad} ${came ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-100 ring-1 ring-slate-600'} ${flash?.has(String(b._id)) ? 'z-10 scale-110 animate-pulse ring-4 ring-amber-300' : ''}`}>
          {came && size !== 'xs' && <Check className="absolute right-1.5 top-1.5 h-4 w-4" aria-hidden="true" />}
          <p className={`font-black leading-none tabular-nums ${s.num}`}>{b.serialNo ?? '—'}</p>
          {names && <p className={`mt-1.5 line-clamp-2 break-words font-medium leading-tight ${s.name} ${came ? 'text-green-50' : 'text-slate-300'}`}>{b.name}</p>}
          {b.people > 1 && size !== 'xs' && (
            <p className={`mt-1 inline-flex items-center gap-0.5 text-xs ${came ? 'text-green-100' : 'text-slate-400'}`}>
              <Users className="h-3 w-3" aria-hidden="true" />{b.people}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function Column({ title, count, tone, children }) {
  const { lang } = useLanguage();
  return (
    <section className="min-w-0 rounded-3xl bg-slate-900/80 p-4 ring-1 ring-slate-800 sm:p-5">
      <p className={`mb-3 flex items-baseline justify-between gap-3 text-sm font-bold uppercase ${spacing(lang)} ${tone}`}>
        <span>{title}</span>
        <span className="text-3xl tracking-normal tabular-nums">{count}</span>
      </p>
      {children}
    </section>
  );
}

// One batch: time, sevas, how many have come — then who has not come yet and who has.
function BatchView({ group, kind, names, now, showHall, hallLabel, flash }) {
  const t = useT();
  const { lang } = useLanguage();
  const total = group.bookings.length;
  const waiting = group.bookings.filter((b) => !b.arrived);
  const came = group.bookings.filter((b) => b.arrived);
  const when = kind === 'next' ? startsText(t, group.label, minutesUntil(group.label, now) ?? 0)
    : kind === 'now' && group.end != null ? endsText(t, group.end - nowMinutes(now)) : '';
  const look = {
    now: { tag: t('Now'), tone: 'text-amber-400', when: 'text-amber-300' },
    next: { tag: t('Next'), tone: 'text-sky-400', when: 'text-sky-300' },
    over: { tag: t('Over'), tone: 'text-slate-400', when: '' },
    today: { tag: t('Today'), tone: 'text-slate-300', when: '' },
  }[kind];
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className={`text-sm font-bold uppercase ${spacing(lang)} ${look.tone}`}>
            {look.tag}{showHall && group.hall ? ` · ${hallLabel || group.hall}` : ''}
          </p>
          <p className="mt-1 text-4xl font-black text-white sm:text-5xl">{group.label || sevaText(group, lang)}</p>
          <p className="mt-1 text-xl text-slate-300">
            {group.label ? sevaText(group, lang) : ''}
            {when && <span className={`font-semibold ${look.when}`}>{group.label ? ' · ' : ''}{when}</span>}
          </p>
        </div>
        {total > 0 && (
          <div className="text-right">
            <p className="text-5xl font-black tabular-nums text-white sm:text-6xl">
              {came.length}<span className="text-3xl text-slate-500 sm:text-4xl">/{total}</span>
            </p>
            <p className="text-base text-slate-400">
              {t('came')}
              {group.people !== total && <> · {t('{n} of {total} people', { n: group.arrivedPeople, total: group.people })}</>}
            </p>
          </div>
        )}
      </div>
      {total > 0 && (
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-800" role="presentation">
          <div className="h-full rounded-full bg-green-500 transition-[width] duration-700" style={{ width: `${pct(came.length, total)}%` }} />
        </div>
      )}

      {total === 0 ? (
        <p className="rounded-3xl bg-slate-900/80 px-4 py-10 text-center text-2xl text-slate-400 ring-1 ring-slate-800">{t('No bookings yet — bookings made at the counter appear here')}</p>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Column title={kind === 'over' ? t('Did not come') : t('Not came yet')} count={waiting.length} tone="text-amber-400">
            {waiting.length
              ? <Tiles list={waiting} size={waitingSize(waiting.length)} names={names} />
              : <p className="rounded-2xl bg-green-950/60 px-4 py-8 text-center text-2xl font-bold text-green-400">{t('Everyone has come')}</p>}
          </Column>
          <Column title={t('Came')} count={came.length} tone="text-green-400">
            {came.length
              ? <Tiles list={came} size={cameSize(came.length)} names={names} came flash={flash} />
              : <p className="px-2 py-6 text-center text-xl text-slate-500">{t('No one has come yet')}</p>}
          </Column>
        </div>
      )}
    </div>
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

export default function HallScreen() {
  const t = useT();
  const { lang } = useLanguage();
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();
  const hall = params.has('hall') ? params.get('hall') : savedHall();
  const names = params.get('names') !== '0';
  const [now, setNow] = useState(() => new Date());
  const [chosen, setChosen] = useState(() => chosenSize(params.get('size')));   // null = automatic
  const [auto, setAuto] = useState(autoSize);
  const scale = chosen ?? auto;
  useEffect(() => {
    const onResize = () => setAuto(autoSize());
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
    setChosen(next);
    try { localStorage.setItem(SIZE_KEY, String(next)); } catch { /* private window */ }
  };
  const [full, setFull] = useState(Boolean(document.fullscreenElement));
  const allowed = can('bookings:checkin');

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
  const { shown, kind } = pickShown(data?.groups || [], now);
  const showHall = !hall;
  const titleOf = (h) => hallTitle(h, data?.hallNames, lang);        // "Shri Mangal Sabhagruh (H1)" or "H1"
  const headingOf = (h) => hallHeading(t, h, data?.hallNames, lang);  // … or "Hall H1"

  return (
    <div className="min-h-[100dvh] bg-slate-950 px-4 pb-24 pt-[calc(1rem+var(--safe-top,0px))] text-white sm:px-8">
      {/* Header: temple, hall, date and a big clock */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-amber-300">{data?.templeName || t('Mangal Grah Mandir')}</p>
          <p className="text-3xl font-black sm:text-4xl">{hall ? headingOf(hall) : t('All halls')}</p>
        </div>
        <div className="text-right">
          <p className="text-4xl font-black tabular-nums sm:text-6xl">{clockText(now)}</p>
          <p className="text-base text-slate-400">
            <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${live === 'live' ? 'bg-green-500' : live === 'connecting' ? 'bg-amber-400' : 'bg-slate-600'}`}
              title={live === 'live' ? t('Live') : t('Updating every few seconds')} aria-hidden="true" />
            {data?.date ? fmtDay(data.date, lang, { weekday: 'long', day: 'numeric', month: 'long' }) : ''}
          </p>
        </div>
      </header>

      <Spotlight event={spot?.event} lang={lang} hallNames={data?.hallNames} />

      {/* Controls: quiet until touched */}
      <div className="fixed bottom-[calc(0.75rem+var(--safe-bottom,0px))] right-3 z-10 flex max-w-[calc(100vw-1.5rem)] items-center gap-1 overflow-x-auto rounded-full bg-slate-900/90 p-1 opacity-40 ring-1 ring-slate-700 transition-opacity hover:opacity-100 focus-within:opacity-100">
        {(data?.halls || []).length > 1 && (
          <select value={hall} onChange={(e) => chooseHall(e.target.value)} aria-label={t('Hall')}
            className="h-10 rounded-full border-0 bg-slate-800 px-3 text-sm text-white focus:ring-2 focus:ring-amber-400">
            <option value="">{t('All halls')}</option>
            {data.halls.map((h) => <option key={h} value={h}>{titleOf(h)}</option>)}
          </select>
        )}
        <button type="button" onClick={() => stepSize(-1)} disabled={scale <= SIZES[0]} title={t('Smaller text')} aria-label={t('Smaller text')}
          className="flex h-10 min-w-10 items-center justify-center rounded-full px-2 text-sm font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-30">A−</button>
        <span className="min-w-[3ch] text-center text-xs tabular-nums text-slate-400">{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => stepSize(1)} disabled={scale >= SIZES[SIZES.length - 1]} title={t('Larger text')} aria-label={t('Larger text')}
          className="flex h-10 min-w-10 items-center justify-center rounded-full px-2 text-lg font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-30">A+</button>
        <button type="button" onClick={() => setParam('names', names ? '0' : null)} title={names ? t('Hide names') : t('Show names')} aria-label={names ? t('Hide names') : t('Show names')}
          className="flex h-10 w-10 items-center justify-center rounded-full text-slate-200 hover:bg-slate-800">
          {names ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
        {document.documentElement.requestFullscreen && (
          <button type="button" onClick={toggleFull} title={full ? t('Exit fullscreen') : t('Fullscreen')} aria-label={full ? t('Exit fullscreen') : t('Fullscreen')}
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-200 hover:bg-slate-800">
            {full ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>
        )}
        <LanguageSwitch className="border-slate-700 bg-slate-800 [&_button[aria-checked='false']]:text-slate-300" />
        <Link to="/bookings/check-in" title={t('Close')} aria-label={t('Close')} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-200 hover:bg-slate-800">
          <X className="h-5 w-5" />
        </Link>
      </div>

      {!allowed ? (
        <p className="mt-16 text-center text-2xl text-slate-300">{t('You do not have access to the hall screen.')}</p>
      ) : q.isLoading ? (
        <p className="mt-16 text-center text-2xl text-slate-400">{t('Loading…')}</p>
      ) : q.isError && !data ? (
        <p className="mt-16 text-center text-2xl text-red-300">{t('Could not load the hall screen — retrying…')}</p>
      ) : shown.length ? (
        <div className="space-y-10">
          {shown.map((g) => (
            <BatchView key={g.key} group={g} kind={kind} names={names} now={now} showHall={showHall} hallLabel={headingOf(g.hall)} flash={flash} />
          ))}
        </div>
      ) : (
        <div className="mt-16 text-center">
          <p className="text-4xl font-black text-slate-200">{data?.closed ? t('Closed for bookings today') : t('No bookings for today')}</p>
          {data?.closed?.reason && <p className="mt-3 text-2xl text-slate-400">{data.closed.reason}</p>}
        </div>
      )}
    </div>
  );
}
