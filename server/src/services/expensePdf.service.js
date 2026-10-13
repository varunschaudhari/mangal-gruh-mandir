import { createPdf, reportHeader, pageFooters, ensureSpace, PDF_COLORS, mid } from './pdfLayout.js';

const C = { accent: PDF_COLORS.accent, dark: PDF_COLORS.text, gray: PDF_COLORS.muted, light: PDF_COLORS.accentSoft, white: '#ffffff' };

const fmt  = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const CATEGORY_LABELS = {
  electricity: 'Electricity', water: 'Water', salary: 'Salary',
  priest_fees: 'Priest Fees', maintenance: 'Maintenance', decoration: 'Decoration',
  printing: 'Printing & Stationery', miscellaneous: 'Miscellaneous',
};
const PM_LABELS   = { cash: 'Cash', upi: 'UPI', cheque: 'Cheque', bank: 'Bank transfer' };
const STATUS_LABELS = { pending_approval: 'Pending', approved: 'Approved', rejected: 'Rejected', voided: 'Voided' };

export function generateExpenseReport(res, { expenses, from, to }) {
  const doc = createPdf({ size: 'A4', margin: 50 });
  const fileName = `Expenses-${from || 'all'}-to-${to || 'all'}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  doc.pipe(res);

  const W    = doc.page.width - 100;
  const LEFT = 50;

  const subtitle = [
    (from || to) && `Period: ${from ? fmtD(from) : 'Beginning'} — ${to ? fmtD(to) : 'Today'}`,
    `Total entries: ${expenses.length}`,
  ].filter(Boolean).join('   ·   ');
  let y = reportHeader(doc, { title: 'Expense Report', subtitle });

  // ── Summary by category ────────────────────────────────────────────────────
  const approvedOnly = expenses.filter((e) => e.status === 'approved');
  const byCategory   = {};
  for (const e of approvedOnly) {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
  }
  const grandTotal = approvedOnly.reduce((s, e) => s + e.amount, 0);

  if (Object.keys(byCategory).length > 0) {
    doc.fillColor(C.gray).fontSize(8).font('Helvetica').text('APPROVED EXPENSE SUMMARY', LEFT, y);
    y = doc.y + 2;

    for (const [cat, total] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
      // Category name in its own column, then a bar for its share, then the amount
      const LABEL_W = 140;
      const barW = Math.max(3, Math.round((total / grandTotal) * (W - LABEL_W - 130)));
      doc.fillColor(C.dark).fontSize(8).font('Helvetica')
        .text(CATEGORY_LABELS[cat] || cat, LEFT, y + mid(12, 8), { width: LABEL_W - 8, height: 12, ellipsis: true });
      doc.rect(LEFT + LABEL_W, y + 1, barW, 10).fill('#FED7AA');
      doc.fillColor(C.dark).fontSize(8).font('Helvetica-Bold')
        .text(fmt(total), LEFT + W - 110, y + mid(12, 8), { width: 110, align: 'right' });
      y += 16;
    }

    // Grand total bar
    doc.rect(LEFT, y, W, 18).fill(C.light);
    doc.moveTo(LEFT, y).lineTo(LEFT + W, y).lineWidth(0.8).strokeColor(C.accent).stroke();
    doc.moveTo(LEFT, y + 18).lineTo(LEFT + W, y + 18).lineWidth(0.8).strokeColor(C.accent).stroke();
    doc.fillColor(C.accent).fontSize(9).font('Helvetica-Bold')
      .text('TOTAL (APPROVED)', LEFT + 6, y + mid(18, 9), { width: W - 120 });
    doc.text(fmt(grandTotal), LEFT + W - 110, y + mid(18, 9), { width: 106, align: 'right' });
    y += 28;
  }

  // ── Expense table ──────────────────────────────────────────────────────────
  doc.fillColor(C.gray).fontSize(8).font('Helvetica').text('ALL ENTRIES', LEFT, y);
  y = doc.y + 2;

  const COLS = [
    { label: 'No.',         w: 60  },
    { label: 'Date',        w: 52  },
    { label: 'Category',    w: 72  },
    { label: 'Description', w: 0   }, // flex
    { label: 'Payee',       w: 76  },
    { label: 'Mode',        w: 52  },
    { label: 'Amount',      w: 60  },
    { label: 'Status',      w: 42  },
  ];
  const fixedW = COLS.reduce((s, c) => s + c.w, 0);
  COLS[3].w    = W - fixedW;

  // Table header (repeated at the top of every new page)
  const drawHeader = (startY) => {
    doc.rect(LEFT, startY, W, 16).fill(C.light);
    doc.moveTo(LEFT, startY + 16).lineTo(LEFT + W, startY + 16).lineWidth(0.8).strokeColor(C.accent).stroke();
    let hx = LEFT + 4;
    COLS.forEach((c, i) => {
      doc.fillColor(C.accent).fontSize(7).font('Helvetica-Bold')
        .text(c.label, hx, startY + mid(16, 7), { width: i === 6 ? c.w - 8 : c.w - 4, align: i === 6 ? 'right' : 'left' });
      hx += c.w;
    });
    return startY + 16;
  };
  y = drawHeader(y);

  const STATUS_COLORS = { approved: '#16a34a', pending_approval: '#d97706', rejected: '#dc2626', voided: '#9ca3af' };

  let rowNum = 0;
  const rowH = 14;
  for (const e of expenses) {
    y = ensureSpace(doc, y, rowH, { onNewPage: drawHeader });
    const bg   = rowNum % 2 === 0 ? C.white : C.light;
    doc.rect(LEFT, y, W, rowH).fill(bg);

    const cells = [
      e.expenseNumber,
      fmtD(e.expenseDate),
      CATEGORY_LABELS[e.category] || e.category,
      e.description,
      e.payee || '—',
      PM_LABELS[e.paymentMode] || e.paymentMode,
      fmt(e.amount),
      STATUS_LABELS[e.status] || e.status,
    ];

    let cx = LEFT + 4;
    const ty = y + mid(rowH, 7);
    cells.forEach((text, i) => {
      const col = COLS[i];
      const one = { height: rowH, ellipsis: true };
      if (i === 6) {
        // Amount right-aligned
        doc.fillColor(C.dark).fontSize(7).font('Helvetica-Bold')
          .text(String(text), cx, ty, { width: col.w - 8, align: 'right', ...one });
      } else if (i === 7) {
        // Status coloured
        doc.fillColor(STATUS_COLORS[e.status] || C.gray).fontSize(7).font('Helvetica-Bold')
          .text(String(text), cx, ty, { width: col.w - 4, ...one });
      } else {
        doc.fillColor(C.dark).fontSize(7).font('Helvetica')
          .text(String(text ?? ''), cx, ty, { width: col.w - 4, ...one });
      }
      cx += col.w;
    });

    y += rowH;
    rowNum++;
  }

  pageFooters(doc, { label: 'Expense Report' });
  doc.end();
}
