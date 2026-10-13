import mongoose from 'mongoose';
import AttendanceSettings from '../models/AttendanceSettings.js';
import AttendanceOverride, { LEAVE_TYPES, OVERRIDE_STATUSES } from '../models/AttendanceOverride.js';
import AttendanceMonth from '../models/AttendanceMonth.js';
import DoubleShift, { DOUBLE_DECISIONS } from '../models/DoubleShift.js';
import Punch from '../models/Punch.js';
import RosterDay from '../models/RosterDay.js';
import Staff from '../models/Staff.js';
import { addDays, atLocal, datesBetween } from '../services/attendance/compute.js';
import { assertAttendanceOpen, computeAttendance, computeMonth, resolvePlans, salaryLock } from '../services/attendance/attendance.service.js';
import { localDateStr } from '../utils/dates.js';
import { writeRegisterExcel } from '../services/attendance/registerExcel.js';
import { parseAllowedIps } from '../services/attendance/adms.js';
import { logAction } from '../services/audit.service.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { SALARY_HIDDEN, userCan } from '../services/staffProfile.service.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const MAX_RANGE_DAYS = 62;

const monthParam = (value) => {
  if (!MONTH.test(String(value || ''))) throw new ApiError(400, 'month must be YYYY-MM');
  return value;
};

const dateParam = (value, name) => {
  if (!DATE.test(String(value || ''))) throw new ApiError(400, `${name} must be YYYY-MM-DD`);
  return value;
};

const rangeParams = (q) => {
  const from = dateParam(q.from, 'from');
  const to = dateParam(q.to, 'to');
  if (to < from) throw new ApiError(400, 'to must not be before from');
  if (datesBetween(from, to).length > MAX_RANGE_DAYS) throw new ApiError(400, `At most ${MAX_RANGE_DAYS} days at a time`);
  return { from, to };
};

// ── Settings (shift timings, rules, machines) ────────────────────────────────

// The machine's serial number is what it signs in with — only those who manage attendance see it.
export const getAttendanceSettings = asyncHandler(async (req, res) => {
  const settings = (await AttendanceSettings.getOrCreate()).toObject();
  if (!(await userCan(req, 'attendance:manage'))) {
    settings.devices = settings.devices.map((d) => ({
      serial: `••••${String(d.serial).slice(-3)}`, name: d.name, approved: d.approved, lastSeenAt: d.lastSeenAt,
    }));
  }
  res.json(new ApiResponse(200, settings));
});

const DAY_RULES = ['graceMinutes', 'halfDayBelowHours', 'absentBelowHours', 'punchMergeMinutes'];
const timingKey = (s) => `${s.start}|${s.end}|${s.kind}`;
const monthsFrom = (date, today) => {
  const out = [];
  for (let m = date.slice(0, 7); m <= today.slice(0, 7); m = addDays(`${m}-28`, 7).slice(0, 7)) out.push(m);
  return out;
};

// A shift that days were worked on (roster, someone's usual shift, or the usual shift of those
// who have none set) can't be removed — the days already worked would lose it.
async function assertShiftUnused(shift, shifts) {
  const used = await RosterDay.exists({ shifts: shift._id }) || await Staff.exists({ defaultShift: shift._id });
  const fallbackFor = ['day', 'night'].filter((kind) => String(shifts.find((x) => x.kind === kind)?._id) === String(shift._id));
  const asFallback = fallbackFor.length && await Staff.exists({
    onPayroll: true, defaultShift: null, ...(fallbackFor.length === 1 ? { nightOnly: fallbackFor[0] === 'night' } : {}),
  });
  if (used || asFallback) {
    throw new ApiError(400, 'A shift that is used in the roster or as someone’s usual shift can’t be removed — change its timings instead');
  }
}

/**
 * Shift timings and day rules apply from `effectiveFrom` (default today): the old ones are kept
 * for the days before, so a summer timing or a new grace period never re-marks past days.
 */
