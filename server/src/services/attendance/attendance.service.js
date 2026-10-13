import AttendanceSettings from '../../models/AttendanceSettings.js';
import AttendanceOverride from '../../models/AttendanceOverride.js';
import AttendanceMonth from '../../models/AttendanceMonth.js';
import DoubleShift from '../../models/DoubleShift.js';
import Punch from '../../models/Punch.js';
import RosterDay from '../../models/RosterDay.js';
import SalaryRun from '../../models/SalaryRun.js';
import Staff from '../../models/Staff.js';
import ApiError from '../../utils/ApiError.js';
import { localDateStr } from '../../utils/dates.js';
import { addDays, atLocal, computeRange, datesBetween, summarise } from './compute.js';
import { allocateLeave, extraAvailable, leaveChainStart } from './leave.js';

const weekday = (date) => atLocal(date, 0).getDay();

// ── Months frozen by salary ───────────────────────────────────────────────────
// Once a month's salary is finalised (or paid) its attendance is frozen: the payslips were made
// from it, and the leave carried into later months depends on it. Reopening the salary (draft
// again) unfreezes it; a paid month stays frozen.

/** 'finalized' | 'paid' | null — the salary state that freezes this month's attendance. */
export async function salaryLock(month) {
  const run = await SalaryRun.findOne({ month, status: { $in: ['finalized', 'paid'] } }).select('status').lean();
  return run?.status || null;
}

/** Refuses (409) a change touching any of `dates` (YYYY-MM-DD or YYYY-MM) in a frozen month. */
export async function assertAttendanceOpen(dates) {
  const months = [...new Set(dates.filter(Boolean).map((d) => String(d).slice(0, 7)))];
  if (!months.length) return;
  const run = await SalaryRun.findOne({ month: { $in: months }, status: { $in: ['finalized', 'paid'] } })
    .select('month status').sort({ month: 1 }).lean();
  if (!run) return;
  throw new ApiError(409, run.status === 'paid'
    ? 'Salary for this month is already paid — its attendance can no longer be changed'
    : 'Salary for this month is finalised — reopen it in Salary → Monthly Salary to change its attendance',
  [{ code: 'MONTH_LOCKED', month: run.month, status: run.status }]);
}
const dayStr = (d) => (d ? localDateStr(new Date(d)) : null);

/** date → was this person employed that day (the current stint or an earlier one)? */
export function employment(staff) {
  const stints = [{ joinDate: staff.joinDate, leftOn: staff.leftOn }, ...(staff.pastPeriods || [])]
    .map((p) => [dayStr(p.joinDate), dayStr(p.leftOn)]);
  return (date) => stints.some(([joined, left]) => (!joined || date >= joined) && (!left || date <= left));
}

export const monthRange = (month) => {
  const [y, m] = month.split('-').map(Number);
  return { from: `${month}-01`, to: localDateStr(new Date(y, m, 0)) };
};

/** The shift used when nobody has planned a day: the employee's default, else the first day/night shift. */
export function defaultShiftFor(staff, shifts) {
  const own = shifts.find((s) => String(s._id) === String(staff.defaultShift));
  if (own) return own;
  return shifts.find((s) => s.kind === (staff.nightOnly ? 'night' : 'day')) || shifts[0] || null;
}

/**
 * Plans for each staff × date: the roster entry, or the employee's default week. Holidays are
 * days off for everyone not rostered; days before joining / after leaving are marked.
 */
