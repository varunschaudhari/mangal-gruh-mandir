import ExcelJS from 'exceljs';
import { ecrLine } from './payroll.js';

// Files made from a finalised salary month: salary register, bank transfer sheet, the PF
// return (EPFO ECR 2.0 text) and the ESI monthly contribution sheet.

const thin = { style: 'thin', color: { argb: 'FFD1D5DB' } };
const border = { top: thin, bottom: thin, left: thin, right: thin };

function header(ws, values) {
  const row = ws.addRow(values);
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEA580C' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = border;
  });
  row.height = 30;
}

function title(ws, text, cols) {
  ws.mergeCells(1, 1, 1, cols);
  ws.getCell(1, 1).value = text;
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FFEA580C' } };
}

export async function salaryRegisterXlsx({ run, label, temple }) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Salary', { views: [{ state: 'frozen', xSplit: 2, ySplit: 2 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const cols = [
    ['Code', (l) => l.staffCode, 10], ['Name', (l) => l.name, 22], ['Designation', (l) => l.designation, 13],
    ['Monthly salary', (l) => l.monthlySalary, 11], ['Basic', (l) => l.basicSalary, 10],
    ['Days', (l) => l.daysInMonth, 6], ['Paid days', (l) => l.paidDays, 7], ['Unpaid days', (l) => l.unpaidDays + l.lateCut, 7],
    ['Earned basic', (l) => l.earnedBasic, 10], ['Allowances', (l) => l.earnedOther, 10], ['Overtime', (l) => l.overtime, 9],
    ['Other earning', (l) => l.otherEarning, 9], ['Gross', (l) => l.gross, 10],
    ['PF', (l) => l.pfEmployee, 8], ['ESI', (l) => l.esiEmployee, 8], ['PT', (l) => l.pt, 7], ['Advance', (l) => l.advanceRecovery, 9],
    ['Other deduction', (l) => l.otherDeduction, 9], ['Total deductions', (l) => l.totalDeductions, 10], ['Net pay', (l) => l.netPay, 11],
    ['Employer PF', (l) => l.pfEmployer, 9], ['Employer ESI', (l) => l.esiEmployer, 9], ['Mode', (l) => (l.paymentMode === 'cash' ? 'Cash' : 'Bank'), 7],
  ];
  title(ws, `${temple} — Salary register ${label}`, cols.length);
  header(ws, cols.map(([h]) => h));
  for (const l of run.lines) {
    const row = ws.addRow(cols.map(([, f]) => f(l)));
    row.eachCell({ includeEmpty: true }, (c, i) => { c.border = border; if (i > 3) c.numFmt = '#,##0.##'; });
    row.getCell(cols.findIndex(([h]) => h === 'Net pay') + 1).font = { bold: true };
  }
  const total = ws.addRow(cols.map(([h, f], i) => (i === 1 ? 'Total' : i < 5 || ['Days', 'Paid days', 'Unpaid days', 'Mode'].includes(h) ? '' : run.lines.reduce((s, l) => s + (f(l) || 0), 0))));
  total.eachCell({ includeEmpty: true }, (c, i) => { c.font = { bold: true }; c.border = border; if (i > 3) c.numFmt = '#,##0'; });
  cols.forEach(([, , w], i) => { ws.getColumn(i + 1).width = w; });
  return wb.xlsx.writeBuffer();
}

/** Generic bank upload sheet — beneficiary, account, IFSC, amount, narration. */
export async function bankXlsx({ lines, narration }) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Bank transfer');
  header(ws, ['Sr', 'Beneficiary name', 'Account number', 'IFSC', 'Amount', 'Narration', 'Employee code']);
  lines.forEach((l, i) => {
    const row = ws.addRow([i + 1, l.name, l.bankAccount, l.ifsc, l.netPay, narration, l.staffCode]);
    row.getCell(3).numFmt = '@'; // keep leading zeros of account numbers
    row.eachCell((c) => { c.border = border; });
  });
  const total = ws.addRow(['', 'Total', '', '', lines.reduce((s, l) => s + l.netPay, 0)]);
  total.font = { bold: true };
  [5, 26, 20, 14, 12, 22, 12].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  return wb.xlsx.writeBuffer();
}

export function bankCsv({ lines, narration }) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [
    ['Beneficiary name', 'Account number', 'IFSC', 'Amount', 'Narration', 'Employee code'].map(q).join(','),
    ...lines.map((l) => [l.name, l.bankAccount, l.ifsc, l.netPay, narration, l.staffCode].map(q).join(',')),
  ].join('\r\n');
}

/** EPFO ECR 2.0 — one line per member with a UAN. */
export const ecrText = (lines) => lines.filter((l) => l.pfApplicable && l.uan).map(ecrLine).join('\n');

/** ESIC monthly contribution sheet (same columns as the portal's upload template). */
export async function esiXlsx({ lines, month }) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('MC');
  header(ws, [
    'IP Number', 'IP Name', 'No of Days for which wages paid/payable during the month', 'Total Monthly Wages',
    'Reason Code for Zero workings days(numeric only; provide 0 for all other reasons- Click on the link for reference)', 'Last Working Day',
  ]);
  for (const l of lines.filter((x) => x.esiApplicable && x.esiWage >= 0 && x.esicNo)) {
    const leftThisMonth = l.leftOn && l.leftOn.startsWith(month);
    const days = Math.floor(l.paidDays);
    // Reason 2 = left service; otherwise 0
    const reason = leftThisMonth ? 2 : 0;
    const lastDay = leftThisMonth ? l.leftOn.split('-').reverse().join('/') : '';
    const row = ws.addRow([l.esicNo, l.name, days, l.esiWage, days === 0 || leftThisMonth ? reason : 0, lastDay]);
    row.getCell(1).numFmt = '@';
    row.eachCell((c) => { c.border = border; });
  }
  [14, 26, 18, 14, 22, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  return wb.xlsx.writeBuffer();
}
