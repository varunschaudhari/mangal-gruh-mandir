// Salary calculation — pure functions, so the rules are easy to check.
//
//  • Earned salary = monthly salary ÷ days in month × paid days (paid days come from the
//    attendance: days in month − unpaid days − late cuts − days not employed).
//  • PF is on the earned BASIC salary (up to the wage ceiling, ₹15,000): employee 12 %,
//    employer 12 % of which 8.33 % goes to the pension scheme (EPS).
//  • ESI is on gross pay for people whose monthly salary is within ₹21,000:
//    employee 0.75 %, employer 3.25 %, rounded up to the next rupee.
//  • Professional Tax from the state's slabs on gross pay (Maharashtra: higher in February).
//  • Salary advances are recovered in instalments, never more than the salary allows.

const r = Math.round;
const up = (n) => Math.ceil(n - 1e-9); // rupee rounding up, without 7.0000001 → 8

/** Professional Tax for a month's gross pay. Unknown gender uses the men's slabs. */
export function professionalTax({ gross, gender, month, slabs = [] }) {
  const g = gender === 'female' ? 'female' : 'male';
  const slab = slabs
    .filter((s) => s.gender === g && gross > s.above)
    .sort((a, b) => b.above - a.above)[0];
  if (!slab) return 0;
  return month.slice(5) === '02' && slab.februaryAmount != null ? slab.februaryAmount : slab.amount;
}

/**
 * One person's salary for a month.
 * @param staff     { monthlySalary, basicSalary, pfApplicable, esiApplicable, ptApplicable, gender, uan, esicNo, bankAccount, ifsc }
 * @param attendance { daysInMonth, paidDays, overtime } — overtime in ₹ decided by management
 * @param advances  open advances [{ _id, installment, outstanding }] (outstanding before this month)
 * @param manual    what was entered by hand: { otherEarning, otherDeduction, recoveries, paymentMode }
 */
export function computeSalaryLine({ staff, attendance, month, settings, advances = [], manual = {} }) {
  const monthly = Math.max(0, staff.monthlySalary || 0);
  const basicRate = staff.basicSalary > 0 ? Math.min(staff.basicSalary, monthly) : monthly;
  const days = attendance.daysInMonth;
  const paidDays = Math.max(0, Math.min(days, attendance.paidDays));
  const earnedTotal = r((monthly / days) * paidDays);
  const earnedBasic = Math.min(earnedTotal, r((basicRate / days) * paidDays));
  const earnedOther = earnedTotal - earnedBasic;
  const overtime = r(Math.max(0, attendance.overtime || 0));
  const otherEarning = r(Math.max(0, Number(manual.otherEarning) || 0));
  const gross = earnedTotal + overtime + otherEarning;
  const warnings = [];

  // PF — on earned basic only
  let pfWage = 0; let epsWage = 0; let pfEmployee = 0; let pfEmployer = 0; let eps = 0;
  if (settings.pf.enabled && staff.pfApplicable) {
    const ceiling = settings.pf.wageCeiling;
    pfWage = settings.pf.capAtCeiling ? Math.min(earnedBasic, ceiling) : earnedBasic;
    epsWage = Math.min(earnedBasic, ceiling);
    pfEmployee = r((pfWage * settings.pf.employeeRate) / 100);
    pfEmployer = r((pfWage * settings.pf.employerRate) / 100);
    eps = Math.min(pfEmployer, r((epsWage * settings.pf.epsRate) / 100));
    if (!staff.uan) warnings.push('no_uan');
  }

  // ESI — on gross, only within the wage ceiling
  let esiWage = 0; let esiEmployee = 0; let esiEmployer = 0;
  if (settings.esi.enabled && staff.esiApplicable) {
    if (monthly <= settings.esi.wageCeiling) {
      esiWage = gross;
      esiEmployee = up((esiWage * settings.esi.employeeRate) / 100);
      esiEmployer = up((esiWage * settings.esi.employerRate) / 100);
      if (!staff.esicNo) warnings.push('no_esic');
    } else {
      warnings.push('esi_above_ceiling');
    }
  }

  const ptOn = settings.pt.enabled && staff.ptApplicable !== false;
  const pt = ptOn ? professionalTax({ gross, gender: staff.gender, month, slabs: settings.pt.slabs }) : 0;
  if (ptOn && !staff.gender) warnings.push('no_gender');

  const otherDeduction = r(Math.max(0, Number(manual.otherDeduction) || 0));
  const fixed = pfEmployee + esiEmployee + pt + otherDeduction;

  // Advances: the instalment (or the amount entered), within what is left and what the salary allows
  let room = Math.max(0, gross - fixed);
  const recoveries = advances.map((a) => {
    const entered = manual.recoveries?.find((x) => String(x.advance) === String(a._id))?.amount;
    const planned = entered != null ? Number(entered) || 0 : (a.installment > 0 ? a.installment : a.outstanding);
    const amount = Math.max(0, Math.min(r(planned), a.outstanding, room));
    room -= amount;
    return { advance: a._id, amount };
  });
  const advanceRecovery = recoveries.reduce((s, x) => s + x.amount, 0);
  const totalDeductions = fixed + advanceRecovery;
  const netPay = gross - totalDeductions;
  if (netPay < 0) warnings.push('negative_net');
  const hasBank = Boolean(staff.bankAccount && staff.ifsc);
  if (!hasBank) warnings.push('no_bank');

  return {
    monthlySalary: monthly,
    basicSalary: basicRate,
    daysInMonth: days,
    paidDays,
    ncpDays: Math.round(days - paidDays),
    earnedBasic,
    earnedOther,
    overtime,
    otherEarning,
    gross,
    pfWage, epsWage, pfEmployee, pfEmployer, eps, epfDiff: pfEmployer - eps,
    esiWage, esiEmployee, esiEmployer,
    pt,
    recoveries,
    advanceRecovery,
    otherDeduction,
    totalDeductions,
    netPay,
    employerCost: gross + pfEmployer + esiEmployer,
    paymentMode: manual.paymentMode || (hasBank ? 'bank' : 'cash'),
    warnings,
  };
}

/** Month totals for a run. */
export function runTotals(lines) {
  const keys = ['gross', 'earnedBasic', 'overtime', 'pfEmployee', 'pfEmployer', 'esiEmployee', 'esiEmployer', 'pt',
    'advanceRecovery', 'otherDeduction', 'totalDeductions', 'netPay', 'employerCost'];
  const t = Object.fromEntries(keys.map((k) => [k, 0]));
  t.people = lines.length;
  t.bank = 0;
  t.cash = 0;
  for (const l of lines) {
    for (const k of keys) t[k] += l[k] || 0;
    t[l.paymentMode === 'cash' ? 'cash' : 'bank'] += l.netPay;
  }
  t.statutory = t.pfEmployee + t.pfEmployer + t.esiEmployee + t.esiEmployer + t.pt;
  return t;
}

/** One member line of the EPFO ECR 2.0 text file (fields joined by #~#). */
export function ecrLine(line) {
  return [
    line.uan,
    String(line.name || '').toUpperCase(),
    line.gross,
    line.pfWage,
    line.epsWage,
    line.epsWage,          // EDLI wages (same ceiling as EPS)
    line.pfEmployee,
    line.eps,
    line.epfDiff,
    line.ncpDays,
    0,                     // refund of advances
  ].join('#~#');
}