export const updateAttendanceSettings = asyncHandler(async (req, res) => {
  const settings = await AttendanceSettings.getOrCreate();
  const b = req.body || {};
  const today = localDateStr();
  const effectiveFrom = b.effectiveFrom === undefined || b.effectiveFrom === '' ? today : dateParam(b.effectiveFrom, 'effectiveFrom');
  const until = addDays(effectiveFrom, -1);
  const laterThanLast = (past) => !past.length || until > past[past.length - 1].until;
  let historyChanged = false;

  if (b.shifts !== undefined) {
    if (!Array.isArray(b.shifts) || !b.shifts.length) throw new ApiError(400, 'Keep at least one shift');
    const before = new Map(settings.shifts.map((s) => [String(s._id), s]));
    // Keep existing shift ids so rosters and staff defaults still point at them.
    const next = b.shifts.map((s) => {
      const id = s._id && mongoose.isValidObjectId(s._id) ? s._id : null;
      const old = id ? before.get(String(id)) : null;
      const past = (old?.past || []).map((p) => ({ until: p.until, start: p.start, end: p.end, kind: p.kind }));
      if (old && timingKey(old) !== timingKey(s)) {
        if (!laterThanLast(past)) throw new ApiError(400, 'These timings were already changed from a later date — the new change must start after that');
        past.push({ until, start: old.start, end: old.end, kind: old.kind });
        historyChanged = true;
      }
      return { ...(id ? { _id: id } : {}), name: s.name, start: s.start, end: s.end, kind: s.kind, short: s.short, color: s.color, past };
    });
    for (const old of settings.shifts) {
      if (!next.some((n) => n._id && String(n._id) === String(old._id))) await assertShiftUnused(old, settings.shifts);
    }
    settings.shifts = next;
  }
  const oldRules = Object.fromEntries(DAY_RULES.map((k) => [k, settings[k]]));
  for (const k of ['graceMinutes', 'halfDayBelowHours', 'absentBelowHours', 'punchMergeMinutes',
    'defaultPaidLeavePerMonth', 'extraLeaveValidDays']) {
    if (b[k] !== undefined) settings[k] = Number(b[k]);
  }
  if (DAY_RULES.some((k) => Number(settings[k]) !== Number(oldRules[k]))) {
    const past = settings.rulesPast || [];
    if (!laterThanLast(past)) throw new ApiError(400, 'These rules were already changed from a later date — the new change must start after that');
    settings.rulesPast.push({ until, ...oldRules });
    historyChanged = true;
  }
  // Changes from a past date reach back into those months: not into a month whose salary is done
  if (historyChanged) await assertAttendanceOpen(monthsFrom(effectiveFrom, today));
  if (b.latePenalty) {
    if (b.latePenalty.enabled !== undefined) settings.latePenalty.enabled = Boolean(b.latePenalty.enabled);
    if (b.latePenalty.freeLates !== undefined) settings.latePenalty.freeLates = Number(b.latePenalty.freeLates);
  }
  if (Array.isArray(b.devices)) {
    // Machines register themselves; here admins only name, approve or remove them.
    const wanted = new Map(b.devices.map((d) => [d.serial, d]));
    settings.devices = settings.devices
      .filter((d) => wanted.has(d.serial))
      .map((d) => {
        const w = wanted.get(d.serial);
        let allowedIps = d.allowedIps || '';
        if (w.allowedIps !== undefined) {
          try { allowedIps = parseAllowedIps(w.allowedIps).join(', '); } catch (err) { throw new ApiError(400, err.message); }
        }
        return { ...d.toObject(), name: w.name ?? d.name, approved: Boolean(w.approved), allowedIps };
      });
  }
  if (Array.isArray(b.holidays)) {
    const known = new Map(settings.holidays.map((h) => [h.date, h.addedAt]));
    const byDate = new Map();
    for (const h of b.holidays) {
      dateParam(h.date, 'Holiday date');
      byDate.set(h.date, { date: h.date, name: String(h.name || '').trim().slice(0, 60), addedAt: known.get(h.date) || new Date() });
    }
    settings.holidays = [...byDate.values()].sort((a, c) => a.date.localeCompare(c.date));
  }
  if (Number(settings.absentBelowHours) > Number(settings.halfDayBelowHours)) {
    throw new ApiError(400, 'The absent threshold must be lower than the half-day threshold');
  }
  await settings.save();
  logAction(req, {
    action: 'attendance.settings_update', entity: 'AttendanceSettings', entityId: 'attendance', entityRef: settings._id,
    meta: historyChanged ? { effectiveFrom } : undefined,
  });
  res.json(new ApiResponse(200, settings, 'Attendance settings saved'));
});

