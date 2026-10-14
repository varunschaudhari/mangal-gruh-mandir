import mongoose from 'mongoose';
import Expense from '../models/Expense.js';
import PayrollSettings from '../models/PayrollSettings.js';
import SalaryAdvance from '../models/SalaryAdvance.js';
import SalaryRun from '../models/SalaryRun.js';
import { monthRange } from '../services/attendance/attendance.service.js';
import { runTotals } from '../services/salary/payroll.js';
import {
  advancesWithBalance, checklist, createAdvance, monthLabel, prepareRun, recordPaidExpenses, updateLine,
} from '../services/salary/salary.service.js';
import { bankCsv, bankXlsx, ecrText, esiXlsx, salaryRegisterXlsx } from '../services/salary/salaryFiles.js';
import { changedValues, logAction } from '../services/audit.service.js';
import { localDateStr } from '../utils/dates.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { temple } from '../services/temple.service.js';

const MONTH = /^\d{4}-\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const monthParam = (v) => {
  if (!MONTH.test(String(v || ''))) throw new ApiError(400, 'month must be YYYY-MM');
  return v;
};

async function findRun(month, statuses) {
  const run = await SalaryRun.findOne({ month });
  if (!run) throw new ApiError(404, 'Salary for this month has not been prepared');
  if (statuses && !statuses.includes(run.status)) throw new ApiError(400, `Not allowed while the month is ${run.status}`);
  return run;
}

async function runView(run, month) {
  const { to } = monthRange(month);
  let advances = [];
  if (run) {
    const ids = run.lines.map((l) => l.staff);
    const used = new Set(run.lines.flatMap((l) => l.recoveries.map((r) => String(r.advance))));
    advances = (await advancesWithBalance({ staffIds: ids, upTo: to, exceptMonth: month }))
      .filter((a) => a.outstanding > 0 || used.has(String(a._id)))
      .map((a) => ({ _id: a._id, staff: a.staff._id, date: a.date, amount: a.amount, installment: a.installment, outstanding: a.outstanding, note: a.note }));
  }
  return {
    month,
    label: monthLabel(month),
    run,
    totals: run ? runTotals(run.lines) : null,
    advances,
    temple: temple(), // the payslip letterhead
  };
}

// ── Settings ────────────────────────────────────────────────────────────────

export const getPayrollSettings = asyncHandler(async (req, res) => {
  res.json(new ApiResponse(200, await PayrollSettings.getOrCreate()));
});

export const updatePayrollSettings = asyncHandler(async (req, res) => {
  const settings = await PayrollSettings.getOrCreate();
  const before = settings.toObject();
  const b = req.body || {};
  const num = (v) => (v === '' || v == null ? undefined : Number(v));
  const current = settings.toObject();
  for (const group of ['pf', 'esi']) {
    if (!b[group]) continue;
    for (const [k, v] of Object.entries(b[group])) {
      if (!(k in current[group])) continue;
      const type = typeof current[group][k];
      settings.set(`${group}.${k}`, type === 'number' ? num(v) : type === 'boolean' ? Boolean(v) : String(v ?? '').trim());
    }
  }
  if (b.pt) {
    if (b.pt.enabled !== undefined) settings.pt.enabled = Boolean(b.pt.enabled);
    if (b.pt.state !== undefined) settings.pt.state = String(b.pt.state).trim();
    if (Array.isArray(b.pt.slabs)) {
      settings.pt.slabs = b.pt.slabs.map((s) => ({
        gender: s.gender, above: Number(s.above) || 0, amount: Number(s.amount) || 0,
        ...(s.februaryAmount !== '' && s.februaryAmount != null ? { februaryAmount: Number(s.februaryAmount) } : {}),
      }));
    }
  }
  if (b.bank?.narration !== undefined) settings.bank.narration = String(b.bank.narration).trim();
  await settings.save();
  logAction(req, {
    action: 'salary.settings_update', entity: 'PayrollSettings', entityId: 'payroll', entityRef: settings._id,
    ...changedValues(before, settings.toObject()),
  });
  res.json(new ApiResponse(200, settings, 'Salary settings saved'));
});

