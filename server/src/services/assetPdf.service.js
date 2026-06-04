import PDFDocument from 'pdfkit';

const C = { primary: '#7c3aed', dark: '#1f2937', gray: '#6b7280', light: '#f5f3ff', white: '#ffffff', red: '#dc2626' };
const STATUS_LABELS = { approved: 'Approved', checked_out: 'Checked Out', returned: 'Returned', overdue: 'Overdue', cancelled: 'Cancelled' };

function fDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function generateAssetReportPDF(res, { transactions, from, to }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="asset-report-${new Date().toISOString().split('T')[0]}.pdf"`);
  doc.pipe(res);

  const W    = doc.page.width - 80;
  const LEFT = 40;

  // ── Header ────────────────────────────────────────────────────────────────
  doc.rect(LEFT, 30, W, 56).fill(C.primary);
  doc.fillColor(C.white).fontSize(16).font('Helvetica-Bold')
    .text('Mangal Grah Mandir, Amalner', LEFT + 10, 40, { width: W - 20 });
  doc.fontSize(9).font('Helvetica')
    .text('Asset Borrow Transactions Report', LEFT + 10, 60);

  const rangeLabel = from || to
    ? `${from ? fDate(from) : 'Beginning'} – ${to ? fDate(to) : 'Today'}`
    : 'All Time';

  doc.fillColor(C.dark).fontSize(9).font('Helvetica')
    .text(`Period: ${rangeLabel}`, LEFT, 100)
    .text(`Generated: ${fDate(new Date())}`, LEFT + W - 140, 100, { align: 'right' });

  // ── Summary boxes ─────────────────────────────────────────────────────────
  let y = 118;
  const total   = transactions.length;
  const returned = transactions.filter((t) => t.status === 'returned').length;
  const overdue  = transactions.filter((t) => t.status === 'overdue').length;
  const fined    = transactions.filter((t) => t.fineApplied).reduce((s, t) => s + (t.fineAmount || 0), 0);

  const boxes = [
    { label: 'Total Records', value: total },
    { label: 'Returned',      value: returned },
    { label: 'Overdue',       value: overdue },
    { label: 'Fines Collected', value: `₹${fined.toLocaleString('en-IN')}` },
  ];

  const bw = (W - 9) / 4;
  boxes.forEach((b, i) => {
    const bx = LEFT + i * (bw + 3);
    doc.rect(bx, y, bw, 36).fill(C.light);
    doc.fillColor(C.primary).fontSize(16).font('Helvetica-Bold')
      .text(String(b.value), bx, y + 4, { width: bw, align: 'center' });
    doc.fillColor(C.gray).fontSize(7).font('Helvetica')
      .text(b.label, bx, y + 24, { width: bw, align: 'center' });
  });

  // ── Table ─────────────────────────────────────────────────────────────────
  y += 50;
  const cols = [
    { label: 'Ref No.',   w: 90  },
    { label: 'Asset',     w: 110 },
    { label: 'Borrower',  w: 80  },
    { label: 'Qty', w: 25 },
    { label: 'Status',    w: 60  },
    { label: 'Return By', w: 62  },
    { label: 'Fine (₹)',  w: 48  },
  ];

  // Header row
  doc.rect(LEFT, y, W, 16).fill(C.primary);
  let cx = LEFT + 4;
  cols.forEach((c) => {
    doc.fillColor(C.white).fontSize(7).font('Helvetica-Bold')
      .text(c.label, cx, y + 4, { width: c.w - 4 });
    cx += c.w;
  });
  y += 16;

  let rowNum = 0;
  for (const t of transactions) {
    if (y > doc.page.height - 60) {
      doc.addPage();
      y = 40;
    }

    const bg = rowNum % 2 === 0 ? C.white : '#F5F3FF';
    doc.rect(LEFT, y, W, 14).fill(bg);

    const isOverdue = t.status === 'overdue';
    cx = LEFT + 4;
    const cells = [
      t.transactionNumber || '—',
      t.asset?.name || '—',
      t.borrower?.name || '—',
      String(t.quantityBorrowed),
      STATUS_LABELS[t.status] || t.status,
      fDate(t.expectedReturnDate),
      t.fineApplied ? `₹${t.fineAmount}` : (t.fineWaived ? 'Waived' : '—'),
    ];

    cells.forEach((text, i) => {
      doc.fillColor(isOverdue && i === 4 ? C.red : C.dark)
        .fontSize(7).font(isOverdue && i === 4 ? 'Helvetica-Bold' : 'Helvetica')
        .text(String(text), cx, y + 3, { width: cols[i].w - 4, ellipsis: true });
      cx += cols[i].w;
    });

    doc.moveTo(LEFT, y + 14).lineTo(LEFT + W, y + 14).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
    y += 14;
    rowNum++;
  }

  // ── Footer on each page ───────────────────────────────────────────────────
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fillColor(C.gray).fontSize(7).font('Helvetica')
      .text(`Page ${i + 1} of ${pageCount}  ·  Mangal Grah Mandir Asset Management`, LEFT, doc.page.height - 30, { width: W, align: 'center' });
  }

  doc.end();
}
