/**
 * Demo data for the attendance + salary module — for showing the module before real staff
 * are entered. Everything it creates is marked and can be removed again in one go:
 *   • users demo-01@demo.mandir.local … (Employee role, random password) with attendance
 *     profiles DEMO-01 … DEMO-12 (notes "DEMO DATA"), machine numbers 9001 …
 *   • their punches (from the 1st of last month until now), roster days, corrections,
 *     planned leave, double-shift decisions and one salary advance
 * It does NOT touch settings, does NOT write expenses and does NOT save a salary month
 * (there is one per month — use "Work out salary" on screen, then "Delete draft").
 *
 *   npm run seed:attendance-demo            add (refuses if demo staff already exist)
 *   npm run seed:attendance-demo -- --fresh remove the old demo data first, then add
 *   npm run seed:attendance-demo:remove     remove all demo data
 */

import 'dotenv/config';
import '../config/timezone.js';
import crypto from 'crypto';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import AttendanceSettings from '../models/AttendanceSettings.js';
import AttendanceOverride from '../models/AttendanceOverride.js';
import AttendanceMonth from '../models/AttendanceMonth.js';
import DoubleShift from '../models/DoubleShift.js';
import Punch from '../models/Punch.js';
import RosterDay from '../models/RosterDay.js';
import SalaryAdvance from '../models/SalaryAdvance.js';
import SalaryRun from '../models/SalaryRun.js';
import Staff from '../models/Staff.js';
import User from '../models/User.js';
import { localDateStr } from '../utils/dates.js';

const CODE = /^DEMO-/;
const DEMO_EMAIL = /@demo\.mandir\.local$/;
const DEVICE = 'DEMO-MACHINE';

// name, designation, gender, weekly off (0 = Sun), salary, basic, pf, esi, extra
const PEOPLE = [
  ['Ramesh Joshi',       'Pujari',   'male',   1, 18000, 11000, true,  true,  {}],
  ['Suresh Kulkarni',    'Pujari',   'male',   2, 18000, 11000, true,  true,  {}],
  ['Vinayak Deshpande',  'Pujari',   'male',   4, 16000, 10000, true,  true,  {}],
  ['Sunita Patil',       'Cook',     'female', 3, 12000, 7000,  true,  true,  { doubleShiftEligible: true }],
  ['Mangala Wagh',       'Cook',     'female', 5, 11000, 0,     false, true,  {}],
  ['Ganesh Pawar',       'Guard',    'male',   0, 11000, 0,     false, true,  { nightOnly: true }],
  ['Vitthal More',       'Guard',    'male',   4, 11000, 0,     false, true,  { nightOnly: true, doubleShiftEligible: true }],
  ['Asha Shinde',        'Cleaner',  'female', 5, 9000,  0,     false, false, { noBank: true }],
  ['Prakash Deshmukh',   'Store',    'male',   0, 15000, 9000,  true,  true,  {}],
  ['Kavita Jadhav',      'Office',   'female', 0, 16000, 10000, true,  true,  {}],
  ['Mahesh Gaikwad',     'Helper',   'male',   6, 9500,  0,     false, false, { doubleShiftEligible: true }],
  ['Dnyaneshwar Kale',   'Gardener', 'male',   3, 8500,  0,     false, false, { notEnrolled: true }],
];

// Same "random" pattern every run, so the demo looks the same each time
let seed = 20261010;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

const pad = (n) => String(n).padStart(2, '0');
const dayStr = (d) => localDateStr(d);
const at = (date, hhmm, plusMin = 0) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m + plusMin, Math.floor(rnd() * 50));
};
const addDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

