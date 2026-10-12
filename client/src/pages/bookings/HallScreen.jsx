import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Eye, EyeOff, Maximize2, Minimize2, Users, X } from 'lucide-react';
import { getHallBoard } from '../../api/booking.api.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { LanguageSwitch, useLanguage, useT } from '../../i18n/index.jsx';
import { fmtDay } from '../../components/booking/counter/counterUtils.js';
import { minutesUntil, pickBoard, savedHall, saveHall, tileSize } from '../../components/booking/checkin/checkInUtils.js';
import { useHallEvents } from '../../utils/hallLive.js';
import { hallHeading, hallTitle } from '../../utils/halls.js';

// The hall screen: a TV or tablet at the hall shows the batch running now with every serial
// number — green once that devotee has checked in at the entrance — the next batch, and a
// strip with the whole day's timetable. Each scan at the entrance arrives live: a card shows
// who was just let in (or, in amber, why not — other hall, other day, batch over) and their
// tile pulses. No sidebar, refreshes itself, keeps the screen on. Names only, never phone numbers.

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

const TILE = {
  lg: { grid: 'grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]', num: 'text-5xl', name: 'text-base' },
  md: { grid: 'grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))]', num: 'text-4xl', name: 'text-sm' },
  sm: { grid: 'grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))]', num: 'text-3xl', name: 'text-xs' },
};

// Wide letter-spacing suits English capitals but breaks up Devanagari.
const spacing = (lang) => (lang === 'mr' ? 'tracking-normal' : 'tracking-[0.2em]');
const sevaText = (g, lang) => (lang === 'mr' && g.sevaNamesMr?.length ? g.sevaNamesMr : g.sevaNames).join(', ');

const clockText = (d) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

// "starts in 12 min" when it is close, else "starts at 11:00 PM".
const startsText = (t, label, wait) => (wait <= 0 ? t('starting now')
  : wait <= 90 ? t('starts in {n} min', { n: wait }) : t('starts at {time}', { time: String(label).split(/\s*[–-]\s*/)[0] }));

