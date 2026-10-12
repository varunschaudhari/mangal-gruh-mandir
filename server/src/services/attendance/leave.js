// Leave and late penalties — pure functions, worked out again from the attendance every time
// (nothing is stored as a running balance, so a corrected day always flows through).
//
// Rules agreed with the temple:
//  • Every month brings its paid leaves (3, or the person's own number); unused ones lapse.
//  • A double shift that management rewards with extra leave gives one extra leave, usable
//    until its expiry date (60 days by default).
//  • An absent day uses that month's paid leave first, then extra leave (soonest expiry
//    first), and only then becomes unpaid. A half day uses half a leave.
//  • Planned leave marked by a supervisor works the same way; "extra" uses extra leave first
//    and "unpaid" uses no leave at all.
//  • With the late penalty on, each late mark after the free ones in a month cuts half a day.

import { addDays } from './compute.js';

const UNITS = { absent: 1, half_day: 0.5, leave: 1 };

const emptyMonth = (entitlement) => ({ paidEntitled: entitlement, paidUsed: 0, extraUsed: 0, unpaid: 0, lateMarks: 0, lateCut: 0 });

/**
 * Goes through one person's days in date order and notes on each day how it was covered:
 *   day.cover   = { paid, extra, unpaid } for absent / half-day / leave days
 *   day.lateNo  = the nth late mark of that month;  day.lateCut = 0.5 when penalised
 * @param days         { 'YYYY-MM-DD': day } — start at the 1st of a month
 * @param entitlement  paid leaves per month
 * @param credits      [{ date, expiresOn, amount }] extra leave earned
 * @param latePenalty  { enabled, freeLates }
 * @returns {{ months: Record<string, object>, credits: object[] }} per-month totals and each
 *          credit with how much of it was used
 */
export function allocateLeave({ days, entitlement, credits = [], latePenalty = {} }) {
  const pool = credits
    .map((c) => ({ ...c, amount: c.amount ?? 1, used: 0 }))
    .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.date.localeCompare(b.date));
  const months = {};

  for (const date of Object.keys(days).sort()) {
    const day = days[date];
    const mt = months[date.slice(0, 7)] ??= emptyMonth(entitlement);

    if (day.lateMinutes > 0) {
      mt.lateMarks += 1;
      day.lateNo = mt.lateMarks;
      if (latePenalty.enabled && mt.lateMarks > (latePenalty.freeLates ?? 3)) {
        day.lateCut = 0.5;
        mt.lateCut += 0.5;
      }
    }

    let need = UNITS[day.status] || 0;
    if (!need) continue;
    const cover = { paid: 0, extra: 0, unpaid: 0 };
    const takePaid = () => {
      const n = Math.min(need, mt.paidEntitled - mt.paidUsed);
      if (n > 0) { cover.paid += n; mt.paidUsed += n; need -= n; }
    };
    const takeExtra = () => {
      for (const c of pool) {
        if (need <= 0) break;
        if (c.date > date || c.expiresOn < date) continue; // not earned yet / expired
        const n = Math.min(need, c.amount - c.used);
        if (n > 0) { c.used += n; cover.extra += n; mt.extraUsed += n; need -= n; }
      }
    };
    const type = day.status === 'leave' ? day.leaveType || 'paid' : 'paid';
    if (type === 'extra') { takeExtra(); takePaid(); }
    else if (type === 'paid') { takePaid(); takeExtra(); }
    if (need > 0) { cover.unpaid += need; mt.unpaid += need; }
    day.cover = cover;
  }
  return { months, credits: pool };
}

/** Extra leave still usable on `date`: earned by then, not expired, not used up. */
export const extraAvailable = (credits, date) => credits
  .filter((c) => c.date <= date && c.expiresOn >= date && c.amount - c.used > 0)
  .reduce((sum, c) => sum + c.amount - c.used, 0);

/**
 * Where the leave sums for a month must start so the extra leave carried into it is right.
 * Extra leave still usable on a day was earned in the validity period before it — and how much
 * of it is left depends on absences in that period, which may first have used even older extra
 * leave. So step back one validity period at a time while extra leave was earned in the period
 * before; once a period has none, nothing older can matter. Starts on the 1st of a month (paid
 * leave goes by month). `maxSteps` bounds the work for someone earning extra leave all year.
 * @param from         'YYYY-MM-DD' — the first day of the month being worked out
 * @param validDays    how long extra leave lasts
 * @param creditDates  dates extra leave was earned (any order)
 * @returns 'YYYY-MM-01'
 */
export function leaveChainStart(from, validDays, creditDates, maxSteps = 6) {
  let start = addDays(from, -validDays);
  for (let i = 0; i < maxSteps; i += 1) {
    const before = addDays(start, -validDays);
    if (!creditDates.some((d) => d >= before && d < start)) break;
    start = before;
  }
  return `${start.slice(0, 7)}-01`;
}
