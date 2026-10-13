import { createPdf, reportHeader, pageFooters, ensureSpace, PDF_COLORS, mid } from './pdfLayout.js';

const COLORS = {
  accent:    PDF_COLORS.accent,
  dark:      PDF_COLORS.text,
  gray:      PDF_COLORS.muted,
  lightGray: '#f3f4f6',
  stripe:    '#fafafa',
  success:   '#16a34a',
  danger:    '#dc2626',
  warning:   '#d97706',
  info:      '#2563eb',
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

const LEFT = 40;
const ROW_H = 14;
const FOOTER = { label: 'Stock Management' };

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatQty(qty, symbol) {
  return `${qty} ${symbol || ''}`.trim();
}

const money = (n) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

// ── Drawing helpers ───────────────────────────────────────────────────────────

/** One table cell on a single line — cut with … when it is too long for the column. */
function cell(doc, text, x, y, w, { h = ROW_H, size = 7, align } = {}) {
  doc.fontSize(size).text(String(text ?? ''), x, y + mid(h, size), { width: w, height: h, ellipsis: true, align });
}

/** Table header row: light tint, saffron text and rule (prints clearly in black & white). */
function tableHeader(doc, y, cols, { h = 16, size = 7 } = {}) {
  const W = doc.page.width - LEFT * 2;
  doc.rect(LEFT, y, W, h).fill(PDF_COLORS.accentSoft);
  doc.moveTo(LEFT, y + h).lineTo(LEFT + W, y + h).lineWidth(0.8).strokeColor(COLORS.accent).stroke();
  doc.fillColor(COLORS.accent).font('Helvetica-Bold');
  for (const [label, c, align] of cols) cell(doc, label, c.x, y, c.w, { h, size, align });
  return y + h + 2;
}

/** A grey band naming a group of rows, its label in the group's colour. */
function sectionHeading(doc, label, color, y) {
  const W = doc.page.width - LEFT * 2;
  doc.rect(LEFT, y, W, 18).fill(COLORS.lightGray);
  doc.fillColor(color).font('Helvetica-Bold');
  cell(doc, label, LEFT + 6, y, W - 10, { h: 18, size: 9 });
  return y + 20;
}

/** Light box with a big total on the left and a note on the right. */
function totalBox(doc, y, { label, value, note, noteX }) {
  const W = doc.page.width - LEFT * 2;
  doc.rect(LEFT, y, W, 40).fill(PDF_COLORS.accentSoft);
  doc.fillColor(COLORS.gray).fontSize(9).font('Helvetica').text(label, LEFT + 12, y + 3);
  doc.fillColor(COLORS.accent).fontSize(20).font('Helvetica-Bold').text(value, LEFT + 12, y + 9);
  doc.fillColor(COLORS.gray).fontSize(8).font('Helvetica').text(note, noteX, y + 22);
  return y + 52;
}

/** Grand total row: light tint between saffron rules. */
function grandTotalRow(doc, y, label, value, valueCol) {
  const W = doc.page.width - LEFT * 2;
  doc.rect(LEFT, y, W, 18).fill(PDF_COLORS.accentSoft);
  doc.moveTo(LEFT, y).lineTo(LEFT + W, y).lineWidth(0.8).strokeColor(COLORS.accent).stroke();
  doc.moveTo(LEFT, y + 18).lineTo(LEFT + W, y + 18).lineWidth(0.8).strokeColor(COLORS.accent).stroke();
  doc.fillColor(COLORS.accent).font('Helvetica-Bold');
  cell(doc, label, LEFT + 2, y, 300, { h: 18, size: 9 });
  cell(doc, value, valueCol.x + 2, y, valueCol.w, { h: 18, size: 9 });
  return y + 20;
}

// ── Daily stock movement ──────────────────────────────────────────────────────

export function generateDailyReportPDF(res, { date, department, transactions, summary }) {
  const doc = createPdf({ size: 'A4', margin: 40 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="daily-report-${date}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width - 80; // usable width

  let y = reportHeader(doc, {
    title: 'Daily Stock Movement Report',
    subtitle: [`Date: ${formatDate(date)}`, department && `Department: ${department}`].filter(Boolean).join('   ·   '),
  });

  // ── Summary Cards ─────────────────────────────────────────────────────────
  doc.fontSize(12).font('Helvetica-Bold').fillColor(COLORS.dark)
    .text('Summary', LEFT, y);
  y += 22;

  const cardW = (W - 15) / 4;
  const summaryData = [
    { label: 'Stock In',  count: summary.STOCK_IN.count,  qty: summary.STOCK_IN.totalQty,  color: COLORS.success },
    { label: 'Stock Out', count: summary.STOCK_OUT.count, qty: summary.STOCK_OUT.totalQty, color: COLORS.warning },
    { label: 'Transfers', count: summary.TRANSFER.count,  qty: summary.TRANSFER.totalQty,  color: COLORS.info },
    { label: 'Wastage',   count: summary.WASTAGE.count,   qty: summary.WASTAGE.totalQty,   color: COLORS.danger },
  ];

  summaryData.forEach((s, i) => {
    const x = LEFT + i * (cardW + 5);
    doc.rect(x, y, cardW, 52).fill(COLORS.lightGray);
    doc.rect(x, y, 4, 52).fill(s.color);
    doc.fillColor(s.color).fontSize(9).font('Helvetica-Bold').text(s.label, x + 10, y + 3, { width: cardW - 14 });
    doc.fillColor(COLORS.dark).fontSize(18).font('Helvetica-Bold').text(String(s.count), x + 10, y + 13);
    doc.fillColor(COLORS.gray).fontSize(8).font('Helvetica').text(`Total: ${s.qty}`, x + 10, y + 36);
  });

  y += 66;

  // ── Transactions Table ────────────────────────────────────────────────────
  if (transactions.length === 0) {
    doc.fontSize(11).fillColor(COLORS.gray).font('Helvetica')
      .text('No transactions recorded for this date.', LEFT, y, { align: 'center', width: W });
    pageFooters(doc, FOOTER);
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
    txn:     { x: LEFT + 2,   w: 88 },
    product: { x: LEFT + 92,  w: 130 },
    from:    { x: LEFT + 224, w: 80 },
    to:      { x: LEFT + 306, w: 80 },
    qty:     { x: LEFT + 388, w: 56 },
    by:      { x: LEFT + 454, w: 60 },
  };

  const drawTableHeader = (startY) => tableHeader(doc, startY, [
    ['TXN #', COL.txn], ['Product', COL.product], ['From', COL.from], ['To', COL.to],
    ['Qty', COL.qty, 'right'], ['By', COL.by],
  ]);

  for (const [type, rows] of Object.entries(groups)) {
    y = ensureSpace(doc, y, 20 + 18 + ROW_H * 2);

    // Section heading
    y = sectionHeading(doc, `${TYPE_LABELS[type] || type} (${rows.length})`, TYPE_COLORS[type] || COLORS.dark, y);
    y = drawTableHeader(y);

    rows.forEach((t, idx) => {
      y = ensureSpace(doc, y, ROW_H, { onNewPage: drawTableHeader });

      if (idx % 2 === 0) doc.rect(LEFT, y, W, ROW_H).fill(COLORS.stripe);
      doc.fillColor(COLORS.dark).font('Helvetica');
      cell(doc, t.transactionNumber || '', COL.txn.x, y, COL.txn.w);
      cell(doc, `${t.product?.name || ''} (${t.product?.code || ''})`, COL.product.x, y, COL.product.w);
      cell(doc, t.fromDepartment?.name || '—', COL.from.x, y, COL.from.w);
      cell(doc, t.toDepartment?.name || '—', COL.to.x, y, COL.to.w);
      cell(doc, formatQty(t.quantity, t.unit?.symbol), COL.qty.x, y, COL.qty.w, { align: 'right' });
      cell(doc, t.createdBy?.name || '', COL.by.x, y, COL.by.w);
      y += 15;
    });

    y += 8;
  }

  pageFooters(doc, FOOTER);
  doc.end();
}

// ── Low stock alerts ──────────────────────────────────────────────────────────

export function generateLowStockPDF(res, { balances, generatedAt }) {
  const doc = createPdf({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="low-stock-${generatedAt}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width - 80;
  let y = reportHeader(doc, { title: 'Low Stock Alerts Report', subtitle: `As on ${formatDate(generatedAt)}` });

  const outOfStock = balances.filter((b) => b.alertLevel === 'out_of_stock');
  const lowStock   = balances.filter((b) => b.alertLevel === 'low_stock');
  const reorder    = balances.filter((b) => b.alertLevel === 'reorder');

  const COL = {
    product: { x: LEFT,       w: 130 },
    dept:    { x: LEFT + 132, w: 90  },
    qty:     { x: LEFT + 224, w: 60  },
    min:     { x: LEFT + 286, w: 60  },
    reorder: { x: LEFT + 348, w: 70  },
    status:  { x: LEFT + 420, w: 93  },
  };
  const at = (c) => ({ x: c.x + 2, w: c.w - 2 });

  const drawLowStockHeader = (startY) => tableHeader(doc, startY, [
    ['Product', at(COL.product)], ['Department', at(COL.dept)], ['Current Qty', at(COL.qty)],
    ['Min Level', at(COL.min)], ['Reorder Pt', at(COL.reorder)], ['Status', at(COL.status)],
  ]);

  const drawLowStockRows = (items, sectionColor, sectionLabel, statusLabel) => {
    if (!items.length) return y;
    y = ensureSpace(doc, y, 20 + 18 + ROW_H * 2);
    y = sectionHeading(doc, `${sectionLabel} (${items.length})`, sectionColor, y);
    y = drawLowStockHeader(y);
    items.forEach((b, idx) => {
      y = ensureSpace(doc, y, ROW_H, { onNewPage: drawLowStockHeader });
      if (idx % 2 === 0) doc.rect(LEFT, y, W, ROW_H).fill(COLORS.stripe);
      const c = (k) => at(COL[k]);
      doc.fillColor(COLORS.dark).font('Helvetica');
      cell(doc, `${b.product?.name || ''} (${b.product?.code || ''})`, c('product').x, y, c('product').w);
      cell(doc, b.department?.name || '', c('dept').x, y, c('dept').w);
      doc.fillColor(sectionColor).font('Helvetica-Bold');
      cell(doc, `${b.quantity} ${b.product?.unit?.symbol || ''}`, c('qty').x, y, c('qty').w);
      doc.fillColor(COLORS.gray).font('Helvetica');
      cell(doc, b.product?.minStockLevel ? String(b.product.minStockLevel) : '—', c('min').x, y, c('min').w);
      cell(doc, b.product?.reorderPoint ? String(b.product.reorderPoint) : '—', c('reorder').x, y, c('reorder').w);
      doc.fillColor(sectionColor).font('Helvetica-Bold');
      cell(doc, statusLabel, c('status').x, y, c('status').w);
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

  pageFooters(doc, FOOTER);
  doc.end();
}

// ── Expiring stock ────────────────────────────────────────────────────────────

export function generateExpiringPDF(res, { batches, days, generatedAt }) {
  const doc = createPdf({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="expiring-stock-${generatedAt}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width - 80;
  let y = reportHeader(doc, { title: `Expiring Stock Report — within ${days} days`, subtitle: `As on ${formatDate(generatedAt)}` });

  const now = new Date();
  const expired  = batches.filter((b) => new Date(b.expiryDate) < now);
  const expiring = batches.filter((b) => new Date(b.expiryDate) >= now);

  const COL = {
    product: { x: LEFT,       w: 140 },
    dept:    { x: LEFT + 142, w: 90  },
    batch:   { x: LEFT + 234, w: 70  },
    qty:     { x: LEFT + 306, w: 55  },
    expiry:  { x: LEFT + 363, w: 80  },
    days:    { x: LEFT + 445, w: 68  },
  };
  const at = (k) => ({ x: COL[k].x + 2, w: COL[k].w - 2 });

  const drawExpiryHeader = (startY) => tableHeader(doc, startY, [
    ['Product', at('product')], ['Department', at('dept')], ['Batch Ref', at('batch')],
    ['Remaining', at('qty')], ['Expiry Date', at('expiry')], ['Days Left', at('days')],
  ]);

  const drawExpiryRows = (items, sectionColor, sectionLabel) => {
    if (!items.length) return y;
    y = ensureSpace(doc, y, 20 + 18 + ROW_H * 2);
    y = sectionHeading(doc, `${sectionLabel} (${items.length})`, sectionColor, y);
    y = drawExpiryHeader(y);
    items.forEach((b, idx) => {
      y = ensureSpace(doc, y, ROW_H, { onNewPage: drawExpiryHeader });
      if (idx % 2 === 0) doc.rect(LEFT, y, W, ROW_H).fill(COLORS.stripe);
      const daysLeft = Math.ceil((new Date(b.expiryDate) - now) / 86400000);
      doc.fillColor(COLORS.dark).font('Helvetica');
      cell(doc, `${b.product?.name || ''} (${b.product?.code || ''})`, at('product').x, y, at('product').w);
      cell(doc, b.department?.name || '', at('dept').x, y, at('dept').w);
      cell(doc, b.batchRef || '—', at('batch').x, y, at('batch').w);
      cell(doc, `${b.remainingQty} ${b.product?.unit?.symbol || ''}`, at('qty').x, y, at('qty').w);
      cell(doc, formatDate(b.expiryDate), at('expiry').x, y, at('expiry').w);
      doc.fillColor(sectionColor).font('Helvetica-Bold');
      cell(doc, daysLeft <= 0 ? `${Math.abs(daysLeft)}d ago` : `${daysLeft} days`, at('days').x, y, at('days').w);
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

  pageFooters(doc, FOOTER);
  doc.end();
}

// ── Stock valuation ───────────────────────────────────────────────────────────

export function generateValuationPDF(res, { rows, grandTotal, departmentName, generatedAt }) {
  const doc = createPdf({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="stock-valuation-${generatedAt}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width - 80;
  let y = reportHeader(doc, {
    title: `Stock Valuation Report${departmentName ? ' — ' + departmentName : ''}`,
    subtitle: `As on ${formatDate(generatedAt)}`,
  });

  // Grand total summary box
  y = totalBox(doc, y, {
    label: 'Total Inventory Value',
    value: money(grandTotal),
    note: `${rows.length} product-location combinations`,
    noteX: LEFT + 220,
  });

  const COL = {
    product: { x: LEFT,       w: 140 },
    dept:    { x: LEFT + 142, w: 90  },
    qty:     { x: LEFT + 234, w: 60  },
    unit:    { x: LEFT + 296, w: 40  },
    rate:    { x: LEFT + 338, w: 70  },
    value:   { x: LEFT + 410, w: 103 },
  };
  const at = (k) => ({ x: COL[k].x + 2, w: COL[k].w - 2 });

  const drawValHeader = (startY) => tableHeader(doc, startY, [
    ['Product', at('product')], ['Department', at('dept')], ['Qty', at('qty')], ['Unit', at('unit')],
    ['Last Rate (₹)', at('rate')], ['Total Value (₹)', at('value')],
  ]);

  y = drawValHeader(y);

  rows.forEach((r, idx) => {
    y = ensureSpace(doc, y, ROW_H, { onNewPage: drawValHeader });
    if (idx % 2 === 0) doc.rect(LEFT, y, W, ROW_H).fill(COLORS.stripe);
    doc.fillColor(COLORS.dark).font('Helvetica');
    cell(doc, `${r.product?.name || ''} (${r.product?.code || ''})`, at('product').x, y, at('product').w);
    cell(doc, r.department?.name || '', at('dept').x, y, at('dept').w);
    cell(doc, String(r.quantity), at('qty').x, y, at('qty').w);
    cell(doc, r.product?.unit?.symbol || '', at('unit').x, y, at('unit').w);
    cell(doc, r.lastRate > 0 ? `₹${r.lastRate}` : '—', at('rate').x, y, at('rate').w);
    doc.fillColor(r.totalValue > 0 ? COLORS.dark : COLORS.gray).font(r.totalValue > 0 ? 'Helvetica-Bold' : 'Helvetica');
    cell(doc, r.totalValue > 0 ? money(r.totalValue) : '—', at('value').x, y, at('value').w);
    y += 15;
  });

  // Grand total row
  y = ensureSpace(doc, y, 18, { onNewPage: drawValHeader });
  grandTotalRow(doc, y, 'GRAND TOTAL', money(grandTotal), COL.value);

  pageFooters(doc, FOOTER);
  doc.end();
}

// ── Supplier purchases ────────────────────────────────────────────────────────

export function generateSupplierReportPDF(res, { suppliers, grandTotal, startDate, endDate, generatedAt }) {
  const doc = createPdf({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="supplier-report-${generatedAt}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width - 80;
  const dateRange = (startDate || endDate)
    ? `${startDate ? formatDate(startDate) : 'All'} — ${endDate ? formatDate(endDate) : 'All'}`
    : 'All Dates';
  let y = reportHeader(doc, { title: 'Supplier Purchase Report', subtitle: `Period: ${dateRange}` });

  // Summary
  y = totalBox(doc, y, {
    label: 'Grand Total Purchases',
    value: money(grandTotal),
    note: `${suppliers.length} supplier(s) · ${suppliers.reduce((s, sup) => s + sup.count, 0)} transactions`,
    noteX: LEFT + 240,
  });

  const TXN_COL = {
    date:    { x: LEFT + 8,   w: 75  },
    product: { x: LEFT + 85,  w: 130 },
    dept:    { x: LEFT + 217, w: 80  },
    qty:     { x: LEFT + 299, w: 55  },
    rate:    { x: LEFT + 356, w: 60  },
    value:   { x: LEFT + 418, w: 95  },
  };
  const TXN_H = 13;

  const drawTxnHeader = (startY) => tableHeader(doc, startY, [
    ['Date', TXN_COL.date], ['Product', TXN_COL.product], ['To Dept', TXN_COL.dept],
    ['Qty', TXN_COL.qty], ['Rate (₹)', TXN_COL.rate], ['Value (₹)', TXN_COL.value],
  ], { h: 14, size: 6.5 });

  for (const sup of suppliers) {
    y = ensureSpace(doc, y, 22 + 16 + TXN_H * 2);

    // Supplier heading
    doc.rect(LEFT, y, W, 20).fill(COLORS.lightGray);
    doc.fillColor(COLORS.dark).font('Helvetica-Bold');
    cell(doc, sup.supplier?.name || 'Unknown', LEFT + 8, y, W / 2, { h: 20, size: 10 });
    doc.fillColor(COLORS.gray).font('Helvetica');
    cell(doc, `${sup.count} purchase(s) · Total: ${money(sup.totalValue)}`, LEFT + W / 2, y, W / 2 - 8, { h: 20, size: 8, align: 'right' });
    y += 22;

    y = drawTxnHeader(y);

    sup.transactions.forEach((t, idx) => {
      y = ensureSpace(doc, y, TXN_H, { onNewPage: drawTxnHeader });
      if (idx % 2 === 0) doc.rect(LEFT, y, W, TXN_H).fill(COLORS.stripe);
      const row = { h: TXN_H, size: 6.5 };
      doc.fillColor(COLORS.dark).font('Helvetica');
      cell(doc, formatDate(t.transactionDate), TXN_COL.date.x, y, TXN_COL.date.w, row);
      cell(doc, `${t.product?.name || ''} (${t.product?.code || ''})`, TXN_COL.product.x, y, TXN_COL.product.w, row);
      cell(doc, t.toDepartment?.name || '', TXN_COL.dept.x, y, TXN_COL.dept.w, row);
      cell(doc, `${t.quantity} ${t.unit?.symbol || ''}`, TXN_COL.qty.x, y, TXN_COL.qty.w, row);
      cell(doc, t.rate > 0 ? `₹${t.rate}` : '—', TXN_COL.rate.x, y, TXN_COL.rate.w, row);
      doc.fillColor(COLORS.dark).font('Helvetica-Bold');
      cell(doc, t.totalValue > 0 ? money(t.totalValue) : '—', TXN_COL.value.x, y, TXN_COL.value.w, row);
      y += 14;
    });
    y += 10;
  }

  pageFooters(doc, FOOTER);
  doc.end();
}
