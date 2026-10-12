import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, Check, Eye, EyeOff, Maximize2, Minimize2, Users, X } from 'lucide-react';
import { getHallBoard } from '../../api/booking.api.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { LanguageSwitch, useLanguage, useT } from '../../i18n/index.jsx';
import { fmtDay } from '../../components/booking/counter/counterUtils.js';
import { minutesUntil, pickBoard, savedHall, saveHall, tileSize } from '../../components/booking/checkin/checkInUtils.js';
import { useHallEvents } from '../../utils/hallLive.js';
import { hallHeading, hallTitle } from '../../utils/halls.js';

// The hall screen: a TV or tablet at the hall. The batch running now fills the left with every
// serial number — green once that devotee has checked in at the entrance — and a side panel
// shows what comes next, the latest arrivals, the day's totals and who did not come to the
// batch that just finished. A strip on top has the whole day's timetable. Once the day's
// batches are over it shows the day's summary and tomorrow's first batch. Each scan at the
// entrance arrives live: a card shows who was just let in (or, in amber, why not — other hall,
// other day, batch over) and their tile pulses. No sidebar, refreshes itself, keeps the screen
// on. Names only, never phone numbers.

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
const missing = (g) => g.bookings.filter((b) => !b.arrived);

const TILE = {
  xl: { grid: 'grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]', num: 'text-5xl sm:text-7xl', name: 'text-base sm:text-xl' },
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
  : wait <= 90 ? t('starts in {n} min', { n: wait }) : t('starts at {time}', { time: startOf(label) }));
// "ends in 25 min" for the batch running now.
const endsText = (t, left) => (left <= 0 ? t('ending now') : t('ends in {n} min', { n: left }));
// "just now", "12 min ago", or the time for older arrivals.
const agoText = (t, at, now) => {
  const mins = Math.floor((now - new Date(at)) / 60000);
  return mins < 1 ? t('just now') : mins < 60 ? t('{n} min ago', { n: mins }) : timeText(at);
};

function Bar({ value, total, className = 'h-2', fill = 'bg-green-500' }) {
  return (
    <div className={`overflow-hidden rounded-full bg-slate-800 ${className}`} role="presentation">
      <div className={`h-full rounded-full transition-[width] duration-700 ${fill}`} style={{ width: `${pct(value, total)}%` }} />
    </div>
  );
}

// Small card for the side panel and the day summary.
function Panel({ label, tone = 'text-slate-400', children, className = '' }) {
  const { lang } = useLanguage();
  return (
    <section className={`rounded-2xl bg-slate-900 px-5 py-4 ring-1 ring-slate-800 ${className}`}>
      {label && <p className={`mb-2 text-xs font-bold uppercase ${spacing(lang)} ${tone}`}>{label}</p>}
      {children}
    </section>
  );
}