export async function resolvePlans(staffList, from, to, settings) {
  const dates = datesBetween(from, to);
  const ids = staffList.map((s) => s._id);
  const entries = await RosterDay.find({ staff: { $in: ids }, date: { $gte: from, $lte: to } }).lean();
  const byKey = new Map(entries.map((e) => [`${e.staff}|${e.date}`, e]));
  const holidays = new Map((settings.holidays || []).map((h) => [h.date, h.name || 'Holiday']));
  const declaredAt = new Map((settings.holidays || []).map((h) => [h.date, h.addedAt ? new Date(h.addedAt) : null]));

  const plans = new Map();
  for (const staff of staffList) {
    const fallback = defaultShiftFor(staff, settings.shifts);
    const employedOn = employment(staff);
    plans.set(String(staff._id), dates.map((date) => {
      const employed = employedOn(date);
      const holiday = holidays.get(date) || '';
      const e = byKey.get(`${staff._id}|${date}`);
      // A roster entry made before the holiday was declared doesn't cancel it
      const rosteredOnHoliday = e && holiday && declaredAt.get(date) && !(new Date(e.updatedAt) > declaredAt.get(date));
      if (e && !rosteredOnHoliday) return { date, shifts: e.shifts.map(String), off: e.off, planned: true, holiday, employed };
      const off = Boolean(holiday) || weekday(date) === (staff.weeklyOffDay ?? 0);
      return { date, shifts: off || !fallback ? [] : [String(fallback._id)], off, planned: false, holiday, employed };
    }));
  }
  return plans;
}

/**
 * Staff whose attendance matters in [from, to]: active ones, anyone who left during it, and
 * anyone with an earlier stint in it (taken back later).
 */
const staffFilter = (from, to) => {
  const start = atLocal(from, 0);
  const end = atLocal(addDays(to, 1), 0);
  return {
    $or: [
      {
        $and: [
          { $or: [{ isActive: true }, { leftOn: { $gte: start } }] },
          { $or: [{ joinDate: null }, { joinDate: { $lt: end } }] },
        ],
      },
      { pastPeriods: { $elemMatch: { joinDate: { $lt: end }, leftOn: { $gte: start } } } },
    ],
  };
};

/**
 * Attendance for staff over [from, to]: per-day results and per-person totals.
 * @param {{ from: string, to: string, staffIds?: string[], includeInactive?: boolean }} q
 */
export async function computeAttendance({ from, to, staffIds, includeInactive = false, now = new Date(), withRaw = false, settings: given }) {
  const settings = given || await AttendanceSettings.getOrCreate();
  const filter = staffIds?.length ? { _id: { $in: staffIds } } : includeInactive ? {} : staffFilter(from, to);
  const staffList = await Staff.find(filter).sort({ name: 1 }).lean();
  const ids = staffList.map((s) => s._id);

  const padFrom = addDays(from, -1);
  const padTo = addDays(to, 1);
  const [plans, punches, overrides] = await Promise.all([
    resolvePlans(staffList, padFrom, padTo, settings),
    Punch.find({
      staff: { $in: ids }, ignored: false,
      time: { $gte: atLocal(padFrom, 0), $lt: atLocal(addDays(padTo, 1), 0) },
    }).select('staff time').lean(),
    AttendanceOverride.find({ staff: { $in: ids }, date: { $gte: from, $lte: to } }).lean(),
  ]);

  const timesByStaff = new Map();
  for (const p of punches) {
    const k = String(p.staff);
    if (!timesByStaff.has(k)) timesByStaff.set(k, []);
    timesByStaff.get(k).push(p.time);
  }
  const overridesByStaff = new Map();
  for (const o of overrides) {
    const k = String(o.staff);
    if (!overridesByStaff.has(k)) overridesByStaff.set(k, new Map());
    overridesByStaff.get(k).set(o.date, o);
  }

  const shiftsById = new Map(settings.shifts.map((s) => [String(s._id), s]));
  const days = {};
  const totals = {};
  const planned = {};
  for (const staff of staffList) {
    const k = String(staff._id);
    const staffPlans = plans.get(k);
    const result = computeRange({
      from, to, plans: staffPlans, times: timesByStaff.get(k) || [],
      shiftsById, settings, overrides: overridesByStaff.get(k), now, withRaw,
    });
    days[k] = result.days;
    totals[k] = summarise(result.days);
    planned[k] = Object.fromEntries(staffPlans.filter((p) => p.date >= from && p.date <= to).map((p) => [p.date, p.planned]));
  }

  return { settings, staff: staffList, days, totals, planned };
}

/**
 * One month with leave worked out: each absent day knows whether paid leave, extra leave or
 * nothing covered it, late penalties are applied, double shifts carry management's decision,
 * and every person gets the month's balances and paid days for salary.
 */