// ── Salary months ───────────────────────────────────────────────────────────

export const listRuns = asyncHandler(async (req, res) => {
  const runs = await SalaryRun.find().sort({ month: -1 }).limit(36).lean();
  res.json(new ApiResponse(200, runs.map((r) => {
    const t = runTotals(r.lines);
    return { month: r.month, status: r.status, people: t.people, gross: t.gross, netPay: t.netPay, employerCost: t.employerCost, paidOn: r.paidOn };
  })));
});

export const getRun = asyncHandler(async (req, res) => {
  const month = monthParam(req.params.month);
  const run = await SalaryRun.findOne({ month }).populate('preparedBy finalizedBy paidBy', 'name').populate('expenses', 'expenseNumber description amount status').lean();
  const view = await runView(run, month);
  // Before finalising, show what still needs sorting out in the attendance
  view.checklist = !run || run.status === 'draft' ? await checklist(month) : null;
  res.json(new ApiResponse(200, view));
});

export const prepare = asyncHandler(async (req, res) => {
  const month = monthParam(req.params.month);
  const run = await prepareRun(month, req.user);
  logAction(req, { action: 'salary.prepare', entity: 'SalaryRun', entityId: month, entityRef: run._id, meta: { people: run.lines.length } });
  res.json(new ApiResponse(200, await runView(run, month), 'Salary worked out'));
});

export const editLine = asyncHandler(async (req, res) => {
  const month = monthParam(req.params.month);
  if (!mongoose.isValidObjectId(req.params.staffId)) throw new ApiError(400, 'Invalid staff');
  const run = await updateLine(month, req.params.staffId, req.body || {});
  logAction(req, { action: 'salary.line_edit', entity: 'SalaryRun', entityId: month, entityRef: run._id, meta: { staff: req.params.staffId, ...req.body } });
  res.json(new ApiResponse(200, await runView(run, month), 'Saved'));
});

// A month is over once the night shift that starts on its last evening is done (10 AM on the 1st).
const monthOverAt = (month) => { const [y, m] = month.split('-').map(Number); return new Date(y, m, 1, 10, 0); };

export const finalize = asyncHandler(async (req, res) => {
  const month = monthParam(req.params.month);
  const run = await findRun(month, ['draft']);
  if (new Date() < monthOverAt(month)) {
    throw new ApiError(400, 'This month isn’t over yet — its salary can be finalised from 10 AM on the 1st of next month');
  }
  if (!run.lines.length) throw new ApiError(400, 'Nobody to pay this month');
  if (run.lines.some((l) => l.netPay < 0)) throw new ApiError(400, 'Someone\'s deductions are more than their pay — fix that first');
  // An advance this month recovers may have been recovered by another month since the draft was
  // worked out (that month reopened and finalised again) — then work it out again first.
  const balances = new Map((await advancesWithBalance({ staffIds: run.lines.map((l) => l.staff), exceptMonth: month }))
    .map((a) => [String(a._id), a.outstanding]));
  if (run.lines.some((l) => (l.recoveries || []).some((r) => r.amount > 0 && r.amount > (balances.get(String(r.advance)) ?? 0)))) {
    throw new ApiError(409, 'An advance in this salary was recovered elsewhere since it was worked out — recalculate first');
  }
  // Missing punches are paid as full days and undecided double shifts get nothing — say so first
  const open = await checklist(month);
  if ((open.reviewDays > 0 || open.pendingDoubles > 0) && req.body?.confirmIssues !== true) {
    throw new ApiError(400, 'Some days still have a missing punch or a double shift waiting for a decision — fix them, or finalise anyway',
      [{ code: 'CHECKLIST', reviewDays: open.reviewDays, pendingDoubles: open.pendingDoubles }]);
  }
  run.status = 'finalized';
  run.finalizedBy = req.user._id;
  run.finalizedAt = new Date();
  await run.save();
  logAction(req, {
    action: 'salary.finalize', entity: 'SalaryRun', entityId: month, entityRef: run._id,
    meta: { netPay: runTotals(run.lines).netPay, ...(req.body?.confirmIssues === true ? { finalisedWithOpenIssues: true } : {}) },
  });
  res.json(new ApiResponse(200, await runView(run, month), 'Salary finalised'));
});

