import { localDateStr } from '../utils/dates.js';
import { createPdf, reportHeader, pageFooters, ensureSpace, PDF_COLORS, mid } from './pdfLayout.js';

const C = { accent: PDF_COLORS.accent, dark: PDF_COLORS.text, gray: PDF_COLORS.muted, light: PDF_COLORS.accentSoft, white: '#ffffff', red: '#dc2626' };
const STATUS_LABELS = { approved: 'Approved', checked_out: 'Checked Out', returned: 'Returned', overdue: 'Overdue', cancelled: 'Cancelled' };
const ROW_H = 14;

function fDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function generateAssetReportPDF(res, { transactions, from, to }) {
  const doc = createPdf({ size: 'A4', margin: 40 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="asset-report-${localDateStr()}.pdf"`);
  doc.pipe(res);

  const W    = doc.page.width - 80;
  const LEFT = 40;

  const rangeLabel = from || to
    ? `${from ? fDate(from) : 'Beginning'} – ${to ? fDate(to) : 'Today'}`
    : 'All Time';

  let y = reportHeader(doc, { title: 'Asset Borrow Transactions Report', subtitle: `Period: ${rangeLabel}` });

  // ── Summary boxes ─────────────────────────────────────────────────────────
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
    doc.fillColor(C.accent).fontSize(16).font('Helvetica-Bold')
      .text(String(b.value), bx, y + 0.5, { width: bw, align: 'center' });
    doc.fillColor(C.gray).fontSize(7).font('Helvetica')
      .text(b.label, bx, y + 20, { width: bw, align: 'center' });
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

  // Header row (repeated at the top of every new page)
  const drawHeader = (startY) => {
    doc.rect(LEFT, startY, W, 16).fill(C.light);
    doc.moveTo(LEFT, startY + 16).lineTo(LEFT + W, startY + 16).lineWidth(0.8).strokeColor(C.accent).stroke();
    let hx = LEFT + 4;
    cols.forEach((c) => {
      doc.fillColor(C.accent).fontSize(7).font('Helvetica-Bold')
        .text(c.label, hx, startY + mid(16, 7), { width: c.w - 4, height: 16, ellipsis: true });
      hx += c.w;
    });
    return startY + 16;
  };
  y = drawHeader(y);

  let rowNum = 0;
  for (const t of transactions) {
    y = ensureSpace(doc, y, ROW_H, { onNewPage: drawHeader });

    const bg = rowNum % 2 === 0 ? C.white : C.light;
    doc.rect(LEFT, y, W, ROW_H).fill(bg);

    const isOverdue = t.status === 'overdue';
    let cx = LEFT + 4;
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
        .text(String(text), cx, y + mid(ROW_H, 7), { width: cols[i].w - 4, height: ROW_H, ellipsis: true });
      cx += cols[i].w;
    });

    doc.moveTo(LEFT, y + ROW_H).lineTo(LEFT + W, y + ROW_H).strokeColor(PDF_COLORS.line).lineWidth(0.5).stroke();
    y += ROW_H;
    rowNum++;
  }

  pageFooters(doc, { label: 'Asset Management' });
  doc.end();
}
