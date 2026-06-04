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

// ── Shared helpers ────────────────────────────────────────────────────────────
function pdfHeader(doc, title, subtitle) {
  const W = doc.page.width - 80;
  const LEFT = 40;
  doc.rect(LEFT, 30, W, 60).fill(COLORS.primary);
  doc.fillColor(COLORS.white).fontSize(18).font('Helvetica-Bold')
    .text('Mangal Grah Mandir, Amalner', LEFT + 10, 42, { width: W - 20 });
  doc.fontSize(10).font('Helvetica').text(title, LEFT + 10, 64);
  doc.fillColor(COLORS.gray).fontSize(8).font('Helvetica')
    .text(`${subtitle}   Generated: ${new Date().toLocaleString('en-IN')}`, LEFT + 10, 78, { width: W - 20 });
  return 108;
}

function pdfSectionHeading(doc, label, color, y) {
  const W = doc.page.width - 80;
  doc.rect(40, y, W, 18).fill(COLORS.lightGray);
  doc.fillColor(color).fontSize(9).font('Helvetica-Bold').text(label, 46, y + 4, { width: W - 10 });
  return y + 20;
}

function pdfFooter(doc) {
  const W = doc.page.width - 80;
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fillColor(COLORS.gray).fontSize(7).font('Helvetica')
      .text(`Page ${i + 1} of ${pageCount}  |  Mangal Grah Mandir Stock Management`, 40, doc.page.height - 30, { width: W, align: 'center' });
  }
}

export function generateLowStockPDF(res, { balances, generatedAt }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="low-stock-${generatedAt}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width - 80;
  const LEFT = 40;
  let y = pdfHeader(doc, 'Low Stock Alerts Report', generatedAt);

  const outOfStock = balances.filter((b) => b.alertLevel === 'out_of_stock');
  const lowStock   = balances.filter((b) => b.alertLevel === 'low_stock');
  const reorder    = balances.filter((b) => b.alertLevel === 'reorder');

  const COL = {
    product: { x: LEFT,       w: 130 },
    dept:    { x: LEFT + 132, w: 90  },
    qty:     { x: LEFT + 224, w: 60  },
    min:     { x: LEFT + 286, w: 60  },
    reorder: { x: LEFT + 348, w: 70  },
    status:  { x: LEFT + 420, w: 110 },
  };

  const drawLowStockHeader = (startY) => {
    doc.rect(LEFT, startY, W, 16).fill(COLORS.dark);
    doc.fillColor(COLORS.white).fontSize(7).font('Helvetica-Bold');
    ['Product', 'Department', 'Current Qty', 'Min Level', 'Reorder Pt', 'Status'].forEach((h, i) => {
      const keys = Object.keys(COL);
      doc.text(h, COL[keys[i]].x + 2, startY + 4, { width: COL[keys[i]].w });
    });
    return startY + 18;
  };

  const drawLowStockRows = (items, sectionColor, sectionLabel, statusLabel) => {
    if (!items.length) return y;
    if (y > doc.page.height - 100) { doc.addPage(); y = 40; }
    y = pdfSectionHeading(doc, `${sectionLabel} (${items.length})`, sectionColor, y);
    y = drawLowStockHeader(y);
    items.forEach((b, idx) => {
      if (y > doc.page.height - 60) { doc.addPage(); y = 40; y = drawLowStockHeader(y); }
      if (idx % 2 === 0) doc.rect(LEFT, y, W, 14).fill('#fafafa');
      doc.fillColor(COLORS.dark).fontSize(7).font('Helvetica');
      doc.text(`${b.product?.name || ''} (${b.product?.code || ''})`, COL.product.x + 2, y + 3, { width: COL.product.w });
      doc.text(b.department?.name || '', COL.dept.x + 2, y + 3, { width: COL.dept.w });
      doc.fillColor(sectionColor).font('Helvetica-Bold')
        .text(`${b.quantity} ${b.product?.unit?.symbol || ''}`, COL.qty.x + 2, y + 3, { width: COL.qty.w });
      doc.fillColor(COLORS.gray).font('Helvetica')
        .text(b.product?.minStockLevel ? String(b.product.minStockLevel) : '—', COL.min.x + 2, y + 3, { width: COL.min.w });
      doc.text(b.product?.reorderPoint ? String(b.product.reorderPoint) : '—', COL.reorder.x + 2, y + 3, { width: COL.reorder.w });
      doc.fillColor(sectionColor).font('Helvetica-Bold')
        .text(statusLabel, COL.status.x + 2, y + 3, { width: COL.status.w });
      y += 15;
    });
    y += 8;
    return y;
  };

  y = drawLowStockRows(outOfStock, COLORS.danger,  'Out of Stock',  'Out of Stock');
  y = drawLowStockRows(lowStock,   COLORS.warning, 'Low Stock',     'Low Stock');
  y = drawLowStockRows(reorder,    COLORS.info,    'Reorder Soon',  'Reorder Soon');

  if (!balances.length) {
    doc.fillColor(COLORS.gray).fontSize(11).font('Helvetica')
      .text('All products are adequately stocked. No alerts.', LEFT, y, { align: 'center', width: W });
  }

  pdfFooter(doc);
  doc.end();
}