const PAYING_FOR_MS = 10 * 60 * 1000;   // a "mark as paid" older than this crashed — may be retried

export const reopen = asyncHandler(async (req, res) => {
  const month = monthParam(req.params.month);
  const run = await findRun(month, ['finalized']);
  if (run.payingAt && Date.now() - run.payingAt < PAYING_FOR_MS) throw new ApiError(409, 'This salary is being marked as paid right now');
  run.status = 'draft';
  run.finalizedBy = undefined;
  run.finalizedAt = undefined;
  await run.save();
  logAction(req, { action: 'salary.reopen', entity: 'SalaryRun', entityId: month, entityRef: run._id });
  res.json(new ApiResponse(200, await runView(run, month), 'Reopened'));
});

/**
 * Salary paid: the expenses are recorded once. The month is claimed first (a second click, a
 * second tab or a retry finds it taken); if recording fails, what was recorded is voided again.
 */
export const markPaid = asyncHandler(async (req, res) => {
  const month = monthParam(req.params.month);
  await findRun(month, ['finalized']);
  const paidOn = req.body?.paidOn || localDateStr();
  if (!DATE.test(paidOn)) throw new ApiError(400, 'Invalid date');
  const paymentRef = String(req.body?.paymentRef || '').trim();
  const claimedAt = new Date();
  const run = await SalaryRun.findOneAndUpdate(
    { month, status: 'finalized', $or: [{ payingAt: null }, { payingAt: { $lt: new Date(Date.now() - PAYING_FOR_MS) } }] },
    { $set: { payingAt: claimedAt } },
    { returnDocument: 'after' },
  );
  if (!run) throw new ApiError(409, 'This salary is already being marked as paid');
  let expenses = [];
  try {
    expenses = await recordPaidExpenses(run, { paidOn, paymentRef, user: req.user });
    const done = await SalaryRun.updateOne(
      { _id: run._id, status: 'finalized', payingAt: claimedAt },
      { $set: { status: 'paid', expenses, paidOn, paymentRef, paidBy: req.user._id }, $unset: { payingAt: 1 } },
    );
    if (!done.modifiedCount) throw new ApiError(409, 'The salary changed while it was being marked as paid — open it again');
  } catch (err) {
    if (expenses.length) {
      await Expense.updateMany({ _id: { $in: expenses } }, { $set: { status: 'voided', voidedBy: req.user._id, voidedAt: new Date(), voidReason: 'Salary not marked as paid' } });
    }
    await SalaryRun.updateOne({ _id: run._id, payingAt: claimedAt }, { $unset: { payingAt: 1 } });
    throw err;
  }
  run.status = 'paid'; run.expenses = expenses; run.paidOn = paidOn; run.paymentRef = paymentRef; run.paidBy = req.user._id;
  logAction(req, { action: 'salary.paid', entity: 'SalaryRun', entityId: month, entityRef: run._id, meta: { paidOn, expenses: run.expenses.length } });
  res.json(new ApiResponse(200, await runView(run, month), 'Marked as paid'));
});

export const deleteDraft = asyncHandler(async (req, res) => {
  const month = monthParam(req.params.month);
  const run = await findRun(month, ['draft']);
  await run.deleteOne();
  logAction(req, { action: 'salary.delete_draft', entity: 'SalaryRun', entityId: month, entityRef: run._id });
  res.json(new ApiResponse(200, null, 'Draft deleted'));
});

