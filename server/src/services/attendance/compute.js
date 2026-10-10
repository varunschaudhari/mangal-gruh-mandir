// Attendance calculation — pure functions (no database), so the rules are easy to test.
//
// For each employee and date we have a plan (rostered shift(s) or weekly off) and the
// machine punches. Punches are matched to the plan they belong to, then each day gets a
// status, hours worked, late minutes and extra time. Times are local (IST).
import { localDateStr } from '../../utils/dates.js';

const MIN = 60 * 1000;
const WINDOW_BEFORE_MIN = 3 * 60; // a punch up to 3 h before a shift starts belongs to it
const WINDOW_AFTER_MIN = 4 * 60;  // …and up to 4 h after it ends

export const DAY_VALUE = {         // how much of a day each status counts as present
  present: 1, on_duty: 1, worked_off: 1, half_day: 0.5,
};

const LATE_COUNTS = ['present', 'half_day', 'working', 'missing_punch'];

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Local date + minutes after its midnight → Date (minutes past 1440 roll into the next day). */
export const atLocal = (date, minutes) => {
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(y, mo - 1, d, 0, minutes);
};

export const addDays = (date, n) => {
  const [y, mo, d] = date.split('-').map(Number);
  return localDateStr(new Date(y, mo - 1, d + n));
};

export const datesBetween = (from, to) => {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};

/** When a shift worked on `date` actually starts and ends. A night shift ends next morning. */
export function shiftInstance(shift, date) {
  const s = toMinutes(shift.start);
  const e = toMinutes(shift.end);
  const start = atLocal(date, s);
  const end = atLocal(date, e <= s ? e + 1440 : e);
  return { shiftId: String(shift._id), name: shift.name, start, end, minutes: (end - start) / MIN };
}

/**
 * One block per date: the rostered shift(s) for that date, worked as one stretch
 * (day + night on the same date is a double shift). Off days and unplanned days get a
 * calendar-day block so punches on them are still noticed.
 */
export function buildBlocks(plans, shiftsById) {
  return plans.map(({ date, shifts = [], off = false, holiday = '', employed = true }) => {
    const instances = off || !employed ? [] : shifts
      .map((id) => shiftsById.get(String(id)))
      .filter(Boolean)
      .map((s) => shiftInstance(s, date))
      .sort((a, b) => a.start - b.start);
    if (!instances.length) {
      return { date, off, holiday, employed, instances, start: atLocal(date, 0), end: atLocal(date, 1440), winStart: atLocal(date, 0), winEnd: atLocal(date, 1440), weak: true };
    }
    const start = instances[0].start;
    const end = instances[instances.length - 1].end;
    return {
      date, off, holiday, employed, instances, start, end,
      winStart: new Date(start.getTime() - WINDOW_BEFORE_MIN * MIN),
      winEnd: new Date(end.getTime() + WINDOW_AFTER_MIN * MIN),
      weak: false,
    };
  });
}

/**
 * Gives every punch to the block it belongs to. Where two blocks' windows overlap
 * (last night's shift and this morning's), the punch goes to whichever shift start or
 * end it is closest to. Shift blocks win over off/unplanned days.
 * @returns {Map<string, Date[]>} date → punch times, plus key '' for unmatched punches
 */
export function assignPunches(blocks, times) {
  const byDate = new Map(blocks.map((b) => [b.date, []]));
  byDate.set('', []);
  for (const t of times) {
    const fits = blocks.filter((b) => t >= b.winStart && t < b.winEnd);
    const strong = fits.filter((b) => !b.weak);
    const pool = strong.length ? strong : fits;
    if (!pool.length) { byDate.get('').push(t); continue; }
    const distance = (b) => Math.min(Math.abs(t - b.start), Math.abs(t - b.end));
    const best = pool.reduce((a, b) => (distance(b) < distance(a) ? b : a));
    byDate.get(best.date).push(t);
  }
  return byDate;
}

/** Drops repeated punches within `mergeMinutes` of the previous one (double taps). */
export function mergePunches(times, mergeMinutes) {
  const sorted = [...times].sort((a, b) => a - b);
  return sorted.filter((t, i) => i === 0 || (t - sorted[i - 1]) / MIN > mergeMinutes);
}

/**
 * Status and hours for one block.
 * Statuses: present · half_day · absent · off · holiday · worked_off · on_duty · leave ·
 *           missing_punch · working (in, shift not over) · not_in (shift started, no punch yet) ·
 *           upcoming · unscheduled (punches on a day with no shift planned) · none ·
 *           not_employed (before joining / after leaving)
 */