export async function computeMonth({ month, staffIds, now = new Date(), withRaw = false }) {
  const settings = await AttendanceSettings.getOrCreate();
  const { from, to } = monthRange(month);
  // Extra leave earned before this month can still be used in it, and how much of it is left
  // depends on absences before — so the sums start early enough to know (leaveChainStart).
  const valid = settings.extraLeaveValidDays || 60;
  const earned = await DoubleShift.find({
    decision: 'extra_leave', date: { $gte: addDays(from, -valid * 8), $lt: from },
    ...(staffIds?.length ? { staff: { $in: staffIds } } : {}),
  }).select('date').lean();
  const chainFrom = leaveChainStart(from, valid, earned.map((d) => d.date));
  const base = await computeAttendance({ from: chainFrom, to, staffIds, now, withRaw, settings });
  const ids = base.staff.map((s) => s._id);
  const [decisions, adjustments] = await Promise.all([
    DoubleShift.find({ staff: { $in: ids }, date: { $gte: chainFrom, $lte: to } }).populate('by', 'name').lean(),
    AttendanceMonth.find({ staff: { $in: ids }, month }).lean(),
  ]);

  const today = localDateStr(now);
  const refDate = to < today ? to : today;
  const daysInMonth = datesBetween(from, to).length;
  const days = {};
  const totals = {};
  const planned = {};
  const leave = {};
  // The sums start before the month — leave out anyone who had already left by its start
  const staff = staffIds?.length ? base.staff
    : base.staff.filter((s) => !s.leftOn || dayStr(s.leftOn) >= from || (s.pastPeriods || []).some((p) => dayStr(p.leftOn) >= from));

  for (const s of staff) {
    const k = String(s._id);
    const allDays = base.days[k];
    const mine = decisions.filter((d) => String(d.staff) === k);
    const decisionOn = new Map(mine.map((d) => [d.date, d]));
    // A decision only gives extra leave while that day is still a double shift
    const credits = mine
      .filter((d) => d.decision === 'extra_leave' && allDays[d.date]?.double)
      .map((d) => ({ date: d.date, expiresOn: d.expiresOn, amount: 1 }));
    const entitlement = s.paidLeavePerMonth ?? settings.defaultPaidLeavePerMonth ?? 3;
    const result = allocateLeave({ days: allDays, entitlement, credits, latePenalty: settings.latePenalty });

    const monthDays = Object.fromEntries(Object.entries(allDays).filter(([d]) => d >= from));
    for (const day of Object.values(monthDays)) {
      if (!day.double) continue;
      const d = decisionOn.get(day.date);
      day.decision = d ? { decision: d.decision, amount: d.amount, note: d.note, by: d.by?.name || '', expiresOn: d.expiresOn } : null;
    }
    const doubles = Object.values(monthDays).filter((d) => d.double);
    const mt = result.months[month] || { paidEntitled: entitlement, paidUsed: 0, extraUsed: 0, unpaid: 0, lateMarks: 0, lateCut: 0 };
    const t = summarise(monthDays);
    const adj = adjustments.find((a) => String(a.staff) === k);
    const overtimeDoubles = doubles.reduce((sum, d) => sum + (d.decision?.decision === 'overtime' ? d.decision.amount : 0), 0);

    days[k] = monthDays;
    totals[k] = t;
    planned[k] = Object.fromEntries(Object.entries(base.planned[k]).filter(([d]) => d >= from));
    leave[k] = {
      ...mt,
      paidLeft: mt.paidEntitled - mt.paidUsed,
      extraAvailable: extraAvailable(result.credits, refDate),
      credits: result.credits
        .filter((c) => c.expiresOn >= from)
        .map((c) => ({ ...c, remaining: c.amount - c.used, expired: c.expiresOn < refDate })),
      pendingDoubles: doubles.filter((d) => !d.decision).length,
      overtime: {
        doubles: overtimeDoubles,
        monthly: adj?.overtimeAmount || 0,
        note: adj?.note || '',
        total: overtimeDoubles + (adj?.overtimeAmount || 0),
      },
      daysInMonth,
      // Salary = monthly salary ÷ days in month × paid days
      paidDays: daysInMonth - mt.unpaid - mt.lateCut - t.notEmployed,
      reviewDays: t.missingPunch,
    };
  }

  return { settings, staff, from, to, days, totals, planned, leave };
}
