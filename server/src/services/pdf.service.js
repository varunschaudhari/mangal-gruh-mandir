import PDFDocument from 'pdfkit';

const COLORS = {
  primary: '#ea580c',   // saffron/orange
  dark: '#1f2937',
  gray: '#6b7280',
  lightGray: '#f3f4f6',
  white: '#ffffff',
  success: '#16a34a',
  danger: '#dc2626',
  warning: '#d97706',
  info: '#2563eb',
};

const TYPE_COLORS = {
  STOCK_IN:  COLORS.success,
  STOCK_OUT: COLORS.warning,
  TRANSFER:  COLORS.info,
  WASTAGE:   COLORS.danger,
};

const TYPE_LABELS = {
  STOCK_IN:  'Stock In',
  STOCK_OUT: 'Stock Out',
  TRANSFER:  'Transfer',
  WASTAGE:   'Wastage',
};

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatQty(qty, symbol) {
  return `${qty} ${symbol || ''}`.trim();
}

export function generateDailyReportPDF(res, { date, department, transactions, summary }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="daily-report-${date}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width - 80; // usable width
  const LEFT = 40;

  // ── Header ────────────────────────────────────────────────────────────────
  doc.rect(LEFT, 30, W, 60).fill(COLORS.primary);
  doc.fillColor(COLORS.white)
    .fontSize(18).font('Helvetica-Bold')
    .text('Mangal Grah Mandir, Amalner', LEFT + 10, 42, { width: W - 20 });
  doc.fontSize(10).font('Helvetica')
    .text('Daily Stock Movement Report', LEFT + 10, 64);

  // Date & Dept info
  doc.fillColor(COLORS.dark).fontSize(10).font('Helvetica-Bold');
  const headerY = 105;
  doc.text(`Date: ${formatDate(date)}`, LEFT, headerY);
  if (department) {
    doc.text(`Department: ${department}`, LEFT, headerY + 16);
  }
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, LEFT, headerY + (department ? 32 : 16));

  let y = headerY + (department ? 56 : 40);

  // ── Summary Cards ─────────────────────────────────────────────────────────
  doc.fontSize(12).font('Helvetica-Bold').fillColor(COLORS.dark)
    .text('Summary', LEFT, y);
  y += 18;

  const cardW = (W - 15) / 4;
  const summaryData = [
    { label: 'Stock In',  count: summary.STOCK_IN.count,  qty: summary.STOCK_IN.totalQty,  color: COLORS.success },
    { label: 'Stock Out', count: summary.STOCK_OUT.count, qty: summary.STOCK_OUT.totalQty, color: COLORS.warning },
    { label: 'Transfers', count: summary.TRANSFER.count,  qty: summary.TRANSFER.totalQty,  color: COLORS.info },
    { label: 'Wastage',   count: summary.WASTAGE.count,   qty: summary.WASTAGE.totalQty,   color: COLORS.danger },
  ];

  summaryData.forEach((s, i) => {
    const x = LEFT + i * (cardW + 5);
    doc.rect(x, y, cardW, 52).fillAndStroke(COLORS.lightGray, COLORS.lightGray);
    doc.rect(x, y, 4, 52).fill(s.color);
    doc.fillColor(s.color).fontSize(9).font('Helvetica-Bold').text(s.label, x + 10, y + 8, { width: cardW - 14 });
    doc.fillColor(COLORS.dark).fontSize(18).font('Helvetica-Bold').text(String(s.count), x + 10, y + 22);
    doc.fillColor(COLORS.gray).fontSize(8).font('Helvetica').text(`Total: ${s.qty}`, x + 10, y + 44);
  });

  y += 68;

  // ── Transactions Table ────────────────────────────────────────────────────
  if (transactions.length === 0) {
    doc.fontSize(11).fillColor(COLORS.gray).font('Helvetica')
      .text('No transactions recorded for this date.', LEFT, y, { align: 'center', width: W });
    doc.end();
    return;
  }

  // Group by type for easier reading
  const groups = {};
  for (const t of transactions) {
    if (!groups[t.transactionType]) groups[t.transactionType] = [];
    groups[t.transactionType].push(t);
  }

  const COL = {
    txn:     { x: LEFT,       w: 90 },
    product: { x: LEFT + 92,  w: 130 },
    from:    { x: LEFT + 224, w: 80 },
    to:      { x: LEFT + 306, w: 80 },
    qty:     { x: LEFT + 388, w: 60 },
    by:      { x: LEFT + 450, w: 80 },
  };

  const drawTableHeader = (startY) => {
    doc.rect(LEFT, startY, W, 16).fill(COLORS.dark);
    doc.fillColor(COLORS.white).fontSize(7).font('Helvetica-Bold');
    doc.text('TXN #', COL.txn.x + 2, startY + 4, { width: COL.txn.w });
    doc.text('Product', COL.product.x, startY + 4, { width: COL.product.w });
    doc.text('From', COL.from.x, startY + 4, { width: COL.from.w });
    doc.text('To', COL.to.x, startY + 4, { width: COL.to.w });
    doc.text('Qty', COL.qty.x, startY + 4, { width: COL.qty.w, align: 'right' });
    doc.text('By', COL.by.x, startY + 4, { width: COL.by.w });
    return startY + 18;
  };

  for (const [type, rows] of Object.entries(groups)) {
    if (y > doc.page.height - 100) { doc.addPage(); y = 40; }

    // Section heading
    doc.rect(LEFT, y, W, 18).fill(COLORS.lightGray);
    doc.fillColor(TYPE_COLORS[type] || COLORS.dark).fontSize(9).font('Helvetica-Bold')
      .text(`${TYPE_LABELS[type]} (${rows.length})`, LEFT + 6, y + 4, { width: W - 10 });
    y += 20;

    y = drawTableHeader(y);

    rows.forEach((t, idx) => {
      if (y > doc.page.height - 60) { doc.addPage(); y = 40; y = drawTableHeader(y); }

      if (idx % 2 === 0) doc.rect(LEFT, y, W, 14).fill('#fafafa');
      doc.fillColor(COLORS.dark).fontSize(7).font('Helvetica');
      doc.text(t.transactionNumber || '', COL.txn.x + 2, y + 3, { width: COL.txn.w });
      doc.text(`${t.product?.name || ''} (${t.product?.code || ''})`, COL.product.x, y + 3, { width: COL.product.w });
      doc.text(t.fromDepartment?.name || '—', COL.from.x, y + 3, { width: COL.from.w });
      doc.text(t.toDepartment?.name || '—', COL.to.x, y + 3, { width: COL.to.w });
      doc.text(formatQty(t.quantity, t.unit?.symbol), COL.qty.x, y + 3, { width: COL.qty.w, align: 'right' });
      doc.text(t.createdBy?.name || '', COL.by.x, y + 3, { width: COL.by.w });
      y += 15;
    });

    y += 8;
  }

  // Footer on all pages
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fillColor(COLORS.gray).fontSize(7).font('Helvetica')
      .text(`Page ${i + 1} of ${pageCount}  |  Mangal Grah Mandir Stock Management`, LEFT, doc.page.height - 30, { width: W, align: 'center' });
  }

  doc.end();
}