function SerialGrid({ group, names, flash }) {
  const n = group.bookings.length;
  const size = TILE[n <= 12 ? 'xl' : tileSize(n)];   // few bookings: tiles big enough to read across the hall
  return (
    <ul className={`grid gap-2.5 ${size.grid}`}>
      {group.bookings.map((b, i) => (
        <li key={`${b.serialNo ?? 'x'}-${i}`}
          className={`relative rounded-2xl px-2 py-4 text-center transition-all ${b.arrived ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-100 ring-1 ring-slate-700'} ${flash?.has(String(b._id)) ? 'z-10 scale-110 animate-pulse ring-4 ring-amber-300' : ''}`}>
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

// The batch running now (or the next one): time, sevas, how many have come, every serial.
function BatchBlock({ group, kind, names, now, showHall, hallLabel, flash }) {
  const t = useT();
  const { lang } = useLanguage();
  const spaced = spacing(lang);
  const total = group.bookings.length;
  const when = kind === 'next' ? startsText(t, group.label, minutesUntil(group.label, now) ?? 0)
    : kind === 'now' && group.end != null ? endsText(t, group.end - nowMinutes(now)) : '';
  const tone = { now: 'text-amber-400', next: 'text-sky-400', today: 'text-slate-300' }[kind];
  return (
    <section className="min-w-0 rounded-3xl bg-slate-900/80 p-4 ring-1 ring-slate-800 sm:p-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className={`text-sm font-bold uppercase ${spaced} ${tone}`}>
            {{ now: t('Now'), next: t('Next'), today: t('Today') }[kind]}{showHall && group.hall ? ` · ${hallLabel || group.hall}` : ''}
          </p>
          <p className="mt-1 text-3xl font-black text-white sm:text-4xl">{group.label || sevaText(group, lang)}</p>
          <p className="mt-1 text-lg text-slate-300">
            {group.label ? sevaText(group, lang) : ''}
            {when && <span className={`font-semibold ${kind === 'now' ? 'text-amber-300' : 'text-sky-300'}`}>{group.label ? ' · ' : ''}{when}</span>}
          </p>
        </div>
        {total > 0 && (
          <div className="text-right">
            <p className="text-4xl font-black tabular-nums text-white sm:text-5xl">
              {group.arrived}<span className="text-2xl text-slate-500 sm:text-3xl">/{total}</span>
            </p>
            <p className="text-sm text-slate-400">
              {t('arrived')}
              {group.people !== total && <> · {t('{n} of {total} people', { n: group.arrivedPeople, total: group.people })}</>}
            </p>
          </div>
        )}
      </div>
      {total > 0 && <Bar value={group.arrived} total={total} className="mb-4 h-2.5" fill={kind === 'now' ? 'bg-green-500' : 'bg-sky-500'} />}
      {total
        ? <SerialGrid group={group} names={names} flash={flash} />
        : <p className="rounded-2xl bg-slate-800/60 px-4 py-6 text-center text-xl text-slate-400">{t('No bookings yet — bookings made at the counter appear here')}</p>}
    </section>
  );
}

// Every timed batch of the day in one row: done, running now, next, later — with how many came.
function DayStrip({ groups, board, showHall }) {
  const t = useT();
  const { lang } = useLanguage();
  const listRef = useRef(null);
  const timed = groups.filter((g) => g.start != null);
  const nowKeys = new Set(board.current.map((g) => g.key));
  const nextKeys = new Set(board.next.map((g) => g.key));
  const overKeys = new Set(board.over.map((g) => g.key));
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
        const state = nowKeys.has(g.key) ? 'now' : nextKeys.has(g.key) ? 'next' : overKeys.has(g.key) ? 'over' : 'later';
        const look = {
          now: { box: 'bg-amber-400 text-slate-950', tag: t('Now'), bar: 'bg-slate-950', track: 'bg-amber-600/40' },
          next: { box: 'bg-sky-950 text-sky-50 ring-2 ring-sky-500', tag: t('Next'), bar: 'bg-sky-400', track: 'bg-sky-900' },
          over: { box: 'bg-slate-900 text-slate-400', tag: t('Done'), bar: 'bg-green-600', track: 'bg-slate-800' },
          later: { box: 'bg-slate-900 text-slate-100 ring-1 ring-slate-800', tag: '', bar: 'bg-sky-600', track: 'bg-slate-800' },
        }[state];
        const total = g.bookings.length;
        return (
          <li key={g.key} data-key={g.key} className={`min-w-[7.5rem] flex-1 rounded-2xl px-3 py-2.5 ${look.box}`}>
            <p className={`flex min-h-[1rem] items-center justify-between gap-2 text-[0.7rem] font-bold uppercase ${spacing(lang)}`}>
              <span>{look.tag}</span>
              {showHall && g.hall && <span className="tracking-normal opacity-80">{g.hall}</span>}
            </p>
            <p className="text-xl font-black tabular-nums leading-tight">{startOf(g.label)}</p>
            <div className={`mt-1.5 h-1.5 overflow-hidden rounded-full ${look.track}`} role="presentation">
              <div className={`h-full rounded-full ${look.bar}`} style={{ width: `${pct(g.arrived, total)}%` }} />
            </div>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {state === 'over' && total > 0 && <Check className="mr-0.5 inline h-3.5 w-3.5" aria-hidden="true" />}
              {total ? `${g.arrived}/${total}` : '—'}
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

// Serials (and names) of the devotees who did not come, a few at a time.
function MissingList({ list, names, max = 10 }) {
  const t = useT();
  const shown = list.slice(0, max);
  return (
    <ul className="flex flex-wrap gap-1.5">
      {shown.map((b) => (
        <li key={b._id} className="inline-flex max-w-full items-baseline gap-1.5 rounded-lg bg-slate-800 px-2 py-1 text-sm">
          <span className="font-black tabular-nums text-white">{b.serialNo ?? '—'}</span>
          {names && <span className="truncate text-slate-300">{b.name}</span>}
        </li>
      ))}
      {list.length > max && <li className="px-1 py-1 text-sm text-slate-400">{t('+{n} more', { n: list.length - max })}</li>}
    </ul>
  );
}

// ── Side panel ────────────────────────────────────────────────────────────────

function NextCard({ groups, now, showHall, headingOf, label }) {
  const t = useT();
  const first = groups[0];
  const booked = (g) => (
    <>
      {g.bookings.length ? t('{n} booked', { n: g.bookings.length }) : t('No bookings yet')}
      {g.arrived > 0 && <> · <span className="text-green-400">{t('{n} already here', { n: g.arrived })}</span></>}
    </>
  );
  if (groups.length === 1) {
    return (
      <Panel label={`${label}${showHall && first.hall ? ` · ${headingOf(first.hall)}` : ''}`} tone="text-sky-400">
        <p className="text-2xl font-black">{first.label}</p>
        <p className="mt-0.5 text-base font-semibold text-sky-300">{startsText(t, first.label, minutesUntil(first.label, now) ?? 0)}</p>
        <p className="mt-1 text-base text-slate-300">{booked(first)}</p>
      </Panel>
    );
  }
  // Several halls start at the same time (all-halls screen): one row each
  return (
    <Panel label={label} tone="text-sky-400">
      <p className="text-2xl font-black">{first.label}</p>
      <p className="mt-0.5 text-base font-semibold text-sky-300">{startsText(t, first.label, minutesUntil(first.label, now) ?? 0)}</p>
      <ul className="mt-2 space-y-1 border-t border-slate-800 pt-2">
        {groups.map((g) => (
          <li key={g.key} className="flex items-baseline justify-between gap-3 text-base">
            <span className="min-w-0 truncate font-semibold text-white">{headingOf(g.hall)}</span>
            <span className="shrink-0 text-slate-300">{booked(g)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// The day so far, in the header: arrived of booked, people, batches done.
function TodayTotals({ groups, board }) {
  const t = useT();
  const { lang } = useLanguage();
  const booked = groups.reduce((n, g) => n + g.bookings.length, 0);
  if (!booked) return null;
  const arrived = groups.reduce((n, g) => n + g.arrived, 0);
  const people = groups.reduce((n, g) => n + g.people, 0);
  const arrivedPeople = groups.reduce((n, g) => n + g.arrivedPeople, 0);
  const timed = groups.filter((g) => g.start != null);
  return (
    <div className="order-last w-full min-w-[16rem] rounded-2xl bg-slate-900 px-5 py-2.5 ring-1 ring-slate-800 lg:order-none lg:w-auto lg:flex-1 xl:max-w-xl">
      <div className="flex items-baseline justify-between gap-3">
        <p className={`text-xs font-bold uppercase ${spacing(lang)} text-slate-400`}>{t('Today')}</p>
        <p className="text-sm text-slate-400">
          {people !== booked && t('{n} of {total} people', { n: arrivedPeople, total: people })}
          {people !== booked && timed.length > 1 && ' · '}
          {timed.length > 1 && t('{n} of {total} batches done', { n: board.over.filter((g) => g.start != null).length, total: timed.length })}
        </p>
      </div>
      <div className="mt-1 flex items-center gap-4">
        <p className="shrink-0 text-3xl font-black tabular-nums">{arrived}<span className="text-xl text-slate-500">/{booked}</span></p>
        <Bar value={arrived} total={booked} className="h-2.5 flex-1" />
        <p className="shrink-0 text-2xl font-black tabular-nums text-green-400">{pct(arrived, booked)}%</p>
      </div>
    </div>
  );
}

// The batch that just ended: how many came, and who did not (they may still turn up).
function FinishedCard({ group, names, showHall, hallLabel }) {
  const t = useT();
  const total = group.bookings.length;
  const notHere = missing(group);
  return (
    <Panel label={`${t('Just finished')}${showHall && group.hall ? ` · ${hallLabel}` : ''}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xl font-black">{group.label}</p>
        <p className="text-xl font-black tabular-nums">{group.arrived}<span className="text-base text-slate-500">/{total}</span></p>
      </div>
      {notHere.length === 0
        ? <p className="mt-1 text-base font-semibold text-green-400">{t('Everyone came')}</p>
        : (
          <>
            <p className="mb-1.5 mt-1 text-sm text-slate-400">{t('Did not come')}</p>
            <MissingList list={notHere} names={names} max={6} />
          </>
        )}
    </Panel>
  );
}

function Recent({ items, showHall, now }) {
  const t = useT();
  if (!items?.length) return null;
  return (
    <Panel label={t('Latest arrivals')} tone="text-green-400">
      <ul className="space-y-1">
        {items.slice(0, 4).map((r) => (
          <li key={r._id} className="flex items-baseline gap-2 text-base">
            <span className="w-9 shrink-0 text-right font-black tabular-nums text-white">{r.serialNo ?? '—'}</span>
            <span className="min-w-0 truncate text-slate-200">{r.name}</span>
            <span className="ml-auto shrink-0 text-sm text-slate-500">{[showHall && r.hall, agoText(t, r.at, now)].filter(Boolean).join(' · ')}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function UntimedCard({ group }) {
  const t = useT();
  const { lang } = useLanguage();
  return (
    <Panel label={t('Also today')}>
      <p className="text-xl font-bold">{sevaText(group, lang)}</p>
      <p className="text-sm text-slate-400">{[group.label, t('{n} of {total} arrived', { n: group.arrived, total: group.bookings.length })].filter(Boolean).join(' · ')}</p>
    </Panel>
  );
}

// ── End of the day / nothing today ────────────────────────────────────────────

function Tomorrow({ info }) {
  const t = useT();
  const { lang } = useLanguage();
  if (!info?.date) return null;
  const day = fmtDay(info.date, lang, { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <Panel label={`${t('Tomorrow')} · ${day}`} tone="text-sky-400">
      <div className="flex items-start gap-4">
        <CalendarDays className="mt-1 h-8 w-8 shrink-0 text-sky-400" aria-hidden="true" />
        {info.closed ? (
          <div>
            <p className="text-2xl font-black">{t('Closed for bookings')}</p>
            {info.closed.reason && <p className="text-lg text-slate-300">{info.closed.reason}</p>}
          </div>
        ) : info.batches ? (
          <div>
            <p className="text-2xl font-black">{t('First batch {label}', { label: info.first })}</p>
            <p className="text-lg text-slate-300">
              {t('{n} batches', { n: info.batches })} · {info.bookings ? t('{n} booked so far', { n: info.bookings }) : t('No bookings yet')}
              {info.people > info.bookings && <> · {t('{n} people', { n: info.people })}</>}
            </p>
          </div>
        ) : (
          <p className="text-2xl font-black text-slate-300">{t('No batches on the timetable')}</p>
        )}
      </div>
    </Panel>
  );
}

function Stat({ label, value, sub, tone = 'text-white', className = '' }) {
  return (
    <div className={`rounded-2xl bg-slate-900 px-5 py-3 ring-1 ring-slate-800 ${className}`}>
      <p className="text-sm font-semibold text-slate-400">{label}</p>
      <p className={`mt-0.5 text-4xl font-black tabular-nums ${tone}`}>{value}</p>
      {sub && <p className="mt-0.5 text-base text-slate-400">{sub}</p>}
    </div>
  );
}

// Tomorrow in one tile: closed, or the first batch and how many are booked.
function TomorrowStat({ info }) {
  const t = useT();
  const { lang } = useLanguage();
  if (!info?.date) return null;
  const day = fmtDay(info.date, lang, { weekday: 'long', day: 'numeric', month: 'short' });
  return (
    <div className="rounded-2xl bg-sky-950/60 px-5 py-3 ring-1 ring-sky-900">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-sky-300">
        <CalendarDays className="h-4 w-4" aria-hidden="true" />{t('Tomorrow')} · {day}
      </p>
      {info.closed ? (
        <>
          <p className="mt-0.5 text-2xl font-black">{t('Closed for bookings')}</p>
          {info.closed.reason && <p className="mt-0.5 text-base text-slate-300">{info.closed.reason}</p>}
        </>
      ) : info.batches ? (
        <>
          <p className="mt-0.5 text-2xl font-black">{t('First batch {label}', { label: startOf(info.first) })}</p>
          <p className="mt-0.5 text-base text-slate-300">
            {t('{n} batches', { n: info.batches })} · {info.bookings ? t('{n} booked so far', { n: info.bookings }) : t('No bookings yet')}
          </p>
        </>
      ) : (
        <p className="mt-0.5 text-2xl font-black text-slate-300">{t('No batches on the timetable')}</p>
      )}
    </div>
  );
}

// All the day's batches are over: how the day went, batch by batch, and what tomorrow brings.
function DaySummary({ groups, tomorrow, names, showHall, headingOf }) {
  const t = useT();
  const { lang } = useLanguage();
  const withBookings = groups.filter((g) => g.bookings.length);
  const booked = withBookings.reduce((n, g) => n + g.bookings.length, 0);
  const arrived = withBookings.reduce((n, g) => n + g.arrived, 0);
  const people = withBookings.reduce((n, g) => n + g.people, 0);
  const arrivedPeople = withBookings.reduce((n, g) => n + g.arrivedPeople, 0);
  const scanned = arrived > 0; // no check-ins at all = the entrance did not scan, not "nobody came"
  return (
    <div className="space-y-5">
      <h2 className="text-center text-3xl font-black text-slate-100 sm:text-4xl">{t('Today’s batches are over')}</h2>
      {scanned ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label={t('Arrived')} value={<>{arrived}<span className="text-2xl text-slate-500">/{booked}</span></>} sub={t('{n}% of bookings', { n: pct(arrived, booked) })} tone="text-green-400" />
          <Stat label={t('People')} value={<>{arrivedPeople}<span className="text-2xl text-slate-500">/{people}</span></>} sub={t('people came in')} />
          <Stat label={t('Did not come')} value={booked - arrived} sub={booked - arrived ? t('of {n} bookings', { n: booked }) : t('Everyone came')} tone={booked - arrived ? 'text-amber-400' : 'text-green-400'} />
          <TomorrowStat info={tomorrow} />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-slate-900 px-5 py-3 ring-1 ring-slate-800">
            <p className="text-2xl font-black">{t('{n} bookings today', { n: booked })}</p>
            <p className="mt-0.5 text-base text-slate-400">{t('No one was checked in — slips were not scanned at the entrance')}</p>
          </div>
          <TomorrowStat info={tomorrow} />
        </div>
      )}

      <div className={`grid gap-4 lg:grid-cols-2 xl:grid-cols-3 ${withBookings.length > 6 ? '2xl:grid-cols-4' : ''}`}>
        {withBookings.map((g) => {
          const notHere = missing(g);
          return (
            <section key={g.key} className="rounded-2xl bg-slate-900 px-5 py-3 ring-1 ring-slate-800">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate">
                  <span className="text-xl font-black">{g.label || sevaText(g, lang)}</span>
                  <span className="ml-2 text-sm text-slate-400">{[showHall && g.hall ? headingOf(g.hall) : null, g.label ? sevaText(g, lang) : null].filter(Boolean).join(' · ')}</span>
                </p>
                <p className="shrink-0 text-2xl font-black tabular-nums">{g.arrived}<span className="text-lg text-slate-500">/{g.bookings.length}</span></p>
              </div>
              <Bar value={g.arrived} total={g.bookings.length} className="my-2 h-2" />
              {scanned && (notHere.length === 0
                ? <p className="text-base font-semibold text-green-400">{t('Everyone came')}</p>
                : (
                  <div className="flex items-start gap-2">
                    <p className="shrink-0 pt-1 text-sm text-amber-300">{t('Did not come')}:</p>
                    <MissingList list={notHere} names={names} max={6} />
                  </div>
                ))}
            </section>
          );
        })}
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
  const groups = data?.groups || [];
  const board = pickBoard(groups, now);
  const timed = groups.filter((g) => g.start != null);
  const showHall = !hall;
  const titleOf = (h) => hallTitle(h, data?.hallNames, lang);        // "Shri Mangal Sabhagruh (H1)" or "H1"
  const headingOf = (h) => hallHeading(t, h, data?.hallNames, lang);  // … or "Hall H1"

  // What fills the screen: the batch running now, else the next one; a day with only fixed-time
  // sevas shows those; once every batch is over, the day's summary.
  const [main, mainKind] = board.current.length ? [board.current, 'now']
    : board.next.length ? [board.next, 'next']
      : !timed.length && board.untimed.length ? [board.untimed, 'today'] : [[], ''];
  const booked = groups.reduce((n, g) => n + g.bookings.length, 0);
  const dayOver = !main.length && booked > 0;

  // Side panel: what comes after, the latest arrivals, the day so far, the batch that just ended.
  const mainKeys = new Set(main.map((g) => g.key));
  const laterTimed = timed.filter((g) => !mainKeys.has(g.key) && minutesUntil(g.label, now) > 0)
    .sort((a, b) => a.start - b.start);
  const upcoming = laterTimed.filter((g) => g.start === laterTimed[0]?.start);
  const finished = [...board.over].filter((g) => g.start != null && g.bookings.length)
    .sort((a, b) => b.end - a.end)[0];
  const sideUntimed = mainKind === 'today' ? [] : board.untimed;
  const finishedCard = finished && <FinishedCard group={finished} names={names} showHall={showHall} hallLabel={headingOf(finished.hall)} />;
  const showSide = Boolean(main.length);

  return (
    <div className="min-h-[100dvh] bg-slate-950 px-4 pb-24 pt-[calc(1rem+var(--safe-top,0px))] text-white sm:px-8">
      {/* Header: temple, hall, date and a big clock */}
      <header className="mb-5 flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-amber-300">{data?.templeName || t('Mangal Grah Mandir')}</p>
          <p className="text-3xl font-black sm:text-4xl">{hall ? headingOf(hall) : t('All halls')}</p>
        </div>
        {allowed && showSide && <TodayTotals groups={groups} board={board} />}
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
      {allowed && data && <DayStrip groups={groups} board={board} showHall={showHall} />}

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
      ) : showSide ? (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="grid gap-5">
            <div className={`grid gap-5 ${main.length > 1 ? '2xl:grid-cols-2' : ''}`}>
              {main.map((g) => (
                <BatchBlock key={g.key} group={g} kind={mainKind} names={names} now={now} showHall={showHall} hallLabel={headingOf(g.hall)} flash={flash} />
              ))}
            </div>
            {sideUntimed.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {sideUntimed.map((g) => <UntimedCard key={g.key} group={g} />)}
              </div>
            )}
          </div>
          <aside className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {upcoming.length > 0 && (
              <NextCard groups={upcoming} now={now} showHall={showHall} headingOf={headingOf}
                label={mainKind === 'now' ? t('Next') : t('After that')} />
            )}
            {mainKind === 'next' && finishedCard}
            <Recent items={data?.recent} showHall={showHall} now={now} />
            {mainKind !== 'next' && finishedCard}
          </aside>
        </div>
      ) : dayOver ? (
        <DaySummary groups={groups} tomorrow={data?.tomorrow} names={names} showHall={showHall} headingOf={headingOf} />
      ) : (
        <div className="mx-auto mt-10 max-w-3xl space-y-6 text-center">
          <p className="text-4xl font-black text-slate-200">{data?.closed ? t('Closed for bookings today') : t('No bookings for today')}</p>
          {data?.closed?.reason && <p className="text-2xl text-slate-400">{data.closed.reason}</p>}
          <div className="text-left"><Tomorrow info={data?.tomorrow} /></div>
        </div>
      )}
    </div>
  );
}