async function removeDemo() {
  const staff = await Staff.find({ staffCode: CODE }).select('_id machineId').lean();
  const ids = staff.map((s) => s._id);
  const pins = staff.map((s) => s.machineId).filter(Boolean);
  const finalised = await SalaryRun.countDocuments({ status: { $ne: 'draft' }, 'lines.staff': { $in: ids } });
  const results = await Promise.all([
    Punch.deleteMany({ $or: [{ staff: { $in: ids } }, { device: DEVICE }, { machineId: { $in: pins }, staff: null }] }),
    RosterDay.deleteMany({ staff: { $in: ids } }),
    AttendanceOverride.deleteMany({ staff: { $in: ids } }),
    DoubleShift.deleteMany({ staff: { $in: ids } }),
    AttendanceMonth.deleteMany({ staff: { $in: ids } }),
    SalaryAdvance.deleteMany({ staff: { $in: ids } }),
    SalaryRun.updateMany({ status: 'draft' }, { $pull: { lines: { staff: { $in: ids } } } }),
  ]);
  await Staff.deleteMany({ _id: { $in: ids } });
  const users = await User.deleteMany({ email: DEMO_EMAIL });
  console.log(`  removed ${ids.length} demo staff (${users.deletedCount} users), ${results[0].deletedCount} punches, ${results[1].deletedCount} roster days, ${results[2].deletedCount} corrections`);
  if (finalised) console.log(`  ⚠ ${finalised} finalised/paid salary month(s) still list demo staff — reopen and recalculate them, or delete them`);
}

