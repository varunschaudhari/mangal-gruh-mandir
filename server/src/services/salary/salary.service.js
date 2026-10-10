import Department from '../../models/Department.js';
import Expense from '../../models/Expense.js';
import PayrollSettings from '../../models/PayrollSettings.js';
import SalaryAdvance from '../../models/SalaryAdvance.js';
import SalaryRun from '../../models/SalaryRun.js';
import Staff from '../../models/Staff.js';
import { localDateStr } from '../../utils/dates.js';
import ApiError from '../../utils/ApiError.js';
import { computeMonth, monthRange } from '../attendance/attendance.service.js';
import { generateExpenseNumber } from '../expenseNumber.service.js';
import { computeSalaryLine } from './payroll.js';

const dayStr = (d) => (d ? localDateStr(new Date(d)) : '');
export const monthLabel = (month) => new Date(`${month}-01T12:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

/**
 * Advances with what is still to recover — given on or before `upTo`, minus everything taken back
 * in finalised salary months other than `exceptMonth` (the month being worked on).
 */
export async function advancesWithBalance({ staffIds, upTo, exceptMonth } = {}) {
  const filter = {};
  if (staffIds) filter.staff = { $in: staffIds };
  if (upTo) filter.date = { $lte: upTo };
  const advances = await SalaryAdvance.find(filter).populate('staff', 'name staffCode').sort({ date: 1 }).lean();
  const runs = await SalaryRun.find({ status: { $in: ['finalized', 'paid'] }, ...(exceptMonth ? { month: { $ne: exceptMonth } } : {}) })
    .select('month lines.recoveries').lean();
  const recovered = new Map();
  const history = new Map();
  for (const run of runs) {
    for (const line of run.lines) {
      for (const rec of line.recoveries || []) {
        if (!rec.amount) continue;
        const k = String(rec.advance);
        recovered.set(k, (recovered.get(k) || 0) + rec.amount);
        if (!history.has(k)) history.set(k, []);
        history.get(k).push({ month: run.month, amount: rec.amount });
      }
    }
  }
  return advances.map((a) => {
    const done = recovered.get(String(a._id)) || 0;
    return { ...a, recovered: done, outstanding: Math.max(0, a.amount - done), history: history.get(String(a._id)) || [] };
  });
}

const snapshot = (s, departments) => ({
  staff: s._id,
  staffCode: s.staffCode,
  name: s.name,
  designation: s.designation || '',
  department: departments.get(String(s.department)) || '',
  gender: s.gender || '',
  uan: s.uan || '',
  esicNo: s.esicNo || '',
  bankAccount: s.bankAccount || '',
  ifsc: s.ifsc || '',
  leftOn: dayStr(s.leftOn),
  pfApplicable: Boolean(s.pfApplicable),
  esiApplicable: Boolean(s.esiApplicable),
  ptApplicable: s.ptApplicable !== false,
});

const manualOf = (line) => (line ? {
  otherEarning: line.otherEarning,
  otherEarningNote: line.otherEarningNote,
  otherDeduction: line.otherDeduction,
  otherDeductionNote: line.otherDeductionNote,
  recoveries: line.recoveriesEdited ? line.recoveries : undefined,
  recoveriesEdited: line.recoveriesEdited,
  paymentMode: line.paymentModeSet ? line.paymentMode : undefined,
  paymentModeSet: line.paymentModeSet,
} : {});

function buildLine({ staff, leave, month, settings, advances, manual, departments }) {
  const calc = computeSalaryLine({
    staff,
    attendance: { daysInMonth: leave.daysInMonth, paidDays: leave.paidDays, overtime: leave.overtime?.total || 0 },
    month, settings, advances, manual,
  });
  return {
    ...snapshot(staff, departments),
    ...calc,
    paidLeave: leave.paidUsed || 0,
    extraLeave: leave.extraUsed || 0,
    unpaidDays: leave.unpaid || 0,
    lateCut: leave.lateCut || 0,
    otherEarningNote: manual.otherEarningNote || '',
    otherDeductionNote: manual.otherDeductionNote || '',
    recoveriesEdited: Boolean(manual.recoveriesEdited),
    paymentModeSet: Boolean(manual.paymentModeSet),
  };
}

/** Things to sort out before (or while) preparing salary. */
export async function checklist(month) {
  const att = await computeMonth({ month });
  let pendingDoubles = 0;
  let reviewDays = 0;
  for (const s of att.staff) {
    pendingDoubles += att.leave[s._id].pendingDoubles;
    reviewDays += att.leave[s._id].reviewDays;
  }
  return {
    pendingDoubles,
    reviewDays,
    noSalary: att.staff.filter((s) => !(s.monthlySalary > 0)).map((s) => ({ _id: s._id, name: s.name })),
    staffCount: att.staff.length,
  };
}

/** Creates the month's draft, or works it out again from the attendance, keeping amounts typed in by hand. */
export async function prepareRun(month, user) {
  const existing = await SalaryRun.findOne({ month });
  if (existing && existing.status !== 'draft') throw new ApiError(400, 'This month is already finalised. Reopen it to make changes.');
  const [settings, att, departments] = await Promise.all([
    PayrollSettings.getOrCreate(),
    computeMonth({ month }),
    Department.find().select('name').lean().then((ds) => new Map(ds.map((d) => [String(d._id), d.name]))),
  ]);
  const { to } = monthRange(month);
  const paid = att.staff.filter((s) => s.monthlySalary > 0);
  const advances = await advancesWithBalance({ staffIds: paid.map((s) => s._id), upTo: to, exceptMonth: month });
  const before = new Map((existing?.lines || []).map((l) => [String(l.staff), l]));

  const lines = paid.map((s) => buildLine({
    staff: s,
    leave: att.leave[s._id],
    month,
    settings,
    advances: advances.filter((a) => String(a.staff._id) === String(s._id) && a.outstanding > 0),
    manual: manualOf(before.get(String(s._id))),
    departments,
  }));

  const run = existing || new SalaryRun({ month });
  run.lines = lines;
  run.preparedBy = user._id;
  run.preparedAt = new Date();
  await run.save();
  return run;
}

/** Hand changes to one person's line (extra earning, deductions, advance recovery, payment mode). */
export async function updateLine(month, staffId, body) {
  const run = await SalaryRun.findOne({ month });
  if (!run) throw new ApiError(404, 'Salary for this month has not been prepared');
  if (run.status !== 'draft') throw new ApiError(400, 'This month is finalised. Reopen it to make changes.');
  const i = run.lines.findIndex((l) => String(l.staff) === String(staffId));
  if (i === -1) throw new ApiError(404, 'This person is not in this month\'s salary');
  const line = run.lines[i].toObject();

  const manual = manualOf(line);
  if (body.otherEarning !== undefined) manual.otherEarning = Number(body.otherEarning) || 0;
  if (body.otherEarningNote !== undefined) manual.otherEarningNote = String(body.otherEarningNote).trim();
  if (body.otherDeduction !== undefined) manual.otherDeduction = Number(body.otherDeduction) || 0;
  if (body.otherDeductionNote !== undefined) manual.otherDeductionNote = String(body.otherDeductionNote).trim();
  if (Array.isArray(body.recoveries)) { manual.recoveries = body.recoveries; manual.recoveriesEdited = true; }
  if (body.paymentMode !== undefined) {
    if (!['bank', 'cash'].includes(body.paymentMode)) throw new ApiError(400, 'Invalid payment mode');
    manual.paymentMode = body.paymentMode;
    manual.paymentModeSet = true;
  }

  const [settings, staff, departments] = await Promise.all([
    PayrollSettings.getOrCreate(),
    Staff.findById(staffId).lean(),
    Department.find().select('name').lean().then((ds) => new Map(ds.map((d) => [String(d._id), d.name]))),
  ]);
  const { to } = monthRange(month);
  const advances = (await advancesWithBalance({ staffIds: [staffId], upTo: to, exceptMonth: month })).filter((a) => a.outstanding > 0);
  // Attendance figures stay as they were prepared — "Recalculate" brings in attendance changes
  const leave = {
    daysInMonth: line.daysInMonth, paidDays: line.paidDays, overtime: { total: line.overtime },
    paidUsed: line.paidLeave, extraUsed: line.extraLeave, unpaid: line.unpaidDays, lateCut: line.lateCut,
  };
  // Salary details are taken as they were when prepared, too
  const person = {
    ...(staff || {}), _id: line.staff, monthlySalary: line.monthlySalary, basicSalary: line.basicSalary,
    pfApplicable: line.pfApplicable, esiApplicable: line.esiApplicable, ptApplicable: line.ptApplicable,
  };
  run.lines.set(i, buildLine({ staff: person, leave, month, settings, advances, manual, departments }));
  await run.save();
  return run;
}

/** Salary paid: records it in Expenses — net pay by bank and by cash, and the PF / ESI / PT dues. */
export async function recordPaidExpenses(run, { paidOn, paymentRef, user }) {
  const label = monthLabel(run.month);
  const sum = (f, pick = () => true) => run.lines.filter(pick).reduce((s, l) => s + (f(l) || 0), 0);
  const bank = sum((l) => l.netPay, (l) => l.paymentMode !== 'cash');
  const cash = sum((l) => l.netPay, (l) => l.paymentMode === 'cash');
  const pf = sum((l) => l.pfEmployee + l.pfEmployer);
  const esi = sum((l) => l.esiEmployee + l.esiEmployer);
  const pt = sum((l) => l.pt);
  const approved = { status: 'approved', approvedBy: user._id, approvedAt: new Date() };

  const entries = [];
  if (bank > 0) entries.push({ description: `Salaries ${label} — bank transfer`, amount: bank, payee: 'Staff', paymentMode: 'bank', referenceNumber: paymentRef, ...approved });
  if (cash > 0) entries.push({ description: `Salaries ${label} — cash`, amount: cash, payee: 'Staff', paymentMode: 'cash', ...approved });
  if (pf + esi + pt > 0) {
    // Paid separately by challan — left for approval until then
    entries.push({
      description: `PF, ESI & PT for salaries ${label}`, amount: pf + esi + pt, payee: 'EPFO / ESIC / Profession Tax', paymentMode: 'bank',
      notes: `PF ₹${pf} · ESI ₹${esi} · PT ₹${pt}. Approve once the challans are paid (PF and ESI by the 15th of next month).`,
    });
  }
  const ids = [];
  for (const e of entries) {
    const expenseDate = new Date(`${paidOn}T12:00:00`);
    const doc = await Expense.create({
      ...e, category: 'salary', expenseDate, expenseNumber: await generateExpenseNumber(expenseDate), createdBy: user._id,
      notes: e.notes || `Salary for ${label} (${run.lines.length} staff)`,
    });
    ids.push(doc._id);
  }
  return ids;
}

/** A salary advance, recorded in Expenses (money leaving the temple) unless told not to. */
export async function createAdvance({ staffId, date, amount, installment, mode, note, recordExpense, user }) {
  const staff = await Staff.findById(staffId).lean();
  if (!staff) throw new ApiError(404, 'Staff not found');
  let expense;
  if (recordExpense) {
    const expenseDate = new Date(`${date}T12:00:00`);
    expense = await Expense.create({
      expenseNumber: await generateExpenseNumber(expenseDate), category: 'salary', expenseDate,
      description: `Salary advance — ${staff.name}`, amount, payee: staff.name, paymentMode: mode,
      notes: note || 'Recovered from coming salaries', status: 'approved', approvedBy: user._id, approvedAt: new Date(), createdBy: user._id,
    });
  }
  return SalaryAdvance.create({ staff: staff._id, date, amount, installment, mode, note, expense: expense?._id, by: user._id });
}
