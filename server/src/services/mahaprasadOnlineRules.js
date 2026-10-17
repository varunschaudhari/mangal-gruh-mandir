import { localDateStr } from '../utils/dates.js';

// Which days the public Mahaprasad page sells, how many plates per order and until when — from
// Settings → Mahaprasad. No database here, so the rules can be tested on their own.

/** How long an order keeps its plates on the daily limit while the devotee pays */
export const HOLD_MINUTES = 15;

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const whole = (v, fallback) => (Number.isInteger(Number(v)) && v !== '' && v !== null && v !== undefined ? Number(v) : fallback);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Settings → { enabled, daysAhead, maxPlates, cutoff ('HH:mm' or ''), prices } */
export function onlineRules(s = {}) {
  return {
    enabled: Boolean(s.mahaprasadOnlineEnabled),
    daysAhead: clamp(whole(s.mahaprasadOnlineDaysAhead, 7), 0, 60),
    maxPlates: clamp(whole(s.mahaprasadOnlineMaxPlates, 10), 1, 50),
    cutoff: /^([01]\d|2[0-3]):[0-5]\d$/.test(s.mahaprasadOnlineCutoff || '') ? s.mahaprasadOnlineCutoff : '',
    prices: s.mahaprasadDayPricing || {},
  };
}

/** "YYYY-MM-DD" → that day at noon (how coupons store their day); null when it isn't a real date */
export function parseDay(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text ?? ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return localDateStr(d) === text ? d : null;
}

const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** The price of one plate on that day (Settings → Mahaprasad, by weekday) */
export const priceFor = (rules, date) => Number(rules.prices?.[WEEKDAYS[new Date(date).getDay()]]) || 0;

/**
 * Why `day` ("YYYY-MM-DD") can't be bought right now — '' when it can:
 * 'bad_date' | 'past' | 'too_far' | 'closed_today' (past today's last time) | 'no_price' (not sold that weekday)
 */
export function dayProblem(day, rules, now = new Date()) {
  const date = parseDay(day);
  if (!date) return 'bad_date';
  if (day < localDateStr(now)) return 'past';
  if (day > localDateStr(addDays(now, rules.daysAhead))) return 'too_far';
  if (day === localDateStr(now) && rules.cutoff && hhmm(now) >= rules.cutoff) return 'closed_today';
  if (!(priceFor(rules, date) > 0)) return 'no_price';
  return '';
}

/** What the devotee is told for each problem */
export const DAY_PROBLEM_TEXT = {
  bad_date: 'Choose a date',
  past: 'This date has passed',
  too_far: 'Coupons for this date are not on sale yet',
  closed_today: 'Online coupons for today are closed — please buy at the temple counter',
  no_price: 'Mahaprasad coupons are not sold online for this day',
  full: 'All coupons for this day are sold',
};

/** The days on the page: today to today + daysAhead, each with its price and what stops it ('' = on sale) */
export function saleDays(rules, now = new Date()) {
  return Array.from({ length: rules.daysAhead + 1 }, (_, i) => {
    const date = localDateStr(addDays(now, i));
    return { date, price: priceFor(rules, parseDay(date)), problem: dayProblem(date, rules, now) };
  });
}
