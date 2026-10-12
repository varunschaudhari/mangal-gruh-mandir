import Punch from '../models/Punch.js';
import Staff from '../models/Staff.js';
import ApiError from '../utils/ApiError.js';
import { getPermissionsForRole } from '../middleware/authorize.js';
import { nextNumber } from './sequence.service.js';
import { localDateStr } from '../../../shared/dates.js';

// Everyone is a User. A user who is "on attendance & payroll" also has an attendance profile
// (the Staff document): machine number, shifts, weekly off, salary, PF/ESI, bank. Punches,
// roster, leave and salary point at that profile. Name, phone, department and active come
// from the user and are copied onto the profile whenever the user is saved.

export const ATTENDANCE_FIELDS = ['designation', 'gender', 'joinDate', 'leftOn', 'machineId', 'defaultShift', 'nightOnly',
  'weeklyOffDay', 'doubleShiftEligible', 'paidLeavePerMonth', 'notes'];
export const SALARY_FIELDS = ['monthlySalary', 'basicSalary', 'pfApplicable', 'esiApplicable', 'ptApplicable', 'uan', 'esicNo', 'bankAccount', 'ifsc'];
export const SALARY_HIDDEN = SALARY_FIELDS.map((f) => `-${f}`).join(' ');
const EMPTY_IS_NULL = ['joinDate', 'leftOn', 'defaultShift', 'paidLeavePerMonth', 'basicSalary'];

export async function userCan(req, perm) {
  const perms = await getPermissionsForRole(req.user.role);
  return perms.includes('*') || perms.includes(perm);
}

export async function assertMachineIdFree(machineId, exceptId) {
  if (!machineId) return;
  const other = await Staff.findOne({ machineId, _id: { $ne: exceptId } }).select('name staffCode').lean();
  if (other) throw new ApiError(409, `Machine number ${machineId} is already given to ${other.name} (${other.staffCode})`);
}

const nextStaffCode = () => nextNumber({ prefix: 'STF-', sources: [{ model: Staff, field: 'staffCode' }] });

// Punches that arrived before the machine number was entered get linked now.
export const linkPunches = (staff) => (staff.machineId
  ? Punch.updateMany({ machineId: staff.machineId, staff: null }, { $set: { staff: staff._id } })
  : null);

/** What the requester may change in the profile: attendance fields need attendance:manage, pay fields salary:manage. */
export async function pickProfile(req, body = {}) {
  const [att, sal] = await Promise.all([userCan(req, 'attendance:manage'), userCan(req, 'salary:manage')]);
  const fields = [...(att ? ATTENDANCE_FIELDS : []), ...(sal ? SALARY_FIELDS : [])];
  const out = {};
  for (const k of fields) {
    if (body[k] === undefined) continue;
    out[k] = body[k] === '' && EMPTY_IS_NULL.includes(k) ? null : body[k];
  }
  // '' (not undefined — Mongoose drops undefined from updates) clears it; the unique index skips ''.
  if (out.machineId !== undefined) out.machineId = String(out.machineId ?? '').trim();
  return { data: out, canAttendance: att };
}

const day = (v) => (v ? String(v).slice(0, 10) : '');                 // 'YYYY-MM-DD' from the form
const dayOf = (d) => (d ? localDateStr(new Date(d)) : '');             // a saved Date → 'YYYY-MM-DD'

/**
 * Checks a profile can be saved, before the user is created or changed. `nextActive` = whether
 * the user will be active after this save.
 * - On payroll needs a joining date (days before it are "not employed", so a default of today
 *   would wrongly drop the start of the month).
 * - Switching off (or taking off payroll) someone with attendance needs their last working day,
 *   so their last month's salary and the old registers stay right.
 * - Someone who left and is active again either rejoins (a joining date after the old last
 *   working day — the old stint is kept) or never left (the last working day is cleared).
 */