export function generateExpiringPDF(res, { batches, days, generatedAt }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="expiring-stock-${generatedAt}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width - 80;
  const LEFT = 40;
  let y = pdfHeader(doc, `Expiring Stock Report — within ${days} days`, generatedAt);

  const now = new Date();
  const expired  = batches.filter((b) => new Date(b.expiryDate) < now);
  const expiring = batches.filter((b) => new Date(b.expiryDate) >= now);

  const COL = {
    product: { x: LEFT,       w: 140 },
    dept:    { x: LEFT + 142, w: 90  },
    batch:   { x: LEFT + 234, w: 70  },
    qty:     { x: LEFT + 306, w: 55  },
    expiry:  { x: LEFT + 363, w: 80  },
    days:    { x: LEFT + 445, w: 85  },
  };

  const drawExpiryHeader = (startY) => {
    doc.rect(LEFT, startY, W, 16).fill(COLORS.dark);
    doc.fillColor(COLORS.white).fontSize(7).font('Helvetica-Bold');
    ['Product', 'Department', 'Batch Ref', 'Remaining', 'Expiry Date', 'Days Left'].forEach((h, i) => {
      const keys = Object.keys(COL);
      doc.text(h, COL[keys[i]].x + 2, startY + 4, { width: COL[keys[i]].w });
    });
    return startY + 18;
  };

  const drawExpiryRows = (items, sectionColor, sectionLabel) => {
    if (!items.length) return y;
    if (y > doc.page.height - 100) { doc.addPage(); y = 40; }
    y = pdfSectionHeading(doc, `${sectionLabel} (${items.length})`, sectionColor, y);
    y = drawExpiryHeader(y);
    items.forEach((b, idx) => {
      if (y > doc.page.height - 60) { doc.addPage(); y = 40; y = drawExpiryHeader(y); }
      if (idx % 2 === 0) doc.rect(LEFT, y, W, 14).fill('#fafafa');
      const daysLeft = Math.ceil((new Date(b.expiryDate) - now) / 86400000);
      doc.fillColor(COLORS.dark).fontSize(7).font('Helvetica');
      doc.text(`${b.product?.name || ''} (${b.product?.code || ''})`, COL.product.x + 2, y + 3, { width: COL.product.w });
      doc.text(b.department?.name || '', COL.dept.x + 2, y + 3, { width: COL.dept.w });
      doc.text(b.batchRef || '—', COL.batch.x + 2, y + 3, { width: COL.batch.w });
      doc.text(`${b.remainingQty} ${b.product?.unit?.symbol || ''}`, COL.qty.x + 2, y + 3, { width: COL.qty.w });
      doc.text(formatDate(b.expiryDate), COL.expiry.x + 2, y + 3, { width: COL.expiry.w });
      doc.fillColor(sectionColor).font('Helvetica-Bold')
        .text(daysLeft <= 0 ? `${Math.abs(daysLeft)}d ago` : `${daysLeft} days`, COL.days.x + 2, y + 3, { width: COL.days.w });
      y += 15;
    });
    y += 8;
    return y;
  };

  y = drawExpiryRows(expired,  COLORS.danger,  'Already Expired');
  y = drawExpiryRows(expiring, COLORS.warning, `Expiring within ${days} days`);

  if (!batches.length) {
    doc.fillColor(COLORS.gray).fontSize(11).font('Helvetica')
      .text(`No batches expiring within ${days} days.`, LEFT, y, { align: 'center', width: W });
  }

  pdfFooter(doc);
  doc.end();
}