// ── Staff register ───────────────────────────────────────────────────────────
// People are added and changed in Users (with their attendance & payroll details); this is
// the list of those on attendance.

export const listStaff = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.active !== undefined) filter.isActive = req.query.active === 'true';
  const hide = (await userCan(req, 'salary:read')) ? '' : SALARY_HIDDEN;
  const staff = await Staff.find(filter).select(hide).populate('department', 'name').populate('user', 'name email isActive').sort({ name: 1 }).lean();
  res.json(new ApiResponse(200, staff));
});

export const getStaff = asyncHandler(async (req, res) => {
  const hide = (await userCan(req, 'salary:read')) ? '' : SALARY_HIDDEN;
  const staff = await Staff.findById(req.params.id).select(hide).populate('department', 'name').populate('user', 'name email');
  if (!staff) throw new ApiError(404, 'Staff not found');
  res.json(new ApiResponse(200, staff));
});

// Machine numbers that have punches but no staff record yet.
export const unmappedMachineIds = asyncHandler(async (req, res) => {
  const rows = await Punch.aggregate([
    { $match: { staff: null } },
    { $group: { _id: '$machineId', count: { $sum: 1 }, last: { $max: '$time' } } },
    { $sort: { last: -1 } },
  ]);
  res.json(new ApiResponse(200, rows.map((r) => ({ machineId: r._id, count: r.count, last: r.last }))));
});

// ── Weekly roster ────────────────────────────────────────────────────────────

export const getRoster = asyncHandler(async (req, res) => {
  const { from, to } = rangeParams(req.query);
  const settings = await AttendanceSettings.getOrCreate();
  const staff = await Staff.find({ isActive: true }).sort({ name: 1 }).select('name staffCode designation nightOnly defaultShift weeklyOffDay doubleShiftEligible joinDate leftOn').lean();
  const plans = await resolvePlans(staff, from, to, settings);
  const cells = {};
  for (const [id, list] of plans) cells[id] = Object.fromEntries(list.map(({ date, ...p }) => [date, p]));
  const holidays = settings.holidays.filter((h) => h.date >= from && h.date <= to);
  res.json(new ApiResponse(200, { from, to, dates: datesBetween(from, to), shifts: settings.shifts, holidays, staff, cells }));
});

export const saveRoster = asyncHandler(async (req, res) => {
  const entries = req.body?.entries;
  if (!Array.isArray(entries) || !entries.length) throw new ApiError(400, 'entries required');
  if (entries.length > 1000) throw new ApiError(400, 'Too many entries at once');
  entries.forEach((e) => dateParam(e?.date, 'date'));
  await assertAttendanceOpen(entries.map((e) => e.date));
  const settings = await AttendanceSettings.getOrCreate();
  const shiftIds = new Set(settings.shifts.map((s) => String(s._id)));

  const ops = entries.map((e) => {
    dateParam(e.date, 'date');
    if (!mongoose.isValidObjectId(e.staff)) throw new ApiError(400, 'Invalid staff');
    // reset → back to the employee's default week
    if (e.reset) return { deleteOne: { filter: { staff: e.staff, date: e.date } } };
    const shifts = e.off ? [] : (e.shifts || []).map(String);
    if (shifts.some((s) => !shiftIds.has(s))) throw new ApiError(400, 'Unknown shift');
    if (shifts.length > 2) throw new ApiError(400, 'At most two shifts a day');
    return {
      updateOne: {
        filter: { staff: e.staff, date: e.date },
        update: { $set: { shifts, off: Boolean(e.off), updatedBy: req.user._id } },
        upsert: true,
      },
    };
  });
  await RosterDay.bulkWrite(ops);
  res.json(new ApiResponse(200, { saved: ops.length }, 'Roster saved'));
});