export async function validateProfile(req, user, body, { nextActive } = {}) {
  const existing = user?._id ? await Staff.findOne({ user: user._id }).select('_id joinDate leftOn onPayroll').lean() : null;
  const active = nextActive ?? user?.isActive ?? true;
  const wasOn = Boolean(existing?.onPayroll);

  if (!body) {
    // The form had no attendance part (no attendance rights): leaving needs someone who can enter the date
    if (wasOn && !active && user?.isActive && !existing.leftOn) {
      throw new ApiError(400, 'This person is on attendance & payroll — someone with attendance rights must enter their last working day before switching them off');
    }
    return;
  }
  if (!body.onPayroll) {
    if (!wasOn) return;
    if (!(await userCan(req, 'attendance:manage'))) throw new ApiError(403, 'You cannot take people off attendance');
    if (!day(body.leftOn) && !existing.leftOn && await Punch.exists({ staff: existing._id })) {
      throw new ApiError(400, 'Enter their last working day before taking them off attendance & payroll');
    }
    return;
  }
  if (!(await userCan(req, 'attendance:manage'))) throw new ApiError(403, 'You cannot put people on attendance');
  const machineId = typeof body.machineId === 'string' ? body.machineId.trim() : '';
  await assertMachineIdFree(machineId, existing?._id);

  // A save that leaves a date out keeps the stored one
  const join = 'joinDate' in body ? day(body.joinDate) : dayOf(existing?.joinDate);
  const left = 'leftOn' in body ? day(body.leftOn) : dayOf(existing?.leftOn);
  if (!join) throw new ApiError(400, 'Enter the joining date — for someone already working here, the date they first joined');
  const oldLeft = dayOf(existing?.leftOn);
  const leftEarlier = active && oldLeft && oldLeft < localDateStr() && left === oldLeft;   // active again, old last day still there
  if (leftEarlier && join <= oldLeft) {
    throw new ApiError(400, 'They left earlier — set the joining date to the day they rejoin, or clear the last working day if they never left');
  }
  // (rejoining: the old last working day is before the new joining date — it goes to the earlier stint)
  if (left && left < join && !leftEarlier) throw new ApiError(400, 'The last working day cannot be before the joining date');
  if (!active && !left) throw new ApiError(400, 'Enter the last working day before switching off someone on attendance & payroll');
}

const identity = (user, onPayroll) => ({
  name: user.name,
  phone: user.phone || '',
  department: user.departments?.[0]?._id || user.departments?.[0] || null,
  // On the registers only while the user is active and ticked "on attendance & payroll"
  isActive: Boolean(user.isActive && onPayroll),
  onPayroll: Boolean(onPayroll),
});

/**
 * Creates / updates the user's attendance profile from the user form (`body` = staffProfile),
 * or just copies the user's name, phone, department and active onto it when body is absent.
 */
export async function saveStaffProfile(req, user, body) {
  let staff = await Staff.findOne({ user: user._id });
  if (body === undefined) {
    if (staff) {
      Object.assign(staff, identity(user, staff.onPayroll !== false));
      await staff.save();
    }
    return staff;
  }
  const onPayroll = Boolean(body.onPayroll);
  if (!staff && !onPayroll) return null;
  const { data, canAttendance } = await pickProfile(req, body);
  if (!staff) {
    if (!canAttendance) throw new ApiError(403, 'You cannot put people on attendance');
    let created;
    for (let attempt = 0; !created; attempt += 1) {
      try {
        created = await Staff.create({
          // pay starts from what the old user form had, unless given
          monthlySalary: user.monthlySalary || 0,
          ...data, ...identity(user, true), user: user._id, staffCode: await nextStaffCode(),
        });
      } catch (err) {
        // Two people added at the same moment can get the same code — take the next one.
        if (err.code !== 11000 || !err.keyValue?.staffCode || attempt >= 3) throw err;
      }
    }
    staff = created;
  } else {
    // Taken back after leaving: keep the old stint, start a new one from the new joining date
    const oldLeft = dayOf(staff.leftOn);
    if (user.isActive && oldLeft && oldLeft < localDateStr() && data.joinDate && day(data.joinDate) > oldLeft) {
      staff.pastPeriods.push({ joinDate: staff.joinDate, leftOn: staff.leftOn });
      data.leftOn = null;
    }
    Object.assign(staff, data, identity(user, onPayroll));
    await staff.save();
  }
  await linkPunches(staff);
  return staff;
}

/** The profile for the user form — pay and bank details only for salary:read. */
export async function profileFor(req, userId) {
  const hide = (await userCan(req, 'salary:read')) ? '' : SALARY_HIDDEN;
  return Staff.findOne({ user: userId }).select(hide).lean();
}
