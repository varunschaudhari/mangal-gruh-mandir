import PDFDocument from 'pdfkit';

const C = { primary: '#ea580c', dark: '#1f2937', gray: '#6b7280', light: '#fff7ed', white: '#ffffff' };

const fmt  = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const CATEGORY_LABELS = {
  electricity: 'Electricity', water: 'Water', salary: 'Salary',
  priest_fees: 'Priest Fees', maintenance: 'Maintenance', decoration: 'Decoration',
  printing: 'Printing & Stationery', miscellaneous: 'Miscellaneous',
};
const PM_LABELS   = { cash: 'Cash', upi: 'UPI', cheque: 'Cheque' };
const STATUS_LABELS = { pending_approval: 'Pending', approved: 'Approved', rejected: 'Rejected', voided: 'Voided' };

export function generateExpenseReport(res, { expenses, from, to, templeName = 'Mangal Grah Mandir, Amalner' }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  const fileName = `Expenses-${from || 'all'}-to-${to || 'all'}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  doc.pipe(res);

  const W    = doc.page.width - 100;
  const LEFT = 50;

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.rect(LEFT, 40, W, 60).fill(C.primary);
  doc.fillColor(C.white).fontSize(16).font('Helvetica-Bold')
    .text(templeName, LEFT + 12, 50, { width: W - 24 });
  doc.fontSize(9).font('Helvetica').text('EXPENSE REPORT', LEFT + 12, 72);

  // Period
  let y = 118;
  if (from || to) {
    doc.fillColor(C.gray).fontSize(8).font('Helvetica')
      .text(`Period: ${from ? fmtD(from) : 'Beginning'} — ${to ? fmtD(to) : 'Today'}`, LEFT, y);
    y += 14;
  }
  doc.fillColor(C.gray).fontSize(8).font('Helvetica')
    .text(`Generated: ${fmtD(new Date())}  ·  Total entries: ${expenses.length}`, LEFT, y);
  y += 18;

  doc.moveTo(LEFT, y).lineTo(LEFT + W, y).strokeColor('#E5E7EB').lineWidth(1).stroke();
  y += 14;

  // ── Summary by category ────────────────────────────────────────────────────
  const approvedOnly = expenses.filter((e) => e.status === 'approved');
  const byCategory   = {};
  for (const e of approvedOnly) {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
  }
  const grandTotal = approvedOnly.reduce((s, e) => s + e.amount, 0);

  if (Object.keys(byCategory).length > 0) {
    doc.fillColor(C.gray).fontSize(8).font('Helvetica').text('APPROVED EXPENSE SUMMARY', LEFT, y);
    y += 10;

    for (const [cat, total] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
      const barW = Math.max(4, Math.round((total / grandTotal) * (W - 200)));
      doc.rect(LEFT, y, barW, 12).fill('#FED7AA');
      doc.fillColor(C.dark).fontSize(8).font('Helvetica')
        .text(CATEGORY_LABELS[cat] || cat, LEFT + barW + 6, y + 2, { width: W - barW - 120 });
      doc.fillColor(C.dark).fontSize(8).font('Helvetica-Bold')
        .text(fmt(total), LEFT + W - 110, y + 2, { width: 110, align: 'right' });
      y += 16;
    }

    // Grand total bar
    doc.rect(LEFT, y, W, 18).fill(C.dark);
    doc.fillColor(C.white).fontSize(9).font('Helvetica-Bold')
      .text('TOTAL (APPROVED)', LEFT + 6, y + 4, { width: W - 120 });
    doc.text(fmt(grandTotal), LEFT + W - 110, y + 4, { width: 106, align: 'right' });
    y += 28;
  }

  // ── Expense table ──────────────────────────────────────────────────────────
  doc.fillColor(C.gray).fontSize(8).font('Helvetica').text('ALL ENTRIES', LEFT, y);
  y += 10;

  const COLS = [
    { label: 'No.',         w: 72  },
    { label: 'Date',        w: 70  },
    { label: 'Category',    w: 90  },
    { label: 'Description', w: 0   }, // flex
    { label: 'Payee',       w: 80  },
    { label: 'Mode',        w: 42  },
    { label: 'Amount',      w: 70  },
    { label: 'Status',      w: 52  },
  ];
  const fixedW = COLS.reduce((s, c) => s + c.w, 0);
  COLS[3].w    = W - fixedW;

  // Table header
  doc.rect(LEFT, y, W, 16).fill(C.primary);
  let cx = LEFT + 4;
  COLS.forEach((c) => {
    doc.fillColor(C.white).fontSize(7).font('Helvetica-Bold').text(c.label, cx, y + 4, { width: c.w - 4 });
    cx += c.w;
  });
  y += 16;

  const STATUS_COLORS = { approved: '#16a34a', pending_approval: '#d97706', rejected: '#dc2626', voided: '#9ca3af' };

  let rowNum = 0;
  for (const e of expenses) {
    if (y > doc.page.height - 80) {
      doc.addPage();
      y = 50;
    }
    const rowH = 14;
    const bg   = rowNum % 2 === 0 ? C.white : '#FFF7ED';
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

    cx = LEFT + 4;
    cells.forEach((text, i) => {
      const col = COLS[i];
      if (i === 6) {
        // Amount right-aligned
        doc.fillColor(C.dark).fontSize(7).font('Helvetica-Bold')
          .text(String(text), cx, y + 3, { width: col.w - 8, align: 'right' });
      } else if (i === 7) {
        // Status coloured
        doc.fillColor(STATUS_COLORS[e.status] || C.gray).fontSize(7).font('Helvetica-Bold')
          .text(String(text), cx, y + 3, { width: col.w - 4 });
      } else {
        doc.fillColor(C.dark).fontSize(7).font('Helvetica')
          .text(String(text), cx, y + 3, { width: col.w - 4, lineBreak: false });
      }
      cx += col.w;
    });

    y += rowH;
    rowNum++;
  }

  // Footer on every page
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fillColor(C.gray).fontSize(7).font('Helvetica')
      .text(`${templeName} · Expense Report · Page ${i + 1} of ${pageCount}`,
        LEFT, doc.page.height - 32, { width: W, align: 'center' });
  }

  doc.end();
}
