// Payslips as printable HTML (one A4 page each) — printed in the browser, or turned into a
// PDF to share in the mobile apps (utils/printHtml.js).
import { PRINT_FONT, PRINT_HEADER_CSS, esc, letterheadHtml } from './printTemplate.js';

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const below100 = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const below1000 = (n) => [n >= 100 && `${ONES[Math.floor(n / 100)]} Hundred`, n % 100 && below100(n % 100)].filter(Boolean).join(' ');

/** 13603 → "Thirteen Thousand Six Hundred Three" (Indian grouping: thousand, lakh, crore). */
export function amountInWords(amount) {
  let n = Math.round(Math.abs(Number(amount) || 0));
  if (n === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${amountInWords(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (n) parts.push(below1000(n));
  return parts.join(' ');
}

const rs = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const days = (n) => (Number.isInteger(n) ? String(n) : `${Math.floor(n) || ''}½`);
const masked = (acc) => (acc ? `•••• ${String(acc).slice(-4)}` : '—');

function slip(line, { label, temple, t }) {
  const earnings = [
    [t('Basic'), line.earnedBasic],
    [t('Allowances'), line.earnedOther],
    line.overtime > 0 && [t('Overtime'), line.overtime],
    line.otherEarning > 0 && [`${t('Other earning')}${line.otherEarningNote ? ` (${esc(line.otherEarningNote)})` : ''}`, line.otherEarning],
  ].filter(Boolean);
  const deductions = [
    line.pfApplicable && [t('Provident Fund (PF)'), line.pfEmployee],
    line.esiApplicable && [t('ESI'), line.esiEmployee],
    [t('Professional Tax'), line.pt],
    line.advanceRecovery > 0 && [t('Advance recovery'), line.advanceRecovery],
    line.otherDeduction > 0 && [`${t('Other deduction')}${line.otherDeductionNote ? ` (${esc(line.otherDeductionNote)})` : ''}`, line.otherDeduction],
  ].filter(Boolean);
  const rows = Math.max(earnings.length, deductions.length);
  const body = Array.from({ length: rows }, (_, i) => {
    const e = earnings[i];
    const d = deductions[i];
    return `<tr><td>${e ? e[0] : ''}</td><td class="n">${e ? rs(e[1]) : ''}</td><td>${d ? d[0] : ''}</td><td class="n">${d ? rs(d[1]) : ''}</td></tr>`;
  }).join('');
  const info = [
    [t('Employee code'), line.staffCode], [t('Designation'), line.designation || '—'], [t('Department'), line.department || '—'],
    [t('UAN (PF)'), line.uan || '—'], [t('ESIC number'), line.esicNo || '—'],
    [t('Paid by'), line.paymentMode === 'cash' ? t('Cash') : `${t('Bank')} ${masked(line.bankAccount)}`],
  ];
  const att = [
    [t('Days in month'), line.daysInMonth], [t('Paid days'), days(line.paidDays)], [t('Paid leave'), days(line.paidLeave || 0)],
    [t('Extra leave'), days(line.extraLeave || 0)], [t('Unpaid days'), days((line.unpaidDays || 0) + (line.lateCut || 0))],
  ];
  return `<section class="page">
  ${letterheadHtml({ title: `${t('Payslip')} — ${label}`, info: temple })}
  <h3>${esc(line.name)}</h3>
  <table class="info"><tbody>${info.map(([k, v], i) => `${i % 3 === 0 ? '<tr>' : ''}<th>${esc(k)}</th><td>${esc(v)}</td>${i % 3 === 2 ? '</tr>' : ''}`).join('')}</tbody></table>
  <table class="att"><tbody><tr>${att.map(([k]) => `<th>${esc(k)}</th>`).join('')}</tr><tr>${att.map(([, v]) => `<td>${esc(v)}</td>`).join('')}</tr></tbody></table>
  <table class="pay"><thead><tr><th>${esc(t('Earnings'))}</th><th class="n">${esc(t('Amount'))}</th><th>${esc(t('Deductions'))}</th><th class="n">${esc(t('Amount'))}</th></tr></thead>
  <tbody>${body}</tbody>
  <tfoot><tr><th>${esc(t('Gross pay'))}</th><th class="n">${rs(line.gross)}</th><th>${esc(t('Total deductions'))}</th><th class="n">${rs(line.totalDeductions)}</th></tr></tfoot></table>
  <div class="net"><span>${esc(t('Net pay'))}</span><b>${rs(line.netPay)}</b></div>
  <p class="words">${esc(t('In words'))}: Rupees ${esc(amountInWords(line.netPay))} Only</p>
  ${line.pfEmployer || line.esiEmployer ? `<p class="small">${esc(t('Paid by the temple in addition (not deducted from pay)'))}: ${line.pfEmployer ? `PF ${rs(line.pfEmployer)}` : ''}${line.pfEmployer && line.esiEmployer ? ' · ' : ''}${line.esiEmployer ? `ESI ${rs(line.esiEmployer)}` : ''}</p>` : ''}
  <footer>${esc(t('This is a computer-generated payslip and needs no signature.'))}</footer>
</section>`;
}

/** HTML for one or more payslips, each exactly one A4 page (794 × 1123 px). */
export function payslipsHtml(lines, { label, temple, t = (s) => s }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t('Payslip'))} ${esc(label)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ${PRINT_FONT}; color: #111827; }
  .page { width: 794px; height: 1122px; padding: 44px 56px; overflow: hidden; page-break-after: always; position: relative; }
  ${PRINT_HEADER_CSS}
  .doc-title { margin-bottom: 16px; }
  h3 { font-size: 18px; margin: 0 0 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 13px; }
  .info th { text-align: left; color: #6b7280; font-weight: 500; padding: 4px 8px 4px 0; width: 14%; white-space: nowrap; } .info td { padding: 4px 12px 4px 0; width: 19%; font-weight: 600; }
  .att th, .att td { border: 1px solid #e5e7eb; padding: 6px; text-align: center; } .att th { background: #f9fafb; color: #6b7280; font-weight: 500; font-size: 12px; } .att td { font-weight: 700; }
  .pay th, .pay td { border: 1px solid #e5e7eb; padding: 8px 10px; text-align: left; } .pay thead th { background: #fff7ed; color: #9a3412; }
  .pay tfoot th { background: #f9fafb; } .n { text-align: right !important; white-space: nowrap; }
  .net { display: flex; justify-content: space-between; align-items: center; border: 1.5px solid #c2410c; border-radius: 6px; padding: 14px 18px; }
  .net span { font-size: 15px; color: #1f2937; font-weight: 600; } .net b { font-size: 26px; color: #c2410c; }
  .words { font-size: 13px; color: #374151; margin: 10px 0 0; } .small { font-size: 11px; color: #6b7280; margin-top: 18px; }
  footer { position: absolute; bottom: 40px; left: 56px; right: 56px; font-size: 11px; color: #9ca3af; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 8px; }
</style></head><body>
${lines.map((l) => slip(l, { label, temple, t })).join('\n')}
<script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body></html>`;
}
