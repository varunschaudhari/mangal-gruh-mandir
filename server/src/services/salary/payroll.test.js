import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSalaryLine, ecrLine, professionalTax, runTotals } from './payroll.js';

const settings = {
  pf: { enabled: true, employeeRate: 12, employerRate: 12, epsRate: 8.33, wageCeiling: 15000, capAtCeiling: true },
  esi: { enabled: true, employeeRate: 0.75, employerRate: 3.25, wageCeiling: 21000 },
  pt: {
    enabled: true,
    slabs: [
      { gender: 'male', above: 7500, amount: 175 },
      { gender: 'male', above: 10000, amount: 200, februaryAmount: 300 },
      { gender: 'female', above: 25000, amount: 200, februaryAmount: 300 },
    ],
  },
};
const base = { gender: 'male', bankAccount: '1234567890', ifsc: 'SBIN0000001', uan: '100200300400', esicNo: '3100000000', ptApplicable: true };
const full = { daysInMonth: 31, paidDays: 31, overtime: 0 };

test('salary is monthly ÷ days in month × paid days', () => {
  const l = computeSalaryLine({ staff: { ...base, monthlySalary: 15500 }, attendance: { daysInMonth: 31, paidDays: 29.5, overtime: 0 }, month: '2026-10', settings });
  assert.equal(l.gross, 14750);
  assert.equal(l.ncpDays, 2); // 1.5 unpaid days, rounded for the PF return
});

test('PF is 12 % of earned basic only, capped at ₹15,000; employer share split into EPS', () => {
  const l = computeSalaryLine({ staff: { ...base, monthlySalary: 18000, basicSalary: 10000, pfApplicable: true }, attendance: full, month: '2026-10', settings });
  assert.equal(l.earnedBasic, 10000);
  assert.equal(l.earnedOther, 8000);
  assert.equal(l.pfEmployee, 1200);
  assert.equal(l.pfEmployer, 1200);
  assert.equal(l.eps, 833);
  assert.equal(l.epfDiff, 367);

  const high = computeSalaryLine({ staff: { ...base, monthlySalary: 30000, basicSalary: 20000, pfApplicable: true }, attendance: full, month: '2026-10', settings });
  assert.equal(high.pfWage, 15000);
  assert.equal(high.pfEmployee, 1800);
  assert.equal(high.eps, 1250);
});

test('without a basic salary the whole salary counts as basic', () => {
  const l = computeSalaryLine({ staff: { ...base, monthlySalary: 9000, pfApplicable: true }, attendance: full, month: '2026-10', settings });
  assert.equal(l.earnedBasic, 9000);
  assert.equal(l.pfEmployee, 1080);
});

test('ESI on gross within ₹21,000, rounded up; none above the ceiling', () => {
  const l = computeSalaryLine({ staff: { ...base, monthlySalary: 12000, esiApplicable: true }, attendance: { ...full, overtime: 450 }, month: '2026-10', settings });
  assert.equal(l.esiWage, 12450);
  assert.equal(l.esiEmployee, 94);   // 93.375 → 94
  assert.equal(l.esiEmployer, 405);  // 404.625 → 405
  const above = computeSalaryLine({ staff: { ...base, monthlySalary: 25000, esiApplicable: true }, attendance: full, month: '2026-10', settings });
  assert.equal(above.esiEmployee, 0);
  assert.ok(above.warnings.includes('esi_above_ceiling'));
});

test('Professional Tax: Maharashtra slabs, ₹300 in February, women from ₹25,000', () => {
  const slabs = settings.pt.slabs;
  assert.equal(professionalTax({ gross: 7500, gender: 'male', month: '2026-10', slabs }), 0);
  assert.equal(professionalTax({ gross: 9000, gender: 'male', month: '2026-10', slabs }), 175);
  assert.equal(professionalTax({ gross: 12000, gender: 'male', month: '2026-10', slabs }), 200);
  assert.equal(professionalTax({ gross: 12000, gender: 'male', month: '2027-02', slabs }), 300);
  assert.equal(professionalTax({ gross: 9000, gender: 'male', month: '2027-02', slabs }), 175);
  assert.equal(professionalTax({ gross: 20000, gender: 'female', month: '2026-10', slabs }), 0);
  assert.equal(professionalTax({ gross: 26000, gender: 'female', month: '2027-02', slabs }), 300);
  const noPt = computeSalaryLine({ staff: { ...base, monthlySalary: 12000, ptApplicable: false }, attendance: full, month: '2026-10', settings });
  assert.equal(noPt.pt, 0);
});

test('advances are recovered by instalment, never more than is left or the salary allows', () => {
  const advances = [{ _id: 'a1', installment: 1000, outstanding: 2500 }, { _id: 'a2', installment: 0, outstanding: 600 }];
  const l = computeSalaryLine({ staff: { ...base, monthlySalary: 10000, ptApplicable: false }, attendance: full, month: '2026-10', settings, advances });
  assert.deepEqual(l.recoveries.map((x) => x.amount), [1000, 600]);
  assert.equal(l.netPay, 8400);

  const entered = computeSalaryLine({ staff: { ...base, monthlySalary: 10000, ptApplicable: false }, attendance: full, month: '2026-10', settings, advances, manual: { recoveries: [{ advance: 'a1', amount: 5000 }] } });
  assert.equal(entered.recoveries[0].amount, 2500); // only 2,500 left

  const small = computeSalaryLine({ staff: { ...base, monthlySalary: 3100, ptApplicable: false }, attendance: { daysInMonth: 31, paidDays: 10, overtime: 0 }, month: '2026-10', settings, advances });
  assert.equal(small.gross, 1000);
  assert.equal(small.advanceRecovery, 1000);
  assert.equal(small.netPay, 0);
});

test('payment by bank when bank details exist, otherwise cash; totals and the ECR line', () => {
  const a = computeSalaryLine({ staff: { ...base, monthlySalary: 10000, pfApplicable: true }, attendance: full, month: '2026-10', settings });
  const b = computeSalaryLine({ staff: { ...base, bankAccount: '', monthlySalary: 8000 }, attendance: full, month: '2026-10', settings });
  assert.equal(a.paymentMode, 'bank');
  assert.equal(b.paymentMode, 'cash');
  assert.ok(b.warnings.includes('no_bank'));
  const t = runTotals([a, b]);
  assert.equal(t.netPay, a.netPay + b.netPay);
  assert.equal(t.cash, b.netPay);
  assert.equal(ecrLine({ ...a, name: 'Ramesh Joshi', uan: '100200300400' }), '100200300400#~#RAMESH JOSHI#~#10000#~#10000#~#10000#~#10000#~#1200#~#833#~#367#~#0#~#0');
});