function SerialGrid({ group, names, flash }) {
  const size = TILE[tileSize(group.bookings.length)];
  return (
    <ul className={`grid gap-2.5 ${size.grid}`}>
      {group.bookings.map((b, i) => (
        <li key={`${b.serialNo ?? 'x'}-${i}`}
          className={`relative rounded-2xl px-2 py-3 text-center transition-all ${b.arrived ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-100 ring-1 ring-slate-700'} ${flash?.has(String(b._id)) ? 'z-10 scale-110 animate-pulse ring-4 ring-amber-300' : ''}`}>
          {b.arrived && <Check className="absolute right-2 top-2 h-5 w-5" aria-hidden="true" />}
          <p className={`font-black leading-none tabular-nums ${size.num}`}>{b.serialNo ?? '—'}</p>
          {names && <p className={`mt-1.5 line-clamp-2 break-words font-medium leading-tight ${size.name} ${b.arrived ? 'text-green-50' : 'text-slate-300'}`}>{b.name}</p>}
          {b.people > 1 && (
            <p className={`mt-1 inline-flex items-center gap-0.5 text-xs ${b.arrived ? 'text-green-100' : 'text-slate-400'}`}>
              <Users className="h-3 w-3" aria-hidden="true" />{b.people}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function BatchBlock({ group, kind, names, now, showHall, hallLabel, flash }) {
  const t = useT();
  const { lang } = useLanguage();
  const spaced = spacing(lang);
  const wait = kind === 'next' ? minutesUntil(group.label, now) : null;
  return (
    <section className="min-w-0 rounded-3xl bg-slate-900/80 p-4 ring-1 ring-slate-800 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className={`text-sm font-bold uppercase ${spaced} ${kind === 'now' ? 'text-amber-400' : 'text-sky-400'}`}>
            {kind === 'now' ? t('Now') : t('Next')}{showHall && group.hall ? ` · ${hallLabel || group.hall}` : ''}
          </p>
          <p className="mt-1 text-3xl font-black text-white sm:text-4xl">{group.label}</p>
          <p className="mt-1 text-lg text-slate-300">
            {sevaText(group, lang)}
            {wait != null && <span className="ml-2 font-semibold text-sky-300">· {startsText(t, group.label, wait)}</span>}
          </p>
        </div>
        <div className="text-right">
          <p className="text-4xl font-black tabular-nums text-white sm:text-5xl">
            {group.arrived}<span className="text-2xl text-slate-500 sm:text-3xl">/{group.bookings.length}</span>
          </p>
          <p className="text-sm text-slate-400">{t('arrived')}</p>
        </div>
      </div>
      {group.bookings.length
        ? <SerialGrid group={group} names={names} flash={flash} />
        : <p className="rounded-2xl bg-slate-800/60 px-4 py-6 text-center text-xl text-slate-400">{t('No bookings yet — bookings made at the counter appear here')}</p>}
    </section>
  );
}

// Every timed batch of the day in one row: done, running now, next, later.
function DayStrip({ groups, board, showHall }) {
  const t = useT();
  const listRef = useRef(null);
  const timed = groups.filter((g) => g.start != null);
  const nowKeys = new Set(board.current.map((g) => g.key));
  const nextKeys = new Set(board.next.map((g) => g.key));
  const focusKey = board.current[0]?.key || board.next[0]?.key || '';
  // Keep the batch running now (or the next one) in view when the strip is wider than the screen
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-key="${CSS.escape(focusKey)}"]`);
    if (el) el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [focusKey]);
  if (timed.length < 2) return null;
  return (
    <ol ref={listRef} className="mb-5 flex gap-2 overflow-x-auto pb-1" aria-label={t('Today’s batches')}>
      {timed.map((g) => {
        const state = nowKeys.has(g.key) ? 'now' : nextKeys.has(g.key) ? 'next' : g.state === 'over' || board.over.some((o) => o.key === g.key) ? 'over' : 'later';
        const cls = {
          now: 'bg-amber-400 text-slate-950',
          next: 'bg-sky-900 text-sky-50 ring-1 ring-sky-400',
          over: 'bg-slate-900 text-slate-500',
          later: 'bg-slate-900 text-slate-200 ring-1 ring-slate-800',
        }[state];
        return (
          <li key={g.key} data-key={g.key} className={`shrink-0 rounded-xl px-3 py-2 text-center ${cls}`}>
            <p className="text-base font-bold tabular-nums">{startOf(g.label)}{showHall && g.hall ? ` · ${g.hall}` : ''}</p>
            <p className="text-xs font-semibold tabular-nums">
              {state === 'over' && <Check className="mr-0.5 inline h-3 w-3" aria-hidden="true" />}
              {g.bookings.length ? `${g.arrived}/${g.bookings.length}` : '—'}
            </p>
          </li>
        );
      })}
    </ol>
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

function Recent({ items, showHall }) {
  const t = useT();
  if (!items?.length) return null;
  return (
    <div className="rounded-2xl bg-slate-900 px-5 py-3 ring-1 ring-slate-800">
      <p className="mb-1 text-xs font-bold uppercase tracking-wider text-green-400">{t('Just arrived')}</p>
      <ul className="space-y-0.5">
        {items.slice(0, 5).map((r) => (
          <li key={r._id} className="flex items-baseline gap-2 text-base">
            <span className="w-10 text-right font-black tabular-nums text-white">{r.serialNo ?? '—'}</span>
            <span className="min-w-0 truncate text-slate-200">{r.name}</span>
            <span className="ml-auto shrink-0 text-sm text-slate-500">{[showHall && r.hall, timeText(r.at)].filter(Boolean).join(' · ')}</span>
          </li>
        ))}
      </ul>
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

  // The clock and the "now / next" choice follow the device clock between refreshes.
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
  const board = pickBoard(data?.groups || [], now);
  const main = board.current.length ? board.current : board.next;
  const mainKind = board.current.length ? 'now' : 'next';
  const upcoming = board.current.length ? board.next : [];
  const showHall = !hall;
  const titleOf = (h) => hallTitle(h, data?.hallNames, lang);        // "Shri Mangal Sabhagruh (H1)" or "H1"
  const headingOf = (h) => hallHeading(t, h, data?.hallNames, lang);  // … or "Hall H1"
  const spaced = spacing(lang);
  const totals = (data?.groups || []).reduce((s, g) => ({ bookings: s.bookings + g.bookings.length, arrived: s.arrived + g.arrived }), { bookings: 0, arrived: 0 });

  return (
    <div className="min-h-[100dvh] bg-slate-950 px-4 pb-6 pt-[calc(1rem+var(--safe-top,0px))] text-white sm:px-8">
      {/* Header: temple, hall, date and a big clock */}
      <header className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
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
      {allowed && data && <DayStrip groups={data.groups || []} board={board} showHall={showHall} />}

      {/* Controls: quiet until touched */}
      <div className="fixed bottom-[calc(0.75rem+var(--safe-bottom,0px))] right-3 z-10 flex items-center gap-1 rounded-full bg-slate-900/90 p-1 opacity-40 ring-1 ring-slate-700 transition-opacity hover:opacity-100 focus-within:opacity-100">
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
      ) : main.length ? (
        <div className={`grid gap-5 ${main.length > 1 ? 'xl:grid-cols-2' : ''}`}>
          {main.map((g) => <BatchBlock key={g.key} group={g} kind={mainKind} names={names} now={now} showHall={showHall} hallLabel={headingOf(g.hall)} flash={flash} />)}
        </div>
      ) : (
        <div className="mt-16 text-center">
          <p className="text-4xl font-black text-slate-200">{totals.bookings ? t('Today’s batches are over') : t('No bookings for today')}</p>
          {totals.bookings > 0 && <p className="mt-3 text-2xl text-slate-400">{t('{n} of {total} arrived', { n: totals.arrived, total: totals.bookings })}</p>}
        </div>
      )}

      {/* After this: the next batch(es) while one is running, and sevas without a fixed time */}
      {allowed && (upcoming.length > 0 || board.untimed.length > 0 || data?.recent?.length > 0) && (
        <footer className="mt-5 flex flex-wrap gap-3">
          <Recent items={data?.recent} showHall={showHall} />
          {upcoming.map((g) => (
            <div key={g.key} className="rounded-2xl bg-slate-900 px-5 py-3 ring-1 ring-slate-800">
              <p className={`text-xs font-bold uppercase ${spaced} text-sky-400`}>
                {t('Next')}{showHall && g.hall ? ` · ${headingOf(g.hall)}` : ''}
              </p>
              <p className="text-xl font-bold">{g.label}</p>
              <p className="text-sm text-slate-400">
                {startsText(t, g.label, minutesUntil(g.label, now) ?? 0)} · {t('{n} of {total} arrived', { n: g.arrived, total: g.bookings.length })}
              </p>
            </div>
          ))}
          {board.untimed.map((g) => (
            <div key={g.key} className="rounded-2xl bg-slate-900 px-5 py-3 ring-1 ring-slate-800">
              <p className={`text-xs font-bold uppercase ${spaced} text-slate-400`}>{t('Also today')}</p>
              <p className="text-xl font-bold">{sevaText(g, lang)}</p>
              <p className="text-sm text-slate-400">{[g.label, t('{n} of {total} arrived', { n: g.arrived, total: g.bookings.length })].filter(Boolean).join(' · ')}</p>
            </div>
          ))}
        </footer>
      )}
    </div>
  );
}
