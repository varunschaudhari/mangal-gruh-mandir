import PDFDocument from 'pdfkit';

const C = { primary: '#ea580c', dark: '#1f2937', gray: '#6b7280', light: '#fff7ed', white: '#ffffff' };
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const PM_LABELS = { cash: 'Cash', upi: 'UPI / Online', neft: 'NEFT', rtgs: 'RTGS', cheque: 'Cheque' };
const STATUS_LABELS = { pending_approval: 'Pending Approval', approved: 'Approved', rejected: 'Rejected' };
const STATUS_COLORS = { pending_approval: '#d97706', approved: '#16a34a', rejected: '#dc2626' };

export function generatePaymentVoucher(res, { payment, supplier, settings }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="VOUCHER-${payment.paymentNumber}.pdf"`);
  doc.pipe(res);

  const W    = doc.page.width - 100;
  const LEFT = 50;
  const templeName = settings?.templeName || 'Mangal Grah Mandir, Amalner';

  // Header
  doc.rect(LEFT, 40, W, 60).fill(C.primary);
  doc.fillColor(C.white).fontSize(16).font('Helvetica-Bold')
    .text(templeName, LEFT + 12, 50, { width: W - 24 });
  doc.fontSize(9).font('Helvetica').text('PAYMENT VOUCHER', LEFT + 12, 72);

  // Voucher meta row
  let y = 118;
  doc.fillColor(C.dark).fontSize(9);
  doc.font('Helvetica-Bold').text('Voucher No.', LEFT, y, { continued: true });
  doc.font('Helvetica').text(`  ${payment.paymentNumber || '—'}`);
  doc.font('Helvetica-Bold').text('Date', LEFT + W - 120, y, { continued: true });
  doc.font('Helvetica').text(`  ${fmtDate(payment.paymentDate)}`);
  y += 16;
  doc.font('Helvetica-Bold').text('Status', LEFT, y, { continued: true });
  doc.fillColor(STATUS_COLORS[payment.status] || C.dark).font('Helvetica-Bold')
    .text(`  ${STATUS_LABELS[payment.status] || payment.status}`);
  doc.fillColor(C.dark);
  y += 22;

  doc.moveTo(LEFT, y).lineTo(LEFT + W, y).strokeColor('#E5E7EB').lineWidth(1).stroke();
  y += 14;

  // Supplier block
  doc.fillColor(C.gray).fontSize(8).font('Helvetica').text('PAID TO', LEFT, y);
  y += 12;
  doc.fillColor(C.dark).fontSize(13).font('Helvetica-Bold').text(supplier.name || '—', LEFT, y);
  y += 18;
  if (supplier.address || supplier.city) {
    doc.fontSize(9).font('Helvetica').fillColor(C.gray)
      .text([supplier.address, supplier.city].filter(Boolean).join(', '), LEFT, y);
    y += 13;
  }
  if (supplier.gstin) {
    doc.fillColor(C.gray).fontSize(9).font('Helvetica').text(`GSTIN: ${supplier.gstin}`, LEFT, y);
    y += 13;
  }
  // Bank account used for this payment
  const bankLine = payment.bankName || (() => {
    const acc = supplier.bankAccounts?.find((a) => a.isDefault) || supplier.bankAccounts?.[0];
    if (!acc) return null;
    return [acc.bankName, acc.accountNumber ? `A/C: ${acc.accountNumber}` : '', acc.ifscCode ? `IFSC: ${acc.ifscCode}` : ''].filter(Boolean).join('  |  ');
  })();
  if (bankLine) {
    doc.fillColor(C.gray).fontSize(9).font('Helvetica').text(bankLine, LEFT, y);
    y += 13;
  }
  y += 8;

  doc.moveTo(LEFT, y).lineTo(LEFT + W, y).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
  y += 14;

  // Invoice allocation table
  doc.fillColor(C.gray).fontSize(8).font('Helvetica').text('INVOICE ALLOCATION', LEFT, y);
  y += 10;

  const COLS = [
    { label: 'Invoice No.',   w: 130 },
    { label: 'Invoice Date',  w: 90 },
    { label: 'Invoice Total', w: 100 },
    { label: 'Amount Paid',   w: 100 },
  ];

  doc.rect(LEFT, y, W, 16).fill(C.primary);
  let cx = LEFT + 4;
  COLS.forEach((c) => {
    doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold').text(c.label, cx, y + 4, { width: c.w - 4 });
    cx += c.w;
  });
  y += 16;

  const invRows = payment.invoices?.length > 0
    ? payment.invoices
    : [{ invoiceNumber: 'Advance / General', invoiceDate: payment.paymentDate, invoiceTotal: payment.totalAmount, paidAmount: payment.totalAmount }];

  let rowNum = 0;
  for (const inv of invRows) {
    const bg = rowNum % 2 === 0 ? C.white : '#FFF7ED';
    doc.rect(LEFT, y, W, 14).fill(bg);
    const cells = [
      inv.invoiceNumber || '—',
      fmtDate(inv.invoiceDate),
      `₹${(inv.invoiceTotal || 0).toLocaleString('en-IN')}`,
      `₹${(inv.paidAmount  || 0).toLocaleString('en-IN')}`,
    ];
    cx = LEFT + 4;
    cells.forEach((text, i) => {
      doc.fillColor(C.dark).fontSize(8).font('Helvetica').text(String(text), cx, y + 3, { width: COLS[i].w - 4 });
      cx += COLS[i].w;
    });
    y += 14; rowNum++;
  }

  // Total row
  doc.rect(LEFT, y, W, 16).fill('#1F2937');
  doc.fillColor(C.white).fontSize(9).font('Helvetica-Bold')
    .text('TOTAL PAYMENT', LEFT + 4, y + 4, { width: W - 110 });
  doc.text(`₹${(payment.totalAmount || 0).toLocaleString('en-IN')}`, LEFT + W - 104, y + 4, { width: 100, align: 'right' });
  y += 26;

  // Payment details
  doc.fillColor(C.dark).fontSize(9).font('Helvetica-Bold').text('Payment Mode:', LEFT, y, { continued: true });
  doc.font('Helvetica').text(`  ${PM_LABELS[payment.paymentMode] || payment.paymentMode}`);
  y += 14;
  if (payment.referenceNumber) {
    doc.font('Helvetica-Bold').text('Reference No.:', LEFT, y, { continued: true });
    doc.font('Helvetica').text(`  ${payment.referenceNumber}`);
    y += 14;
  }
  if (payment.bankName) {
    doc.font('Helvetica-Bold').text('Transfer Via:', LEFT, y, { continued: true });
    doc.font('Helvetica').text(`  ${payment.bankName}`);
    y += 14;
  }
  if (payment.notes) {
    doc.font('Helvetica-Bold').text('Notes:', LEFT, y, { continued: true });
    doc.font('Helvetica').text(`  ${payment.notes}`);
    y += 14;
  }
  if (payment.status === 'approved' && payment.approvedBy?.name) {
    y += 4;
    doc.fillColor('#16a34a').fontSize(8).font('Helvetica')
      .text(`Approved by ${payment.approvedBy.name} on ${fmtDate(payment.approvedAt)}`, LEFT, y);
    y += 14;
  }

  // Signature
  y += 20;
  doc.moveTo(LEFT, y).lineTo(LEFT + W, y).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
  y += 16;
  doc.fillColor(C.dark).fontSize(9).font('Helvetica-Bold').text(`For ${templeName}`, LEFT, y);
  doc.font('Helvetica').fillColor(C.gray).text(`Date: ${fmtDate(new Date())}`, LEFT + W - 130, y);
  y += 44;
  doc.moveTo(LEFT, y).lineTo(LEFT + 130, y).strokeColor('#9CA3AF').lineWidth(0.5).stroke();
  y += 6;
  doc.fillColor(C.gray).fontSize(8).font('Helvetica').text('Authorized Signatory', LEFT, y);

  // Footer
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fillColor(C.gray).fontSize(7).font('Helvetica')
      .text(`${payment.paymentNumber} · ${templeName}`, LEFT, doc.page.height - 32, { width: W, align: 'center' });
  }

  doc.end();
}