const FILES = {
  'register.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'bank.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'bank.csv': 'text/csv; charset=utf-8',
  'ecr.txt': 'text/plain; charset=utf-8',
  'esi.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export const downloadFile = asyncHandler(async (req, res) => {
  const month = monthParam(req.params.month);
  const kind = req.params.kind;
  if (!FILES[kind]) throw new ApiError(404, 'Unknown file');
  // The register can be looked at while still a draft; payment and return files only once final
  const run = await findRun(month, kind === 'register.xlsx' ? null : ['finalized', 'paid']);
  const label = monthLabel(month);
  const settings = await PayrollSettings.getOrCreate();
  const narration = (settings.bank.narration || 'Salary {month}').replace('{month}', label);
  const bankLines = run.lines.filter((l) => l.paymentMode !== 'cash' && l.netPay > 0);
  let body;
  if (kind === 'register.xlsx') {
    body = await salaryRegisterXlsx({ run, label, temple: temple().name });
  } else if (kind === 'bank.xlsx') body = await bankXlsx({ lines: bankLines, narration });
  else if (kind === 'bank.csv') body = bankCsv({ lines: bankLines, narration });
  else if (kind === 'ecr.txt') body = ecrText(run.lines);
  else body = await esiXlsx({ lines: run.lines, month });

  // Who downloaded pay and bank details, and when
  logAction(req, { action: 'salary.file_download', entity: 'SalaryRun', entityId: month, entityRef: run._id, meta: { file: kind, people: kind.startsWith('bank') ? bankLines.length : run.lines.length } });
  res.setHeader('Content-Type', FILES[kind]);
  res.setHeader('Content-Disposition', `attachment; filename="salary-${month}-${kind}"`);
  res.send(typeof body === 'string' ? body : Buffer.from(body));
});

// ── Advances ────────────────────────────────────────────────────────────────

export const listAdvances = asyncHandler(async (req, res) => {
  const staffIds = req.query.staff && mongoose.isValidObjectId(req.query.staff) ? [req.query.staff] : undefined;
  res.json(new ApiResponse(200, await advancesWithBalance({ staffIds })));
});

export const addAdvance = asyncHandler(async (req, res) => {
  const { staff, date, amount, installment, mode = 'cash', note, recordExpense = true } = req.body || {};
  if (!mongoose.isValidObjectId(staff)) throw new ApiError(400, 'Choose a person');
  if (!DATE.test(String(date || ''))) throw new ApiError(400, 'Invalid date');
  const rupees = Math.round(Number(amount));
  if (!(rupees > 0)) throw new ApiError(400, 'Enter the amount');
  if (!['cash', 'bank', 'upi'].includes(mode)) throw new ApiError(400, 'Invalid payment mode');
  const advance = await createAdvance({
    staffId: staff, date, amount: rupees, installment: Math.max(0, Math.round(Number(installment) || 0)), mode,
    note: String(note || '').trim(), recordExpense: Boolean(recordExpense), user: req.user,
  });
  logAction(req, { action: 'salary.advance_add', entity: 'Staff', entityId: date, entityRef: staff, meta: { amount: rupees } });
  res.status(201).json(new ApiResponse(201, advance, 'Advance recorded'));
});

export const deleteAdvance = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid advance');
  const [advance] = (await advancesWithBalance({})).filter((a) => String(a._id) === req.params.id);
  if (!advance) throw new ApiError(404, 'Advance not found');
  if (advance.recovered > 0) throw new ApiError(400, 'Part of this advance has already been recovered from salary');
  const drafts = await SalaryRun.find({ status: 'draft', 'lines.recoveries.advance': advance._id }).select('month lines.staff lines.recoveries').lean();
  await SalaryAdvance.deleteOne({ _id: advance._id });
  // Take it out of any draft that planned to recover it, and work those lines out again
  await SalaryRun.updateMany({ status: 'draft' }, { $pull: { 'lines.$[].recoveries': { advance: advance._id } } });
  for (const d of drafts) {
    for (const l of d.lines.filter((x) => (x.recoveries || []).some((r) => String(r.advance) === String(advance._id)))) {
      await updateLine(d.month, l.staff, {});
    }
  }
  if (advance.expense) {
    await Expense.updateOne({ _id: advance.expense, status: { $ne: 'voided' } }, {
      $set: { status: 'voided', voidedBy: req.user._id, voidedAt: new Date(), voidReason: 'Salary advance deleted' },
    });
  }
  logAction(req, { action: 'salary.advance_delete', entity: 'Staff', entityId: advance.date, entityRef: advance.staff?._id });
  res.json(new ApiResponse(200, null, 'Advance deleted'));
});
