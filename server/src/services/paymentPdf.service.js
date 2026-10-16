import { temple } from './temple.service.js';
import { createPdf, letterhead, pageFooters, ensureSpace, PDF_COLORS, mid } from './pdfLayout.js';

const C = { accent: PDF_COLORS.accent, dark: PDF_COLORS.text, gray: PDF_COLORS.muted, light: PDF_COLORS.accentSoft, white: '#ffffff', line: PDF_COLORS.line };
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const PM_LABELS = { cash: 'Cash', upi: 'UPI / Online', neft: 'NEFT', rtgs: 'RTGS', cheque: 'Cheque' };
const STATUS_LABELS = { pending_approval: 'Pending Approval', approved: 'Approved', rejected: 'Rejected' };
const STATUS_COLORS = { pending_approval: '#d97706', approved: '#16a34a', rejected: '#dc2626' };

export function generatePaymentVoucher(res, { payment, supplier, settings }) {
  const doc = createPdf({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="VOUCHER-${payment.paymentNumber}.pdf"`);
  doc.pipe(res);

  const W    = doc.page.width - 100;
  const LEFT = 50;
  const templeName = temple().legalName || settings?.templeName || temple().name;   // signed for the trust

  // Letterhead, title, voucher no. and date
  let y = letterhead(doc, { title: 'Payment Voucher', number: payment.paymentNumber || '—', numberLabel: 'Voucher No.', date: fmtDate(payment.paymentDate) });

  // Status
  doc.fillColor(C.dark).fontSize(9);
  doc.font('Helvetica-Bold').text('Status', LEFT, y, { continued: true });
  doc.fillColor(STATUS_COLORS[payment.status] || C.dark).font('Helvetica-Bold')
    .text(`  ${STATUS_LABELS[payment.status] || payment.status}`);
  doc.fillColor(C.dark);
  y = doc.y + 6;

  doc.moveTo(LEFT, y).lineTo(LEFT + W, y).strokeColor(C.line).lineWidth(1).stroke();
  y += 12;

  // Supplier block
  doc.fillColor(C.gray).fontSize(8).font('Helvetica').text('PAID TO', LEFT, y);
  y = doc.y;
  doc.fillColor(C.dark).fontSize(13).font('Helvetica-Bold').text(supplier.name || '—', LEFT, y, { width: W });
  y = doc.y;
  if (supplier.address || supplier.city) {
    doc.fontSize(9).font('Helvetica').fillColor(C.gray)
      .text([supplier.address, supplier.city].filter(Boolean).join(', '), LEFT, y, { width: W });
    y = doc.y;
  }
  if (supplier.gstin) {
    doc.fillColor(C.gray).fontSize(9).font('Helvetica').text(`GSTIN: ${supplier.gstin}`, LEFT, y);
    y = doc.y;
  }
  // Bank account used for this payment
  const bankLine = payment.bankName || (() => {
    const acc = supplier.bankAccounts?.find((a) => a.isDefault) || supplier.bankAccounts?.[0];
    if (!acc) return null;
    return [acc.bankName, acc.accountNumber ? `A/C: ${acc.accountNumber}` : '', acc.ifscCode ? `IFSC: ${acc.ifscCode}` : ''].filter(Boolean).join('  |  ');
  })();
  if (bankLine) {
    doc.fillColor(C.gray).fontSize(9).font('Helvetica').text(bankLine, LEFT, y, { width: W });
    y = doc.y;
  }
  y += 8;

  doc.moveTo(LEFT, y).lineTo(LEFT + W, y).strokeColor(C.line).lineWidth(0.5).stroke();
  y += 12;

  // Invoice allocation table
  doc.fillColor(C.gray).fontSize(8).font('Helvetica').text('INVOICE ALLOCATION', LEFT, y);
  y = doc.y + 2;

  const COLS = [
    { label: 'Invoice No.',   w: 160 },
    { label: 'Invoice Date',  w: 100 },
    { label: 'Invoice Total', w: 115 },
    { label: 'Amount Paid',   w: W - 375 },
  ];

  const drawHeader = (startY) => {
    doc.rect(LEFT, startY, W, 16).fill(C.light);
    doc.moveTo(LEFT, startY + 16).lineTo(LEFT + W, startY + 16).lineWidth(0.8).strokeColor(C.accent).stroke();
    let hx = LEFT + 4;
    COLS.forEach((c) => {
      doc.fillColor(C.accent).fontSize(8).font('Helvetica-Bold').text(c.label, hx, startY + mid(16, 8), { width: c.w - 8 });
      hx += c.w;
    });
    return startY + 16;
  };
  y = drawHeader(y);

  const invRows = payment.invoices?.length > 0
    ? payment.invoices
    : [{ invoiceNumber: 'Advance / General', invoiceDate: payment.paymentDate, invoiceTotal: payment.totalAmount, paidAmount: payment.totalAmount }];

  let rowNum = 0;
  for (const inv of invRows) {
    y = ensureSpace(doc, y, 14, { onNewPage: drawHeader });
    const bg = rowNum % 2 === 0 ? C.white : C.light;
    doc.rect(LEFT, y, W, 14).fill(bg);
    const cells = [
      inv.invoiceNumber || '—',
      fmtDate(inv.invoiceDate),
      `₹${(inv.invoiceTotal || 0).toLocaleString('en-IN')}`,
      `₹${(inv.paidAmount  || 0).toLocaleString('en-IN')}`,
    ];
    let cx = LEFT + 4;
    cells.forEach((text, i) => {
      doc.fillColor(C.dark).fontSize(8).font('Helvetica').text(String(text), cx, y + mid(14, 8), { width: COLS[i].w - 8, height: 14, ellipsis: true });
      cx += COLS[i].w;
    });
    y += 14; rowNum++;
  }

  // Total row
  y = ensureSpace(doc, y, 16);
  doc.rect(LEFT, y, W, 16).fill(C.light);
  doc.moveTo(LEFT, y).lineTo(LEFT + W, y).lineWidth(0.8).strokeColor(C.accent).stroke();
  doc.moveTo(LEFT, y + 16).lineTo(LEFT + W, y + 16).lineWidth(0.8).strokeColor(C.accent).stroke();
  doc.fillColor(C.accent).fontSize(9).font('Helvetica-Bold')
    .text('TOTAL PAYMENT', LEFT + 4, y + mid(16, 9), { width: W - 110 });
  doc.text(`₹${(payment.totalAmount || 0).toLocaleString('en-IN')}`, LEFT + W - 104, y + mid(16, 9), { width: 100, align: 'right' });
  y += 26;

  // Payment details
  doc.fillColor(C.dark).fontSize(9).font('Helvetica-Bold').text('Payment Mode:', LEFT, y, { continued: true });
  doc.font('Helvetica').text(`  ${PM_LABELS[payment.paymentMode] || payment.paymentMode}`);
  y = doc.y;
  if (payment.referenceNumber) {
    doc.font('Helvetica-Bold').text('Reference No.:', LEFT, y, { continued: true });
    doc.font('Helvetica').text(`  ${payment.referenceNumber}`);
    y = doc.y;
  }
  if (payment.bankName) {
    doc.font('Helvetica-Bold').text('Transfer Via:', LEFT, y, { continued: true });
    doc.font('Helvetica').text(`  ${payment.bankName}`);
    y = doc.y;
  }
  if (payment.notes) {
    doc.font('Helvetica-Bold').text('Notes:', LEFT, y, { continued: true, width: W });
    doc.font('Helvetica').text(`  ${payment.notes}`);
    y = doc.y;
  }
  if (payment.status === 'approved' && payment.approvedBy?.name) {
    y += 4;
    doc.fillColor('#16a34a').fontSize(8).font('Helvetica')
      .text(`Approved by ${payment.approvedBy.name} on ${fmtDate(payment.approvedAt)}`, LEFT, y);
    y = doc.y;
  }

  // Signature
  y += 20;
  y = ensureSpace(doc, y, 80);
  doc.moveTo(LEFT, y).lineTo(LEFT + W, y).strokeColor(C.line).lineWidth(0.5).stroke();
  y += 12;
  doc.fillColor(C.dark).fontSize(9).font('Helvetica-Bold').text(`For ${templeName}`, LEFT, y, { width: W - 140 });
  doc.font('Helvetica').fillColor(C.gray).text(`Date: ${fmtDate(new Date())}`, LEFT + W - 130, y, { width: 130, align: 'right' });
  y += 48;
  doc.moveTo(LEFT, y).lineTo(LEFT + 130, y).strokeColor('#9CA3AF').lineWidth(0.5).stroke();
  y += 3;
  doc.fillColor(C.gray).fontSize(8).font('Helvetica').text('Authorized Signatory', LEFT, y);

  pageFooters(doc, { label: `Payment Voucher · ${payment.paymentNumber}` });
  doc.end();
}
