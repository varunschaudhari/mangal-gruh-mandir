import { createPdf, reportHeader, pageFooters, ensureSpace, PDF_COLORS, mid } from './pdfLayout.js';

const C = {
  green:  '#16a34a',
  accent: PDF_COLORS.accent,
  red:    '#dc2626',
  dark:   PDF_COLORS.text,
  gray:   PDF_COLORS.muted,
  lgray:  '#f3f4f6',
  white:  '#ffffff',
  border: PDF_COLORS.line,
};

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const fmt  = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtD = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Section title (INCOME / EXPENSES) in its colour with a rule under it — no filled band. */
function sectionTitle(doc, label, color, y, left, width) {
  doc.fillColor(color).fontSize(10).font('Helvetica-Bold').text(label, left + 8, y + mid(20, 10));
  doc.moveTo(left, y + 20).lineTo(left + width, y + 20).lineWidth(1.2).strokeColor(color).stroke();
  return y + 21;
}

export function generatePnLReport(res, { data }) {
  const { year, month, income, expenses, net } = data;
  const doc    = createPdf({ size: 'A4', margin: 50 });
  const period = `${MONTH_NAMES[month]} ${year}`;
  const W      = doc.page.width - 100;
  const LEFT   = 50;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="PnL-${year}-${String(month).padStart(2, '0')}.pdf"`);
  doc.pipe(res);

  let y = reportHeader(doc, { title: 'Monthly Financial Summary', subtitle: `Period: ${period}` });
  y += 4;

  // ── Income section ──────────────────────────────────────────────────────────
  y = sectionTitle(doc, 'INCOME', C.green, y, LEFT, W);

  const incomeRows = [
    ['Cash Donations',           fmtD(income.cash),  `${income.donationCount} entries`],
    ['Kind Donations (est. val)', fmtD(income.kind), ''],
    ['Abhishek / Puja Bookings', fmtD(income.bookings || 0), `${income.bookingCount || 0} bookings`],
  ];
  incomeRows.forEach(([label, amount, note], i) => {
    const bg = i % 2 === 0 ? C.lgray : C.white;
    doc.rect(LEFT, y, W, 18).fill(bg);
    doc.fillColor(C.dark).fontSize(9).font('Helvetica')
      .text(label, LEFT + 8, y + mid(18, 9), { width: W * 0.55 });
    if (note) doc.fillColor(C.gray).fontSize(8).text(note, LEFT + 8 + W * 0.55, y + mid(18, 8), { width: W * 0.2 });
    doc.fillColor(C.dark).fontSize(9).font('Helvetica-Bold')
      .text(amount, LEFT + W * 0.75, y + mid(18, 9), { width: W * 0.23, align: 'right' });
    y += 18;
  });

  // Total income row
  doc.rect(LEFT, y, W, 22).fill('#dcfce7');
  doc.fillColor(C.green).fontSize(10).font('Helvetica-Bold')
    .text('Total Income', LEFT + 8, y + mid(22, 10))
    .text(fmtD(income.total), LEFT + W * 0.75, y + mid(22, 10), { width: W * 0.23, align: 'right' });
  y += 22 + 14;

  // ── Expenses section ────────────────────────────────────────────────────────
  y = ensureSpace(doc, y, 21 + 16 + 18 * 2);
  y = sectionTitle(doc, 'EXPENSES', C.accent, y, LEFT, W);

  // Table header (repeated at the top of a new page)
  const drawExpHeader = (startY) => {
    doc.rect(LEFT, startY, W, 16).fill(PDF_COLORS.accentSoft);
    const ty = startY + mid(16, 8);
    doc.fillColor(C.accent).fontSize(8).font('Helvetica-Bold');
    doc.text('Category',  LEFT + 8,         ty, { width: W * 0.32 });
    doc.text('Budgeted',  LEFT + W * 0.32,  ty, { width: W * 0.2,  align: 'right' });
    doc.text('Actual',    LEFT + W * 0.53,  ty, { width: W * 0.2,  align: 'right' });
    doc.text('Variance',  LEFT + W * 0.74,  ty, { width: W * 0.24, align: 'right' });
    return startY + 16;
  };
  y = drawExpHeader(y);

  expenses.byCategory.forEach(({ label, actual, budget }, i) => {
    y = ensureSpace(doc, y, 18, { onNewPage: drawExpHeader });
    const bg = i % 2 === 0 ? C.lgray : C.white;
    doc.rect(LEFT, y, W, 18).fill(bg);

    const variance = budget > 0 ? budget - actual : null;
    const varColor = variance === null ? C.gray : (variance >= 0 ? C.green : C.red);
    const varText  = variance === null ? '—' : (variance >= 0 ? `-${fmt(variance)}` : `+${fmt(Math.abs(variance))}`);
    const ty = y + mid(18, 9);

    doc.fillColor(C.dark).fontSize(9).font('Helvetica')
      .text(label || '', LEFT + 8, ty, { width: W * 0.32 - 8, height: 18, ellipsis: true });
    doc.text(budget > 0 ? fmt(budget) : '—', LEFT + W * 0.32, ty, { width: W * 0.2, align: 'right' });
    doc.font('Helvetica-Bold')
      .text(fmt(actual), LEFT + W * 0.53, ty, { width: W * 0.2, align: 'right' });
    doc.fillColor(varColor).font('Helvetica')
      .text(varText, LEFT + W * 0.74, ty, { width: W * 0.24, align: 'right' });
    y += 18;
  });

  // Total expenses row
  y = ensureSpace(doc, y, 22, { onNewPage: drawExpHeader });
  doc.rect(LEFT, y, W, 22).fill(PDF_COLORS.accentSoft);
  doc.moveTo(LEFT, y).lineTo(LEFT + W, y).lineWidth(0.8).strokeColor(C.accent).stroke();
  doc.fillColor(C.accent).fontSize(10).font('Helvetica-Bold')
    .text('Total Expenses', LEFT + 8, y + mid(22, 10));
  if (expenses.budgetTotal > 0) {
    doc.fillColor(C.gray).fontSize(9).font('Helvetica')
      .text(fmt(expenses.budgetTotal), LEFT + W * 0.32, y + mid(22, 9), { width: W * 0.2, align: 'right' });
  }
  doc.fillColor(C.accent).fontSize(10).font('Helvetica-Bold')
    .text(fmtD(expenses.total), LEFT + W * 0.53, y + mid(22, 10), { width: W * 0.2, align: 'right' });
  y += 22 + 14;

  y = ensureSpace(doc, y, 18 + 14 + 48);

  // Pending note
  if (expenses.pendingCount > 0) {
    doc.rect(LEFT, y, W, 18).fill('#fef3c7');
    doc.fillColor('#b45309').fontSize(8).font('Helvetica')
      .text(
        `Note: ${expenses.pendingCount} expense${expenses.pendingCount > 1 ? 's' : ''} (${fmtD(expenses.pendingAmount)}) are pending approval and not included in total.`,
        LEFT + 8, y + mid(18, 8), { width: W - 16, height: 18, ellipsis: true }
      );
    y += 18 + 14;
  }

  // ── Net Balance ─────────────────────────────────────────────────────────────
  const isSurplus = net >= 0;
  const netColor  = isSurplus ? C.green : C.red;
  doc.rect(LEFT, y, W, 48).fill(isSurplus ? '#dcfce7' : '#fee2e2');
  doc.rect(LEFT, y, W, 48).strokeColor(netColor).lineWidth(1.5).stroke();

  doc.fillColor(netColor).fontSize(11).font('Helvetica-Bold')
    .text(isSurplus ? 'SURPLUS' : 'DEFICIT', LEFT + 16, y + 3);
  doc.fontSize(9).font('Helvetica')
    .text('Total Income − Total Expenses', LEFT + 16, y + 22);
  doc.fontSize(18).font('Helvetica-Bold')
    .text(fmtD(Math.abs(net)), LEFT + W * 0.5, y + mid(48, 18), { width: W * 0.48, align: 'right' });

  pageFooters(doc, { label: `Monthly Financial Summary · ${period}` });
  doc.end();
}