// Copies one week (Mon–Sun) of the roster — including default days — onto another week.
export const copyRosterWeek = asyncHandler(async (req, res) => {
  const fromStart = dateParam(req.body?.fromWeekStart, 'fromWeekStart');
  const toStart = dateParam(req.body?.toWeekStart, 'toWeekStart');
  await assertAttendanceOpen([toStart, addDays(toStart, 6)]);
  const settings = await AttendanceSettings.getOrCreate();
  const staff = await Staff.find({ isActive: true }).lean();
  const plans = await resolvePlans(staff, fromStart, addDays(fromStart, 6), settings);
  const holidays = new Set(settings.holidays.map((h) => h.date));
  const ops = [];
  for (const [staffId, list] of plans) {
    list.forEach((p, i) => {
      const filter = { staff: staffId, date: addDays(toStart, i) };
      // Days that followed the default there follow it here too (so a holiday isn't copied), and a
      // holiday in the week copied to stays a holiday
      ops.push(p.planned && !holidays.has(filter.date)
        ? { updateOne: { filter, update: { $set: { shifts: p.shifts, off: p.off, updatedBy: req.user._id } }, upsert: true } }
        : { deleteOne: { filter } });
    });
  }
  if (ops.length) await RosterDay.bulkWrite(ops);
  res.json(new ApiResponse(200, { saved: ops.length }, 'Roster copied'));
});

// ── Attendance (computed) ────────────────────────────────────────────────────

export const getAttendanceDays = asyncHandler(async (req, res) => {
  const { from, to } = rangeParams(req.query);
  const staffIds = req.query.staff ? String(req.query.staff).split(',').filter(mongoose.isValidObjectId) : undefined;
  const { settings, staff, days, totals, planned } = await computeAttendance({ from, to, staffIds });
  res.json(new ApiResponse(200, {
    from, to, dates: datesBetween(from, to), shifts: settings.shifts,
    latePenalty: settings.latePenalty,
    staff: staff.map((s) => ({ _id: s._id, name: s.name, staffCode: s.staffCode, designation: s.designation, machineId: s.machineId })),
    days, totals, planned,
  }));
});

const staffSummary = (s) => ({
  _id: s._id, name: s.name, staffCode: s.staffCode, designation: s.designation, machineId: s.machineId,
  doubleShiftEligible: s.doubleShiftEligible, isActive: s.isActive,
});

// A whole month with leave balances, late penalties, double-shift decisions and paid days.
export const getMonth = asyncHandler(async (req, res) => {
  const month = monthParam(req.query.month);
  const staffIds = req.query.staff ? String(req.query.staff).split(',').filter(mongoose.isValidObjectId) : undefined;
  const [{ settings, staff, from, to, days, totals, planned, leave }, locked] = await Promise.all([
    computeMonth({ month, staffIds }), salaryLock(month),
  ]);
  res.json(new ApiResponse(200, {
    month, from, to, dates: datesBetween(from, to), shifts: settings.shifts, locked,
    holidays: settings.holidays.filter((h) => h.date >= from && h.date <= to),
    latePenalty: settings.latePenalty,
    staff: staff.map(staffSummary),
    days, totals, planned, leave,
  }));
});