export function computeDay(block, rawTimes, settings, override, now = new Date()) {
  const times = mergePunches(rawTimes, settings.punchMergeMinutes ?? 2);
  const n = block.instances.length;
  const expected = block.instances.reduce((sum, i) => sum + i.minutes, 0);
  const halfDayMin = (settings.halfDayBelowHours ?? 7) * 60;
  const absentMin = (settings.absentBelowHours ?? 4) * 60;
  const grace = settings.graceMinutes ?? 15;

  let worked = 0;
  for (let i = 0; i + 1 < times.length; i += 2) worked += (times[i + 1] - times[i]) / MIN;
  worked = Math.round(worked);

  const issues = [];
  let lateMinutes = 0;
  if (n && times.length) {
    lateMinutes = Math.max(0, Math.round((times[0] - block.instances[0].start) / MIN));
  }
  let status;
  let double = false;
  if (block.employed === false) {
    status = 'not_employed';
  } else if (block.off) {
    status = times.length ? 'worked_off' : block.holiday ? 'holiday' : 'off';
  } else if (!n) {
    status = times.length ? 'unscheduled' : 'none';
  } else if (!times.length) {
    status = now < block.start ? 'upcoming' : now < block.end ? 'not_in' : 'absent';
  } else if (times.length % 2 === 1) {
    status = now < block.winEnd ? 'working' : 'missing_punch';
    if (status === 'missing_punch') issues.push('missing_punch');
  } else if (n === 2 && worked >= halfDayMin * 2) {
    status = 'present';
    double = true;
  } else {
    // A planned double where only one shift was worked is judged as a single shift.
    if (n === 2) issues.push('double_incomplete');
    status = worked >= halfDayMin ? 'present' : worked >= absentMin ? 'half_day' : 'absent';
    if (status !== 'present') issues.push('short_hours');
  }

  const computedStatus = status;
  if (override?.status && status !== 'not_employed') status = override.status;

  // A late mark only counts on a day that was actually worked (not on leave, off, on duty…)
  const late = lateMinutes > grace && !override?.waiveLate && LATE_COUNTS.includes(status);
  const counted = ['present', 'worked_off'].includes(status);
  return {
    date: block.date,
    shifts: block.instances.map((i) => i.shiftId),
    off: block.off,
    status,
    computedStatus,
    overridden: Boolean(override?.status),
    firstIn: times[0] || null,
    lastOut: times.length > 1 ? times[times.length - 1] : null,
    punches: times,
    workedMinutes: worked,
    expectedMinutes: expected,
    extraMinutes: counted ? Math.max(0, worked - expected) : 0,
    lateMinutes: late ? lateMinutes : 0,
    lateWaived: Boolean(override?.waiveLate && lateMinutes > grace),
    double,
    issues,
    holiday: block.holiday || '',
    leaveType: status === 'leave' ? override?.leaveType || 'paid' : null,
    note: override?.note || '',
  };
}

/**
 * Days for one employee over [from, to]. The day before `from` and after `to` are
 * included when matching punches, so a night shift that ends after midnight is counted
 * on the date it started.
 * @param plans array of { date, shifts, off } covering from-1 … to+1
 * @param times punch times (Date[]) for that period
 * @param overrides Map date → override
 */
export function computeRange({ from, to, plans, times, shiftsById, settings, overrides = new Map(), now = new Date(), withRaw = false }) {
  const blocks = buildBlocks(plans, shiftsById);
  const assigned = assignPunches(blocks, times);
  const days = {};
  for (const block of blocks) {
    if (block.date < from || block.date > to) continue;
    days[block.date] = computeDay(block, assigned.get(block.date) || [], settings, overrides.get(block.date), now);
    // For the day-detail screen: every punch given to this day (before merging) and its window
    if (withRaw) Object.assign(days[block.date], { raw: assigned.get(block.date) || [], window: [block.winStart, block.winEnd] });
  }
  return { days, unmatched: assigned.get('') || [] };
}

/** Month/period totals for the register. */
export function summarise(days) {
  const t = {
    present: 0, halfDays: 0, absent: 0, off: 0, holidays: 0, leave: 0, workedOff: 0, onDuty: 0, late: 0,
    missingPunch: 0, notEmployed: 0, doubles: 0, extraMinutes: 0, presentValue: 0,
  };
  for (const d of Object.values(days)) {
    if (d.status === 'present') t.present += 1;
    if (d.status === 'half_day') t.halfDays += 1;
    if (d.status === 'absent') t.absent += 1;
    if (d.status === 'off') t.off += 1;
    if (d.status === 'holiday') t.holidays += 1;
    if (d.status === 'leave') t.leave += 1;
    if (d.status === 'not_employed') t.notEmployed += 1;
    if (d.status === 'worked_off') t.workedOff += 1;
    if (d.status === 'on_duty') t.onDuty += 1;
    if (d.status === 'missing_punch') t.missingPunch += 1;
    if (d.lateMinutes > 0) t.late += 1;
    if (d.double) t.doubles += 1;
    t.extraMinutes += d.extraMinutes;
    t.presentValue += DAY_VALUE[d.status] || 0;
  }
  return t;
}