async function addDemo() {
  const settings = await AttendanceSettings.getOrCreate();
  const day = settings.shifts.find((s) => s.kind === 'day') || settings.shifts[0];
  const night = settings.shifts.find((s) => s.kind === 'night');
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1); // 1st of last month
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // ── Staff ──
  const staff = [];
  for (const [i, [name, designation, gender, weeklyOffDay, monthlySalary, basic, pf, esi, x]] of PEOPLE.entries()) {
    const n = i + 1;
    // People are users; the attendance & payroll details hang off the user
    const phone = `98${String(23000000 + n * 104729).slice(0, 8)}`;
    const user = await User.create({
      name, email: `demo-${pad(n)}@demo.mandir.local`, phone, role: 'employee',
      password: crypto.randomBytes(12).toString('base64url'),
    });
    staff.push(await Staff.create({
      user: user._id, onPayroll: true,
      staffCode: `DEMO-${pad(n)}`,
      name, designation, gender, weeklyOffDay, monthlySalary,
      basicSalary: basic || undefined,
      phone,
      // a plain date, as the staff form saves it; the not-enrolled gardener joined two days ago
      joinDate: new Date(`${dayStr(x.notEnrolled ? addDays(today, -2) : start)}T00:00:00Z`),
      machineId: x.notEnrolled ? '' : String(9000 + n),
      defaultShift: x.nightOnly && night ? night._id : day._id,
      nightOnly: Boolean(x.nightOnly),
      doubleShiftEligible: Boolean(x.doubleShiftEligible),
      pfApplicable: pf, esiApplicable: esi, ptApplicable: true,
      uan: pf && n !== 10 ? `10${String(9000000000 + n * 7919)}` : '',   // DEMO-10 left without UAN on purpose
      esicNo: esi ? `31${String(90000000 + n * 7919)}` : '',
      bankAccount: x.noBank ? '' : `5010${String(10000000 + n * 7919)}`,
      ifsc: x.noBank ? '' : 'MAHB0000123',
      notes: 'DEMO DATA — remove with: npm run seed:attendance-demo:remove',
    }));
  }
  const by = (name) => staff.find((s) => s.name === name);

  // ── Roster: two double shifts for the cook, a guard covering a day shift ──
  const roster = [];
  const doubleOld = addDays(today, -20);
  const doubleNew = addDays(today, -2);
  if (night) {
    for (const d of [doubleOld, doubleNew]) roster.push({ staff: by('Sunita Patil')._id, date: dayStr(d), shifts: [day._id, night._id], off: false });
    roster.push({ staff: by('Mahesh Gaikwad')._id, date: dayStr(addDays(today, 1)), shifts: [night._id], off: false });
    roster.push({ staff: by('Mahesh Gaikwad')._id, date: dayStr(addDays(today, 2)), shifts: [night._id], off: false });
  }
  await RosterDay.insertMany(roster);
  const rosterOn = new Map(roster.map((r) => [`${r.staff}|${r.date}`, r]));

  // ── Punches ──
  const punches = [];
  let workedOff = false;
  const add = (s, t) => { if (t <= now && s.machineId) punches.push({ machineId: s.machineId, staff: s._id, time: t, source: 'machine', device: DEVICE, verify: rnd() < 0.7 ? 'finger' : 'face' }); };
  for (let d = new Date(start); d <= today; d = addDays(d, 1)) {
    for (const s of staff) {
      const planned = rosterOn.get(`${s._id}|${dayStr(d)}`);
      const isDouble = planned?.shifts.length === 2;
      if (!planned && d.getDay() === s.weeklyOffDay) {
        if (s.name === 'Prakash Deshmukh' && !workedOff && d >= addDays(today, -14)) { // came in on his weekly off once
          workedOff = true;
          add(s, at(d, day.start, 5));
          add(s, at(d, day.end, -20));
        }
        continue;
      }
      if (isDouble) { add(s, at(d, day.start, 2)); add(s, at(addDays(d, 1), night.end, 8)); continue; }
      const r = rnd();
      if (r < 0.05) continue;                                   // absent
      const sh = s.nightOnly && night ? night : day;
      const late = r > 0.92 ? 18 + Math.floor(rnd() * 30) : Math.floor(rnd() * 14) - 8;
      const inT = at(d, sh.start, late);
      let outT = at(d, sh.end, Math.floor(rnd() * 25));
      if (sh.kind === 'night') outT = new Date(outT.getTime() + 24 * 3600e3); // next morning, same time
      if (r >= 0.05 && r < 0.08) outT = new Date(inT.getTime() + 5.2 * 3600e3); // left early → half day
      add(s, inT);
      if (rnd() < 0.15) add(s, new Date(inT.getTime() + 40e3));  // tapped twice
      if (s.name === 'Suresh Kulkarni' && dayStr(d) === dayStr(addDays(today, -3))) continue; // forgot the out-punch
      add(s, outT);
    }
  }
  await Punch.insertMany(punches, { ordered: false });

  // ── Supervisor corrections, planned leave, decisions, an advance ──
  const firstWorkDay = (s, from) => { let d = from; while (d.getDay() === s.weeklyOffDay) d = addDays(d, 1); return d; };
  const overrides = [
    { staff: by('Ramesh Joshi')._id, date: dayStr(firstWorkDay(by('Ramesh Joshi'), addDays(today, -6))), status: 'on_duty', note: 'Pooja at a devotee\'s home' },
    { staff: by('Asha Shinde')._id, date: dayStr(firstWorkDay(by('Asha Shinde'), addDays(today, -9))), waiveLate: true, note: 'Bus was late' },
  ];
  for (const k of [3, 4, 5]) {
    const d = addDays(today, k);
    if (d.getDay() !== by('Kavita Jadhav').weeklyOffDay) overrides.push({ staff: by('Kavita Jadhav')._id, date: dayStr(d), status: 'leave', leaveType: 'paid', note: 'Sister\'s wedding' });
  }
  overrides.push({ staff: by('Mahesh Gaikwad')._id, date: dayStr(firstWorkDay(by('Mahesh Gaikwad'), addDays(today, 6))), status: 'leave', leaveType: 'unpaid', note: 'Personal work' });
  await AttendanceOverride.insertMany(overrides);

  if (night) {
    await DoubleShift.create({
      staff: by('Sunita Patil')._id, date: dayStr(doubleOld), decision: 'extra_leave',
      expiresOn: dayStr(addDays(doubleOld, settings.extraLeaveValidDays || 60)), note: 'Navratri rush',
    });
    // doubleNew is left for management to decide on screen
  }
  await SalaryAdvance.create({
    staff: by('Mahesh Gaikwad')._id, date: dayStr(addDays(start, 19)), amount: 3000, installment: 1000, mode: 'cash', note: 'Medical (demo)',
  });

  console.log(`  added ${staff.length} demo staff, ${punches.length} punches (from ${dayStr(start)}), ${roster.length} roster days, ${overrides.length} corrections / leave`);
}

const run = async () => {
  await connectDB();
  const remove = process.argv.includes('--remove');
  const fresh = process.argv.includes('--fresh');
  console.log(`\n[attendance demo] ${remove ? 'removing' : 'adding'}\n`);
  if (remove || fresh) await removeDemo();
  if (!remove) {
    if (await Staff.exists({ staffCode: CODE })) {
      console.log('  Demo staff already exist — use --fresh to replace them, or :remove to take them out.');
    } else {
      await addDemo();
    }
  }
  console.log('\n[attendance demo] done\n');
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('[attendance demo] failed:', err);
  process.exit(1);
});