export function generateValuationPDF(res, { rows, grandTotal, departmentName, generatedAt }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="stock-valuation-${generatedAt}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width - 80;
  const LEFT = 40;
  let y = pdfHeader(doc, `Stock Valuation Report${departmentName ? ' — ' + departmentName : ''}`, generatedAt);

  // Grand total summary box
  doc.rect(LEFT, y, W, 36).fillAndStroke(COLORS.lightGray, COLORS.lightGray);
  doc.fillColor(COLORS.gray).fontSize(9).font('Helvetica').text('Total Inventory Value', LEFT + 12, y + 6);
  doc.fillColor(COLORS.primary).fontSize(20).font('Helvetica-Bold')
    .text(`₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, LEFT + 12, y + 16);
  doc.fillColor(COLORS.gray).fontSize(8).font('Helvetica')
    .text(`${rows.length} product-location combinations`, LEFT + 200, y + 20);
  y += 48;

  const COL = {
    product: { x: LEFT,       w: 140 },
    dept:    { x: LEFT + 142, w: 90  },
    qty:     { x: LEFT + 234, w: 60  },
    unit:    { x: LEFT + 296, w: 40  },
    rate:    { x: LEFT + 338, w: 70  },
    value:   { x: LEFT + 410, w: 120 },
  };

  const drawValHeader = (startY) => {
    doc.rect(LEFT, startY, W, 16).fill(COLORS.dark);
    doc.fillColor(COLORS.white).fontSize(7).font('Helvetica-Bold');
    [['Product', COL.product], ['Department', COL.dept], ['Qty', COL.qty], ['Unit', COL.unit],
     ['Last Rate (₹)', COL.rate], ['Total Value (₹)', COL.value]].forEach(([h, c]) => {
      doc.text(h, c.x + 2, startY + 4, { width: c.w });
    });
    return startY + 18;
  };

  y = drawValHeader(y);

  rows.forEach((r, idx) => {
    if (y > doc.page.height - 60) { doc.addPage(); y = 40; y = drawValHeader(y); }
    if (idx % 2 === 0) doc.rect(LEFT, y, W, 14).fill('#fafafa');
    doc.fillColor(COLORS.dark).fontSize(7).font('Helvetica');
    doc.text(`${r.product?.name || ''} (${r.product?.code || ''})`, COL.product.x + 2, y + 3, { width: COL.product.w });
    doc.text(r.department?.name || '', COL.dept.x + 2, y + 3, { width: COL.dept.w });
    doc.text(String(r.quantity), COL.qty.x + 2, y + 3, { width: COL.qty.w });
    doc.text(r.product?.unit?.symbol || '', COL.unit.x + 2, y + 3, { width: COL.unit.w });
    doc.text(r.lastRate > 0 ? `₹${r.lastRate}` : '—', COL.rate.x + 2, y + 3, { width: COL.rate.w });
    doc.fillColor(r.totalValue > 0 ? COLORS.dark : COLORS.gray).font(r.totalValue > 0 ? 'Helvetica-Bold' : 'Helvetica')
      .text(r.totalValue > 0 ? `₹${r.totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—', COL.value.x + 2, y + 3, { width: COL.value.w });
    y += 15;
  });

  // Grand total row
  if (y > doc.page.height - 40) { doc.addPage(); y = 40; }
  doc.rect(LEFT, y, W, 18).fill(COLORS.primary);
  doc.fillColor(COLORS.white).fontSize(9).font('Helvetica-Bold')
    .text('GRAND TOTAL', COL.product.x + 2, y + 4, { width: 300 });
  doc.text(`₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, COL.value.x + 2, y + 4, { width: COL.value.w });

  pdfFooter(doc);
  doc.end();
}

export function generateSupplierReportPDF(res, { suppliers, grandTotal, startDate, endDate, generatedAt }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="supplier-report-${generatedAt}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width - 80;
  const LEFT = 40;
  const dateRange = (startDate || endDate)
    ? `${startDate ? formatDate(startDate) : 'All'} — ${endDate ? formatDate(endDate) : 'All'}`
    : 'All Dates';
  let y = pdfHeader(doc, `Supplier Purchase Report — ${dateRange}`, generatedAt);

  // Summary
  doc.rect(LEFT, y, W, 36).fillAndStroke(COLORS.lightGray, COLORS.lightGray);
  doc.fillColor(COLORS.gray).fontSize(9).font('Helvetica').text('Grand Total Purchases', LEFT + 12, y + 6);
  doc.fillColor(COLORS.primary).fontSize(20).font('Helvetica-Bold')
    .text(`₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, LEFT + 12, y + 16);
  doc.fillColor(COLORS.gray).fontSize(8).font('Helvetica')
    .text(`${suppliers.length} supplier(s) · ${suppliers.reduce((s, sup) => s + sup.count, 0)} transactions`, LEFT + 240, y + 20);
  y += 48;

  const TXN_COL = {
    date:    { x: LEFT + 8,   w: 75  },
    product: { x: LEFT + 85,  w: 130 },
    dept:    { x: LEFT + 217, w: 80  },
    qty:     { x: LEFT + 299, w: 55  },
    rate:    { x: LEFT + 356, w: 60  },
    value:   { x: LEFT + 418, w: 110 },
  };

  const drawTxnHeader = (startY) => {
    doc.rect(LEFT, startY, W, 14).fill('#374151');
    doc.fillColor(COLORS.white).fontSize(6.5).font('Helvetica-Bold');
    [['Date', TXN_COL.date], ['Product', TXN_COL.product], ['To Dept', TXN_COL.dept],
     ['Qty', TXN_COL.qty], ['Rate (₹)', TXN_COL.rate], ['Value (₹)', TXN_COL.value]].forEach(([h, c]) => {
      doc.text(h, c.x, startY + 3, { width: c.w });
    });
    return startY + 16;
  };

  for (const sup of suppliers) {
    if (y > doc.page.height - 100) { doc.addPage(); y = 40; }

    // Supplier heading
    doc.rect(LEFT, y, W, 20).fill(COLORS.primary);
    doc.fillColor(COLORS.white).fontSize(10).font('Helvetica-Bold')
      .text(sup.supplier?.name || 'Unknown', LEFT + 8, y + 4, { width: W / 2 });
    doc.fontSize(8).font('Helvetica')
      .text(`${sup.count} purchase(s) · Total: ₹${sup.totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, LEFT + W / 2, y + 7, { width: W / 2, align: 'right' });
    y += 22;

    y = drawTxnHeader(y);

    sup.transactions.forEach((t, idx) => {
      if (y > doc.page.height - 60) { doc.addPage(); y = 40; y = drawTxnHeader(y); }
      if (idx % 2 === 0) doc.rect(LEFT, y, W, 13).fill('#fafafa');
      doc.fillColor(COLORS.dark).fontSize(6.5).font('Helvetica');
      doc.text(formatDate(t.transactionDate), TXN_COL.date.x, y + 2.5, { width: TXN_COL.date.w });
      doc.text(`${t.product?.name || ''} (${t.product?.code || ''})`, TXN_COL.product.x, y + 2.5, { width: TXN_COL.product.w });
      doc.text(t.toDepartment?.name || '', TXN_COL.dept.x, y + 2.5, { width: TXN_COL.dept.w });
      doc.text(`${t.quantity} ${t.unit?.symbol || ''}`, TXN_COL.qty.x, y + 2.5, { width: TXN_COL.qty.w });
      doc.text(t.rate > 0 ? `₹${t.rate}` : '—', TXN_COL.rate.x, y + 2.5, { width: TXN_COL.rate.w });
      doc.fillColor(COLORS.dark).font('Helvetica-Bold')
        .text(t.totalValue > 0 ? `₹${t.totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—', TXN_COL.value.x, y + 2.5, { width: TXN_COL.value.w });
      y += 14;
    });
    y += 10;
  }

  pdfFooter(doc);
  doc.end();
}