export const exportRegister = asyncHandler(async (req, res) => {
  const month = monthParam(req.query.month);
  const { staff, from, to, days, totals, leave } = await computeMonth({ month });
  const label = new Date(`${from}T12:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  await writeRegisterExcel(res, { title: `Attendance ${label}`, dates: datesBetween(from, to), staff, days, totals, leave });
});

// One person's day in detail: computed result, every punch (incl. ignored) and the override.
export const getStaffDay = asyncHandler(async (req, res) => {
  const date = dateParam(req.params.date, 'date');
  if (!mongoose.isValidObjectId(req.params.staffId)) throw new ApiError(400, 'Invalid staff');
  // Through the month's sums, so the day shows which leave covered it and any late penalty
  const { staff, days, leave } = await computeMonth({ month: date.slice(0, 7), staffIds: [req.params.staffId], withRaw: true });
  if (!staff.length) throw new ApiError(404, 'Staff not found');
  const { raw, window, ...day } = days[req.params.staffId][date];
  const { credits: _credits, ...balance } = leave[req.params.staffId];
  const [all, override] = await Promise.all([
    Punch.find({
      staff: req.params.staffId,
      time: { $gte: atLocal(addDays(date, -1), 0), $lt: atLocal(addDays(date, 2), 0) },
    }).populate('by', 'name').sort({ time: 1 }).lean(),
    AttendanceOverride.findOne({ staff: req.params.staffId, date }).populate('by', 'name').lean(),
  ]);
  const locked = await salaryLock(date.slice(0, 7));
  // Only this day's punches (a night shift's morning punch belongs to the day before);
  // ignored ones are shown when they fall inside this day's window.
  const mine = new Set(raw.map((t) => t.getTime()));
  const punches = all.filter((p) => (p.ignored ? p.time >= window[0] && p.time <= window[1] : mine.has(p.time.getTime())));
  res.json(new ApiResponse(200, { staff: staffSummary(staff[0]), day, punches, override, balance, locked }));
});

// ── Supervisor fixes ─────────────────────────────────────────────────────────

export const addManualPunch = asyncHandler(async (req, res) => {
  const { staff: staffId, time, reason, day } = req.body || {};
  if (!reason?.trim()) throw new ApiError(400, 'A reason is required');
  const staff = await Staff.findById(staffId);
  if (!staff) throw new ApiError(404, 'Staff not found');
  const when = new Date(time);
  if (Number.isNaN(when.getTime())) throw new ApiError(400, 'Invalid time');
  if (when > new Date(Date.now() + 5 * 60 * 1000)) throw new ApiError(400, 'Time cannot be in the future');
  await assertAttendanceOpen([localDateStr(when), DATE.test(String(day || '')) ? day : null]);
  const punch = await Punch.create({
    machineId: staff.machineId || `manual:${staff._id}`, staff: staff._id, time: when,
    source: 'manual', reason: reason.trim(), by: req.user._id,
  });
  logAction(req, { action: 'attendance.punch_add', entity: 'Staff', entityId: staff.staffCode, entityRef: staff._id, meta: { time: when, reason } });
  res.status(201).json(new ApiResponse(201, punch, 'Punch added'));
});

// Machine punches are never deleted — marked ignored with a reason. Manual ones can be removed.
export const ignorePunch = asyncHandler(async (req, res) => {
  const punch = await Punch.findById(req.params.id);
  if (!punch) throw new ApiError(404, 'Punch not found');
  const day = req.body?.day;
  await assertAttendanceOpen([localDateStr(punch.time), DATE.test(String(day || '')) ? day : null]);
  if (punch.source === 'manual') {
    await punch.deleteOne();
    logAction(req, { action: 'attendance.punch_remove', entity: 'Punch', entityId: String(punch._id), entityRef: punch.staff });
    return res.json(new ApiResponse(200, null, 'Punch removed'));
  }
  const reason = String(req.body?.reason || '').trim();
  const ignored = req.body?.ignored !== false;
  if (ignored && !reason) throw new ApiError(400, 'A reason is required');
  punch.ignored = ignored;
  punch.reason = ignored ? reason : '';
  punch.by = req.user._id;
  await punch.save();
  logAction(req, { action: ignored ? 'attendance.punch_ignore' : 'attendance.punch_restore', entity: 'Punch', entityId: String(punch._id), entityRef: punch.staff, meta: { reason } });
  res.json(new ApiResponse(200, punch, ignored ? 'Punch ignored' : 'Punch restored'));
});

export const setOverride = asyncHandler(async (req, res) => {
  const { staff, date, status, waiveLate, note, leaveType } = req.body || {};
  dateParam(date, 'date');
  if (!mongoose.isValidObjectId(staff)) throw new ApiError(400, 'Invalid staff');
  if (status && !OVERRIDE_STATUSES.includes(status)) throw new ApiError(400, 'Invalid status');
  if (status === 'leave' && !LEAVE_TYPES.includes(leaveType || 'paid')) throw new ApiError(400, 'Invalid leave type');
  if (!note?.trim()) throw new ApiError(400, 'A note is required');
  await assertAttendanceOpen([date]);
  if (!status && !waiveLate) {
    await AttendanceOverride.deleteOne({ staff, date });
    return res.json(new ApiResponse(200, null, 'Override removed'));
  }
  const override = await AttendanceOverride.findOneAndUpdate(
    { staff, date },
    {
      $set: {
        ...(status ? { status } : {}),
        ...(status === 'leave' ? { leaveType: leaveType || 'paid' } : {}),
        waiveLate: Boolean(waiveLate), note: note.trim(), by: req.user._id,
      },
      $unset: { ...(status ? {} : { status: 1 }), ...(status === 'leave' ? {} : { leaveType: 1 }) },
    },
    { upsert: true, returnDocument: 'after', runValidators: true },
  );
  logAction(req, { action: 'attendance.override', entity: 'Staff', entityId: date, entityRef: staff, meta: { status, leaveType, waiveLate, note } });
  res.json(new ApiResponse(200, override, 'Saved'));
});

export const removeOverride = asyncHandler(async (req, res) => {
  dateParam(req.params.date, 'date');
  if (!mongoose.isValidObjectId(req.params.staffId)) throw new ApiError(400, 'Invalid staff');
  await assertAttendanceOpen([req.params.date]);
  await AttendanceOverride.deleteOne({ staff: req.params.staffId, date: req.params.date });
  logAction(req, { action: 'attendance.override_remove', entity: 'Staff', entityId: req.params.date, entityRef: req.params.staffId });
  res.json(new ApiResponse(200, null, 'Override removed'));
});

// ── Management decisions (double shifts, overtime) ───────────────────────────

// Reward for a double shift: one extra leave (valid for extraLeaveValidDays), an overtime
// amount, or nothing.
export const setDoubleDecision = asyncHandler(async (req, res) => {
  const { staff, date, decision, amount, note } = req.body || {};
  dateParam(date, 'date');
  if (!mongoose.isValidObjectId(staff)) throw new ApiError(400, 'Invalid staff');
  if (!DOUBLE_DECISIONS.includes(decision)) throw new ApiError(400, 'Invalid decision');
  const rupees = Number(amount);
  if (decision === 'overtime' && !(rupees > 0)) throw new ApiError(400, 'Enter the overtime amount');
  await assertAttendanceOpen([date]);
  const { settings, days } = await computeAttendance({ from: date, to: date, staffIds: [staff] });
  if (!days[staff]?.[date]?.double) throw new ApiError(400, 'That day is not a double shift');

  const doc = await DoubleShift.findOneAndUpdate(
    { staff, date },
    {
      $set: {
        decision,
        amount: decision === 'overtime' ? rupees : 0,
        note: String(note || '').trim(),
        by: req.user._id,
        ...(decision === 'extra_leave' ? { expiresOn: addDays(date, settings.extraLeaveValidDays || 60) } : {}),
      },
      ...(decision === 'extra_leave' ? {} : { $unset: { expiresOn: 1 } }),
    },
    { upsert: true, returnDocument: 'after', runValidators: true },
  );
  logAction(req, { action: 'attendance.double_decision', entity: 'Staff', entityId: date, entityRef: staff, meta: { decision, amount: doc.amount } });
  res.json(new ApiResponse(200, doc, 'Saved'));
});

export const clearDoubleDecision = asyncHandler(async (req, res) => {
  dateParam(req.params.date, 'date');
  if (!mongoose.isValidObjectId(req.params.staffId)) throw new ApiError(400, 'Invalid staff');
  await assertAttendanceOpen([req.params.date]);
  await DoubleShift.deleteOne({ staff: req.params.staffId, date: req.params.date });
  logAction(req, { action: 'attendance.double_decision_clear', entity: 'Staff', entityId: req.params.date, entityRef: req.params.staffId });
  res.json(new ApiResponse(200, null, 'Decision removed'));
});

// Overtime for extra hours in a month — an amount decided by management (no fixed rate).
export const setMonthAdjustment = asyncHandler(async (req, res) => {
  const { staff, month, overtimeAmount, note } = req.body || {};
  monthParam(month);
  if (!mongoose.isValidObjectId(staff)) throw new ApiError(400, 'Invalid staff');
  const rupees = Number(overtimeAmount) || 0;
  if (rupees < 0) throw new ApiError(400, 'Amount cannot be negative');
  await assertAttendanceOpen([month]);
  const doc = await AttendanceMonth.findOneAndUpdate(
    { staff, month },
    { $set: { overtimeAmount: rupees, note: String(note || '').trim(), by: req.user._id } },
    { upsert: true, returnDocument: 'after', runValidators: true },
  );
  logAction(req, { action: 'attendance.month_overtime', entity: 'Staff', entityId: month, entityRef: staff, meta: { overtimeAmount: rupees } });
  res.json(new ApiResponse(200, doc, 'Saved'));
});

// Planned leave for a run of days — only the days the person would work, so weekly offs and
// holidays inside the period don't use up leave.
export const markLeave = asyncHandler(async (req, res) => {
  const { staff: staffId, from, to, leaveType = 'paid', note } = req.body || {};
  dateParam(from, 'from');
  dateParam(to, 'to');
  if (to < from) throw new ApiError(400, 'to must not be before from');
  if (datesBetween(from, to).length > 31) throw new ApiError(400, 'At most 31 days at a time');
  if (!LEAVE_TYPES.includes(leaveType)) throw new ApiError(400, 'Invalid leave type');
  if (!note?.trim()) throw new ApiError(400, 'A note is required');
  await assertAttendanceOpen([from, to]);
  const staff = mongoose.isValidObjectId(staffId) && await Staff.findById(staffId).lean();
  if (!staff) throw new ApiError(404, 'Staff not found');

  const settings = await AttendanceSettings.getOrCreate();
  const plans = (await resolvePlans([staff], from, to, settings)).get(String(staff._id));
  const work = plans.filter((p) => !p.off && p.employed && p.shifts.length);
  if (!work.length) throw new ApiError(400, 'No working days in that period');
  await AttendanceOverride.bulkWrite(work.map((p) => ({
    updateOne: {
      filter: { staff: staff._id, date: p.date },
      update: { $set: { status: 'leave', leaveType, waiveLate: false, note: note.trim(), by: req.user._id } },
      upsert: true,
    },
  })));
  logAction(req, { action: 'attendance.leave_mark', entity: 'Staff', entityId: staff.staffCode, entityRef: staff._id, meta: { from, to, leaveType, days: work.length } });
  res.json(new ApiResponse(200, { marked: work.length, skipped: plans.length - work.length }, 'Leave marked'));
});
