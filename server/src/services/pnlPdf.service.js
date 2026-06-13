import PDFDocument from 'pdfkit';

const C = {
  green:  '#16a34a',
  orange: '#ea580c',
  red:    '#dc2626',
  dark:   '#1f2937',
  gray:   '#6b7280',
  lgray:  '#f3f4f6',
  white:  '#ffffff',
  border: '#e5e7eb',
};

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const fmt  = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtD = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function drawLine(doc, x1, y, x2, color = C.border) {
  doc.moveTo(x1, y).lineTo(x2, y).strokeColor(color).lineWidth(0.5).stroke();
}

export function generatePnLReport(res, { data, templeName = 'Mangal Grah Mandir, Amalner' }) {
  const { year, month, income, expenses, net } = data;
  const doc    = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  const period = `${MONTH_NAMES[month]} ${year}`;
  const W      = doc.page.width - 100;
  const LEFT   = 50;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="PnL-${year}-${String(month).padStart(2, '0')}.pdf"`);
  doc.pipe(res);

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.rect(LEFT, 40, W, 64).fill(C.green);
  doc.fillColor(C.white).fontSize(16).font('Helvetica-Bold')
    .text(templeName, LEFT + 14, 50, { width: W - 28 });
  doc.fontSize(9).font('Helvetica')
    .text(`MONTHLY FINANCIAL SUMMARY — ${period.toUpperCase()}`, LEFT + 14, 72);
  doc.fillColor(C.dark);

  let y = 124;

  // ── Income section ──────────────────────────────────────────────────────────
  doc.rect(LEFT, y, W, 20).fill(C.green);
  doc.fillColor(C.white).fontSize(10).font('Helvetica-Bold')
    .text('INCOME', LEFT + 8, y + 5);
  y += 20;

  const incomeRows = [
    ['Cash Donations',           fmtD(income.cash),  `${income.donationCount} entries`],
    ['Kind Donations (est. val)', fmtD(income.kind), ''],
  ];
  incomeRows.forEach(([label, amount, note], i) => {
    const bg = i % 2 === 0 ? C.lgray : C.white;
    doc.rect(LEFT, y, W, 18).fill(bg);
    doc.fillColor(C.dark).fontSize(9).font('Helvetica')
      .text(label, LEFT + 8, y + 4, { width: W * 0.55 });
    if (note) doc.fillColor(C.gray).fontSize(8).text(note, LEFT + 8 + W * 0.55, y + 5, { width: W * 0.2 });
    doc.fillColor(C.dark).fontSize(9).font('Helvetica-Bold')
      .text(amount, LEFT + W * 0.75, y + 4, { width: W * 0.23, align: 'right' });
    y += 18;
  });

  // Total income row
  doc.rect(LEFT, y, W, 22).fill('#dcfce7');
  doc.fillColor(C.green).fontSize(10).font('Helvetica-Bold')
    .text('Total Income', LEFT + 8, y + 5)
    .text(fmtD(income.total), LEFT + W * 0.75, y + 5, { width: W * 0.23, align: 'right' });
  y += 22 + 14;

  // ── Expenses section ────────────────────────────────────────────────────────
  doc.rect(LEFT, y, W, 20).fill(C.orange);
  doc.fillColor(C.white).fontSize(10).font('Helvetica-Bold')
    .text('EXPENSES', LEFT + 8, y + 5);
  y += 20;

  // Table header
  doc.rect(LEFT, y, W, 16).fill('#fff7ed');
  doc.fillColor(C.gray).fontSize(8).font('Helvetica-Bold');
  doc.text('Category',  LEFT + 8,         y + 3, { width: W * 0.32 });
  doc.text('Budgeted',  LEFT + W * 0.32,  y + 3, { width: W * 0.2,  align: 'right' });
  doc.text('Actual',    LEFT + W * 0.53,  y + 3, { width: W * 0.2,  align: 'right' });
  doc.text('Variance',  LEFT + W * 0.74,  y + 3, { width: W * 0.26, align: 'right' });
  y += 16;

  expenses.byCategory.forEach(({ label, actual, budget }, i) => {
    const bg = i % 2 === 0 ? C.lgray : C.white;
    doc.rect(LEFT, y, W, 18).fill(bg);

    const variance = budget > 0 ? budget - actual : null;
    const varColor = variance === null ? C.gray : (variance >= 0 ? C.green : C.red);
    const varText  = variance === null ? '—' : (variance >= 0 ? `-${fmt(variance)}` : `+${fmt(Math.abs(variance))}`);

    doc.fillColor(C.dark).fontSize(9).font('Helvetica')
      .text(label || '', LEFT + 8, y + 4, { width: W * 0.32 });
    doc.text(budget > 0 ? fmt(budget) : '—', LEFT + W * 0.32, y + 4, { width: W * 0.2, align: 'right' });
    doc.font('Helvetica-Bold')
      .text(fmt(actual), LEFT + W * 0.53, y + 4, { width: W * 0.2, align: 'right' });
    doc.fillColor(varColor).font('Helvetica')
      .text(varText, LEFT + W * 0.74, y + 4, { width: W * 0.26, align: 'right' });
    y += 18;
  });

  // Total expenses row
  doc.rect(LEFT, y, W, 22).fill('#fff7ed');
  doc.fillColor(C.orange).fontSize(10).font('Helvetica-Bold')
    .text('Total Expenses', LEFT + 8, y + 5);
  if (expenses.budgetTotal > 0) {
    doc.fillColor(C.gray).fontSize(9).font('Helvetica')
      .text(fmt(expenses.budgetTotal), LEFT + W * 0.32, y + 6, { width: W * 0.2, align: 'right' });
  }
  doc.fillColor(C.orange).fontSize(10).font('Helvetica-Bold')
    .text(fmtD(expenses.total), LEFT + W * 0.53, y + 5, { width: W * 0.2, align: 'right' });
  y += 22 + 14;

  if (y > doc.page.height - 120) { doc.addPage(); y = 50; }

  // Pending note
  if (expenses.pendingCount > 0) {
    doc.rect(LEFT, y, W, 18).fill('#fef3c7');
    doc.fillColor('#b45309').fontSize(8).font('Helvetica')
      .text(
        `Note: ${expenses.pendingCount} expense${expenses.pendingCount > 1 ? 's' : ''} (${fmtD(expenses.pendingAmount)}) are pending approval and not included in total.`,
        LEFT + 8, y + 4, { width: W - 16 }
      );
    y += 18 + 14;
  }

  // ── Net Balance ─────────────────────────────────────────────────────────────
  const isSurplus = net >= 0;
  const netColor  = isSurplus ? C.green : C.red;
  doc.rect(LEFT, y, W, 48).fill(isSurplus ? '#dcfce7' : '#fee2e2');
  doc.rect(LEFT, y, W, 48).strokeColor(netColor).lineWidth(1.5).stroke();

  doc.fillColor(netColor).fontSize(11).font('Helvetica-Bold')
    .text(isSurplus ? 'SURPLUS' : 'DEFICIT', LEFT + 16, y + 8);
  doc.fontSize(9).font('Helvetica')
    .text('Total Income − Total Expenses', LEFT + 16, y + 26);
  doc.fontSize(18).font('Helvetica-Bold')
    .text(fmtD(Math.abs(net)), LEFT + W * 0.5, y + 10, { width: W * 0.48, align: 'right' });

  // ── Footer on all pages ──────────────────────────────────────────────────────
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    const fy = doc.page.height - 36;
    drawLine(doc, LEFT, fy, LEFT + W);
    doc.fillColor(C.gray).fontSize(7).font('Helvetica')
      .text(
        `${templeName} · Generated on ${new Date().toLocaleDateString('en-IN')} · Page ${i + 1} of ${pageCount}`,
        LEFT, fy + 6, { width: W, align: 'center' }
      );
  }

  doc.end();
}
