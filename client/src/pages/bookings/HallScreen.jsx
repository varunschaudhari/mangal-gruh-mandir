import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, Eye, EyeOff, Maximize2, Minimize2, Users, X } from 'lucide-react';
import { getHallBoard } from '../../api/booking.api.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { LanguageSwitch, useLanguage, useT } from '../../i18n/index.jsx';
import { fmtDay } from '../../components/booking/counter/counterUtils.js';
import { minutesUntil, pickBoard, savedHall, saveHall, tileSize } from '../../components/booking/checkin/checkInUtils.js';

// The hall screen: a TV or tablet at the hall shows the batch running now with every serial
// number — green once that devotee has checked in at the entrance — and the next batch. No
// sidebar, refreshes itself, keeps the screen on. Names only, never phone numbers.

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

function SerialGrid({ group, names }) {
  const size = TILE[tileSize(group.bookings.length)];
  return (
    <ul className={`grid gap-2.5 ${size.grid}`}>
      {group.bookings.map((b, i) => (
        <li key={`${b.serialNo ?? 'x'}-${i}`}
          className={`relative rounded-2xl px-2 py-3 text-center transition-colors ${b.arrived ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-100 ring-1 ring-slate-700'}`}>
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

function BatchBlock({ group, kind, names, now, showHall }) {
  const t = useT();
  const { lang } = useLanguage();
  const spaced = spacing(lang);
  const wait = kind === 'next' ? minutesUntil(group.label, now) : null;
  return (
    <section className="min-w-0 rounded-3xl bg-slate-900/80 p-4 ring-1 ring-slate-800 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className={`text-sm font-bold uppercase ${spaced} ${kind === 'now' ? 'text-amber-400' : 'text-sky-400'}`}>
            {kind === 'now' ? t('Now') : t('Next')}{showHall && group.hall ? ` · ${t('Hall {hall}', { hall: group.hall })}` : ''}
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
      <SerialGrid group={group} names={names} />
    </section>
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
  const [full, setFull] = useState(Boolean(document.fullscreenElement));
  const allowed = can('bookings:checkin');

  const q = useQuery({
    queryKey: ['booking-hall-board', hall],
    queryFn: () => getHallBoard({ hall: hall || undefined }).then((r) => r.data.data),
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
    enabled: allowed,
  });

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
  const spaced = spacing(lang);
  const totals = (data?.groups || []).reduce((s, g) => ({ bookings: s.bookings + g.bookings.length, arrived: s.arrived + g.arrived }), { bookings: 0, arrived: 0 });

  return (
    <div className="min-h-[100dvh] bg-slate-950 px-4 pb-6 pt-[calc(1rem+var(--safe-top,0px))] text-white sm:px-8">
      {/* Header: temple, hall, date and a big clock */}
      <header className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-amber-300">{data?.templeName || t('Mangal Grah Mandir')}</p>
          <p className="text-3xl font-black sm:text-4xl">{hall ? t('Hall {hall}', { hall }) : t('All halls')}</p>
        </div>
        <div className="text-right">
          <p className="text-4xl font-black tabular-nums sm:text-6xl">{clockText(now)}</p>
          <p className="text-base text-slate-400">{data?.date ? fmtDay(data.date, lang, { weekday: 'long', day: 'numeric', month: 'long' }) : ''}</p>
        </div>
      </header>

      {/* Controls: quiet until touched */}
      <div className="fixed bottom-[calc(0.75rem+var(--safe-bottom,0px))] right-3 z-10 flex items-center gap-1 rounded-full bg-slate-900/90 p-1 opacity-40 ring-1 ring-slate-700 transition-opacity hover:opacity-100 focus-within:opacity-100">
        {(data?.halls || []).length > 1 && (
          <select value={hall} onChange={(e) => chooseHall(e.target.value)} aria-label={t('Hall')}
            className="h-10 rounded-full border-0 bg-slate-800 px-3 text-sm text-white focus:ring-2 focus:ring-amber-400">
            <option value="">{t('All halls')}</option>
            {data.halls.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        )}
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
          {main.map((g) => <BatchBlock key={g.key} group={g} kind={mainKind} names={names} now={now} showHall={showHall} />)}
        </div>
      ) : (
        <div className="mt-16 text-center">
          <p className="text-4xl font-black text-slate-200">{totals.bookings ? t('Today’s batches are over') : t('No bookings for today')}</p>
          {totals.bookings > 0 && <p className="mt-3 text-2xl text-slate-400">{t('{n} of {total} arrived', { n: totals.arrived, total: totals.bookings })}</p>}
        </div>
      )}

      {/* After this: the next batch(es) while one is running, and sevas without a fixed time */}
      {allowed && (upcoming.length > 0 || board.untimed.length > 0) && (
        <footer className="mt-5 flex flex-wrap gap-3">
          {upcoming.map((g) => (
            <div key={g.key} className="rounded-2xl bg-slate-900 px-5 py-3 ring-1 ring-slate-800">
              <p className={`text-xs font-bold uppercase ${spaced} text-sky-400`}>
                {t('Next')}{showHall && g.hall ? ` · ${t('Hall {hall}', { hall: g.hall })}` : ''}
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
