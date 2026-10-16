import { localDateStr } from '../utils/dates.js';
import { temple } from './temple.service.js';
import { createPdf, letterhead, reportHeader, pageFooters, ensureSpace, PDF_COLORS, mid } from './pdfLayout.js';

const C = { accent: PDF_COLORS.accent, dark: PDF_COLORS.text, gray: PDF_COLORS.muted, light: PDF_COLORS.accentSoft, white: '#ffffff', line: PDF_COLORS.line };

// ── Amount to words (Indian numbering system) ─────────────────────────────────
function amountToWords(amount) {
  const n = Math.floor(amount || 0);
  if (n === 0) return 'Zero';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tensW = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const b100  = (x) => x < 20 ? ones[x] : tensW[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : '');
  const b1000 = (x) => x < 100 ? b100(x) : ones[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + b100(x % 100) : '');
  const parts = [];
  if (n >= 10000000) parts.push(b100(Math.floor(n / 10000000)) + ' Crore');
  if (n % 10000000 >= 100000) parts.push(b100(Math.floor((n % 10000000) / 100000)) + ' Lakh');
  if (n % 100000  >= 1000)   parts.push(b1000(Math.floor((n % 100000) / 1000)) + ' Thousand');
  if (n % 1000 > 0)          parts.push(b1000(n % 1000));
  return parts.join(' ');
}

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const TYPE_LABELS = { named: 'Named', hundi: 'Hundi', anonymous: 'Anonymous' };
const PM = { cash: 'Cash', upi: 'UPI / Online', cheque: 'Cheque', bank_transfer: 'Bank Transfer' };

// ── Drawing helpers ───────────────────────────────────────────────────────────

/** Table header row: light tint, saffron text and rule (prints clearly in black & white). */
function tableHeader(doc, y, cols, { left, width, h = 14, size = 7, pad = 3 }) {
  doc.rect(left, y, width, h).fill(C.light);
  doc.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.8).strokeColor(C.accent).stroke();
  let cx = left + pad;
  cols.forEach((c) => {
    doc.fillColor(C.accent).fontSize(size).font('Helvetica-Bold')
      .text(c.label, cx, y + mid(h, size), { width: c.w - pad, height: h, ellipsis: true });
    cx += c.w;
  });
  return y + h;
}

/** Four light boxes with a figure and its label. */
function summaryBoxes(doc, y, boxes, { left, width, h = 34, size = 14 }) {
  const bw = (width - 9) / 4;
  boxes.forEach((b, i) => {
    const bx = left + i * (bw + 3);
    doc.rect(bx, y, bw, h).fill(C.light);
    doc.fillColor(C.accent).fontSize(size).font('Helvetica-Bold').text(String(b.value), bx, y + 1, { width: bw, align: 'center' });
    doc.fillColor(C.gray).fontSize(7).font('Helvetica').text(b.label, bx, y + h - 15, { width: bw, align: 'center' });
  });
  return y + h + 12;
}

/** Big amount in a light box, with the amount in words under it. */
function amountBox(doc, y, amount, { left, width }) {
  doc.rect(left, y, width, 54).fill(C.light);
  doc.fillColor(C.accent).fontSize(24).font('Helvetica-Bold')
    .text(`₹${amount.toLocaleString('en-IN')}/-`, left, y + 1, { width, align: 'center' });
  doc.fillColor(C.dark).fontSize(9).font('Helvetica')
    .text(`(${amountToWords(amount)} Rupees Only)`, left, y + 33, { width, align: 'center' });
  return y + 64;
}

/** "For <temple>" with today's date, a line to sign on and "Authorized Signatory". */
function signatureBlock(doc, y, { left, width, templeName }) {
  doc.moveTo(left, y).lineTo(left + width, y).strokeColor(C.line).lineWidth(0.5).stroke();
  y += 12;
  doc.fillColor(C.dark).fontSize(9).font('Helvetica-Bold').text(`For ${templeName}`, left, y, { width: width - 140 });
  doc.font('Helvetica').fillColor(C.gray).text(`Date: ${fmtDate(new Date())}`, left + width - 130, y, { width: 130, align: 'right' });
  y += 48;
  doc.moveTo(left, y).lineTo(left + 130, y).strokeColor('#9CA3AF').lineWidth(0.5).stroke();
  y += 3;
  doc.fillColor(C.gray).fontSize(8).font('Helvetica').text('Authorized Signatory', left, y);
}

// ── Donation register ─────────────────────────────────────────────────────────

export function generateDonationPDF(res, { donations, from, to }) {
  const doc = createPdf({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="donations-${localDateStr()}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width - 80; const LEFT = 40;
  const box = { left: LEFT, width: W };

  const totalCash = donations.reduce((s, d) => s + (d.cashAmount || 0), 0);
  const totalKind = donations.reduce((s, d) => s + (d.kindItems || []).reduce((k, i) => k + (i.estimatedValue || 0), 0), 0);
  const rangeLabel = from || to ? `${from ? fmtDate(from) : 'Beginning'} – ${to ? fmtDate(to) : 'Today'}` : 'All Time';

  let y = reportHeader(doc, { title: 'Donation Register', subtitle: `Period: ${rangeLabel}` });

  // Summary boxes
  y = summaryBoxes(doc, y, [
    { label: 'Total Donations', value: donations.length },
    { label: 'Cash Collected',  value: `₹${totalCash.toLocaleString('en-IN')}` },
    { label: 'Kind Value (Est)', value: `₹${totalKind.toLocaleString('en-IN')}` },
    { label: 'Grand Total',      value: `₹${(totalCash + totalKind).toLocaleString('en-IN')}` },
  ], box);

  // Table
  const cols = [
    { label: 'Receipt No.',  w: 90 }, { label: 'Date',    w: 65 },
    { label: 'Type',         w: 52 }, { label: 'Donor',   w: 130 },
    { label: 'Cash (₹)',     w: 70 }, { label: 'Kind Items', w: 108 },
  ];
  const drawHeader = (startY) => tableHeader(doc, startY, cols, box);
  y = drawHeader(y);

  let rowNum = 0;
  for (const d of donations) {
    y = ensureSpace(doc, y, 13, { onNewPage: drawHeader });
    const bg = rowNum % 2 === 0 ? C.white : C.light;
    doc.rect(LEFT, y, W, 13).fill(bg);
    const donor = d.donor?.name || d.donorName || (d.donationType === 'hundi' ? 'Hundi' : 'Anonymous');
    const kindVal = (d.kindItems || []).reduce((s, k) => s + (k.estimatedValue || 0), 0);
    const cells = [
      d.donationNumber || '—', fmtDate(d.date),
      TYPE_LABELS[d.donationType] || d.donationType, donor,
      d.cashAmount ? `₹${d.cashAmount.toLocaleString('en-IN')}` : '—',
      (d.kindItems || []).length > 0 ? `${(d.kindItems || []).length} (₹${kindVal.toLocaleString('en-IN')})` : '—',
    ];
    let cx = LEFT + 3;
    cells.forEach((text, i) => {
      doc.fillColor(C.dark).fontSize(7).font('Helvetica').text(String(text), cx, y + mid(13, 7), { width: cols[i].w - 3, height: 13, ellipsis: true });
      cx += cols[i].w;
    });
    doc.moveTo(LEFT, y + 13).lineTo(LEFT + W, y + 13).strokeColor(C.line).lineWidth(0.5).stroke();
    y += 13; rowNum++;
  }

  pageFooters(doc, { label: 'Donation Register' });
  doc.end();
}

// ── Standard Donation Receipt ─────────────────────────────────────────────────
export function generateDonationReceipt(res, { donation, settings }) {
  const doc = createPdf({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="RECEIPT-${donation.donationNumber}.pdf"`);
  doc.pipe(res);

  const W    = doc.page.width - 100;
  const LEFT = 50;
  const box  = { left: LEFT, width: W };

  const templeName = temple().legalName || settings?.templeName || temple().name;   // signed for the trust
  const donorName  = donation.donor?.name || donation.donorName || (donation.donationType === 'hundi' ? 'Hundi Collection' : 'Anonymous');
  const donorPhone = donation.donorPhone || donation.donor?.phone || '';
  const donorPAN   = donation.panNumber   || donation.donor?.panNumber || '';
  const occasion   = donation.occasion?.name || 'General Donation';
  const cashAmt    = donation.cashAmount || 0;
  const kindItems  = donation.kindItems || [];
  const kindTotal  = kindItems.reduce((s, i) => s + (i.estimatedValue || 0), 0);
  const grandTotal = cashAmt + kindTotal;

  // Letterhead, title, receipt no. and date
  let y = letterhead(doc, { title: 'Donation Receipt', number: donation.donationNumber || '—', numberLabel: 'Receipt No.', date: fmtDate(donation.date) });
  doc.moveTo(LEFT, y).lineTo(LEFT + W, y).strokeColor(C.line).lineWidth(1).stroke();
  y += 14;

  // Donor section
  if (donorName !== 'Hundi Collection') {
    doc.fillColor(C.gray).fontSize(8).font('Helvetica').text('Received with thanks from:', LEFT, y);
    y = doc.y;
    doc.fillColor(C.dark).fontSize(16).font('Helvetica-Bold').text(donorName, LEFT, y, { width: W });
    y = doc.y + 2;
    if (donorPhone) { doc.fontSize(9).font('Helvetica').fillColor(C.gray).text(`Phone: ${donorPhone}`, LEFT, y); y = doc.y; }
    if (donorPAN)   { doc.fontSize(9).font('Helvetica').fillColor(C.gray).text(`PAN: ${donorPAN}`, LEFT, y); y = doc.y; }
  }

  y += 6;
  doc.fontSize(9).font('Helvetica-Bold').fillColor(C.dark).text('Occasion / Purpose:', LEFT, y, { continued: true });
  doc.font('Helvetica').text(`  ${occasion}`);
  y = doc.y + 10;

  // Cash amount box
  if (cashAmt > 0) {
    y = amountBox(doc, y, cashAmt, box);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(C.dark).text('Paid by:', LEFT, y, { continued: true });
    doc.font('Helvetica').text(`  ${PM[donation.paymentMode] || donation.paymentMode || 'Cash'}${donation.paymentRef ? ` — Ref: ${donation.paymentRef}` : ''}`);
    y = doc.y + 12;
  }

  // Kind items table
  if (kindItems.length > 0) {
    doc.fillColor(C.dark).fontSize(9).font('Helvetica-Bold').text('Kind Donation Items (Vastu Daan):', LEFT, y);
    y = doc.y + 4;
    const cols = [{ w: 220, label: 'Item' }, { w: 100, label: 'Quantity' }, { w: 100, label: 'Est. Value (₹)' }];
    y = tableHeader(doc, y, cols, { ...box, size: 8, pad: 4 });
    for (const item of kindItems) {
      doc.rect(LEFT, y, W, 13).fill(C.light);
      let cx = LEFT + 4;
      const cells = [
        item.product?.name || '—',
        `${item.quantity} ${item.unit?.symbol || ''}`,
        item.estimatedValue > 0 ? `₹${item.estimatedValue.toLocaleString('en-IN')}` : '—',
      ];
      cells.forEach((text, i) => {
        doc.fillColor(C.dark).fontSize(8).font('Helvetica').text(String(text), cx, y + mid(13, 8), { width: cols[i].w - 4, height: 13, ellipsis: true });
        cx += cols[i].w;
      });
      doc.moveTo(LEFT, y + 13).lineTo(LEFT + W, y + 13).strokeColor(C.white).lineWidth(0.5).stroke();
      y += 13;
    }
    y += 8;
  }

  // Grand total
  if (grandTotal > 0) {
    doc.rect(LEFT, y, W, 26).fill(C.light);
    doc.moveTo(LEFT, y).lineTo(LEFT + W, y).lineWidth(0.8).strokeColor(C.accent).stroke();
    doc.moveTo(LEFT, y + 26).lineTo(LEFT + W, y + 26).lineWidth(0.8).strokeColor(C.accent).stroke();
    doc.fillColor(C.accent).fontSize(11).font('Helvetica-Bold')
      .text(`Total Donation Value: ₹${grandTotal.toLocaleString('en-IN')}`, LEFT + 8, y + mid(26, 11));
    y += 36;
  }

  y += 10;
  signatureBlock(doc, y, { ...box, templeName });

  pageFooters(doc, { label: `Donation Receipt · ${donation.donationNumber}` });
  doc.end();
}

// ── Donor Statement ───────────────────────────────────────────────────────────
export function generateDonorStatement(res, { donor, donations, settings }) {
  const doc = createPdf({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  const safeName = (donor.name || 'Donor').replace(/[^a-zA-Z0-9_-]/g, '_');
  res.setHeader('Content-Disposition', `attachment; filename="Donor-Statement-${safeName}.pdf"`);
  doc.pipe(res);

  const W    = doc.page.width - 80;
  const LEFT = 40;
  const box  = { left: LEFT, width: W };

  const totalCash = donations.reduce((s, d) => s + (d.cashAmount || 0), 0);
  const totalKind = donations.reduce((s, d) => s + (d.kindItems || []).reduce((k, i) => k + (i.estimatedValue || 0), 0), 0);

  let y = reportHeader(doc, { title: 'Donor Contribution Statement' });

  // Donor info box
  doc.rect(LEFT, y, W, 42).fill(C.light);
  doc.fillColor(C.accent).fontSize(14).font('Helvetica-Bold').text(donor.name || 'Donor', LEFT + 10, y + 1, { width: W - 20, height: 24, ellipsis: true });
  const meta = [donor.phone, donor.panNumber ? `PAN: ${donor.panNumber}` : null].filter(Boolean).join('  ·  ');
  if (meta) doc.fillColor(C.gray).fontSize(8).font('Helvetica').text(meta, LEFT + 10, y + 24);
  y += 52;

  // Summary boxes
  y = summaryBoxes(doc, y, [
    { label: 'Total Donations',  value: String(donations.length) },
    { label: 'Cash Donated',     value: `₹${totalCash.toLocaleString('en-IN')}` },
    { label: 'Kind Value (Est)', value: `₹${totalKind.toLocaleString('en-IN')}` },
    { label: 'Grand Total',      value: `₹${(totalCash + totalKind).toLocaleString('en-IN')}` },
  ], { ...box, size: 13 });

  // Table
  const cols = [
    { label: 'Receipt No.', w: 100 }, { label: 'Date',    w: 65 },
    { label: 'Occasion',    w: 150 }, { label: 'Cash (₹)', w: 70 },
    { label: 'Kind Items',  w: 60 },  { label: 'Total (₹)', w: 70 },
  ];
  const drawHeader = (startY) => tableHeader(doc, startY, cols, box);
  y = drawHeader(y);

  let rowNum = 0;
  for (const d of donations) {
    y = ensureSpace(doc, y, 13, { onNewPage: drawHeader });
    const bg    = rowNum % 2 === 0 ? C.white : C.light;
    const kVal  = (d.kindItems || []).reduce((s, k) => s + (k.estimatedValue || 0), 0);
    const total = (d.cashAmount || 0) + kVal;
    doc.rect(LEFT, y, W, 13).fill(bg);
    const cells = [
      d.donationNumber || '—', fmtDate(d.date), d.occasion?.name || '—',
      d.cashAmount > 0 ? `₹${d.cashAmount.toLocaleString('en-IN')}` : '—',
      (d.kindItems || []).length > 0 ? `${(d.kindItems || []).length} item${(d.kindItems || []).length > 1 ? 's' : ''}` : '—',
      total > 0 ? `₹${total.toLocaleString('en-IN')}` : '—',
    ];
    let cx = LEFT + 3;
    cells.forEach((text, i) => {
      doc.fillColor(C.dark).fontSize(7).font('Helvetica').text(String(text), cx, y + mid(13, 7), { width: cols[i].w - 3, height: 13, ellipsis: true });
      cx += cols[i].w;
    });
    doc.moveTo(LEFT, y + 13).lineTo(LEFT + W, y + 13).strokeColor(C.line).lineWidth(0.5).stroke();
    y += 13; rowNum++;
  }

  // Total row
  y = ensureSpace(doc, y, 16, { onNewPage: drawHeader });
  doc.rect(LEFT, y, W, 16).fill(C.light);
  doc.moveTo(LEFT, y).lineTo(LEFT + W, y).lineWidth(0.8).strokeColor(C.accent).stroke();
  doc.moveTo(LEFT, y + 16).lineTo(LEFT + W, y + 16).lineWidth(0.8).strokeColor(C.accent).stroke();
  const ty = y + mid(16, 8);
  doc.fillColor(C.accent).fontSize(8).font('Helvetica-Bold')
    .text('Grand Total', LEFT + 3, ty, { width: cols[0].w + cols[1].w + cols[2].w - 3 });
  const totalsCx = LEFT + cols[0].w + cols[1].w + cols[2].w + 3;
  doc.text(`₹${totalCash.toLocaleString('en-IN')}`, totalsCx, ty, { width: cols[3].w - 3, height: 16, ellipsis: true });
  const grandCx = totalsCx + cols[3].w + cols[4].w;
  doc.text(`₹${(totalCash + totalKind).toLocaleString('en-IN')}`, grandCx, ty, { width: cols[5].w - 3, height: 16, ellipsis: true });

  pageFooters(doc, { label: `Donor Statement · ${donor.name || 'Donor'}` });
  doc.end();
}

// ── 80G Tax Exemption Receipt ─────────────────────────────────────────────────
export function generate80GReceipt(res, { donation, settings }) {
  const doc = createPdf({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="80G-${donation.donationNumber}.pdf"`);
  doc.pipe(res);

  const W    = doc.page.width - 100;
  const LEFT = 50;
  const box  = { left: LEFT, width: W };

  const templeName = temple().legalName || settings.templeName || temple().name;   // signed for the trust
  const donorName  = donation.donor?.name || donation.donorName || 'Anonymous';
  const donorPAN   = donation.panNumber   || donation.donor?.panNumber || '';
  const amount     = donation.cashAmount  || 0;
  const occasion   = donation.occasion?.name || 'General Donation';
  const words      = amountToWords(amount);

  // ── Letterhead (it carries the trust's PAN and 80G number), title, receipt no. and date ──
  let y = letterhead(doc, { title: 'Receipt under Section 80G', number: donation.donationNumber || '—', numberLabel: 'Receipt No.', date: fmtDate(donation.date) });

  const validity = (settings.reg80GFrom || settings.reg80GTo)
    ? `80G registration valid ${settings.reg80GFrom ? fmtDate(settings.reg80GFrom) : '—'} to ${settings.reg80GTo ? fmtDate(settings.reg80GTo) : '—'}`
    : '';
  doc.fillColor(C.gray).fontSize(8.5).font('Helvetica')
    .text(['Donation receipt under Section 80G of the Income Tax Act, 1961', validity].filter(Boolean).join('   ·   '), LEFT, y, { width: W });
  y = doc.y + 4;

  // ── Divider ─────────────────────────────────────────────────────────────────
  doc.moveTo(LEFT, y).lineTo(LEFT + W, y).strokeColor(C.line).lineWidth(1).stroke();
  y += 14;

  // ── Received from ───────────────────────────────────────────────────────────
  doc.fillColor(C.gray).fontSize(8).font('Helvetica').text('Received with thanks from:', LEFT, y);
  y = doc.y;
  doc.fillColor(C.dark).fontSize(16).font('Helvetica-Bold').text(donorName, LEFT, y, { width: W });
  y = doc.y + 2;
  if (donorPAN) {
    doc.fontSize(9).font('Helvetica').fillColor(C.gray).text('PAN: ', LEFT, y, { continued: true });
    doc.font('Helvetica-Bold').fillColor(C.dark).text(donorPAN);
    y = doc.y;
  }

  // ── Amount box ──────────────────────────────────────────────────────────────
  y += 8;
  y = amountBox(doc, y, amount, box);

  doc.fontSize(9).font('Helvetica-Bold').fillColor(C.dark)
    .text('Being:', LEFT, y, { continued: true });
  doc.font('Helvetica').text(`  ${occasion}`);
  y = doc.y;
  doc.font('Helvetica-Bold').text('Paid by:', LEFT, y, { continued: true });
  doc.font('Helvetica').text(`  ${PM[donation.paymentMode] || donation.paymentMode || 'Cash'}${donation.paymentRef ? ` — Ref: ${donation.paymentRef}` : ''}`);
  y = doc.y + 14;

  // ── Certification ───────────────────────────────────────────────────────────
  doc.moveTo(LEFT, y).lineTo(LEFT + W, y).lineWidth(1.2).strokeColor(C.accent).stroke();
  y += 10;

  const certText =
    `We hereby certify that the donation received from ${donorName}` +
    (donorPAN ? ` (PAN: ${donorPAN})` : '') +
    ` amounting to ₹${amount.toLocaleString('en-IN')}/- (${words} Rupees Only) is eligible for ` +
    `deduction under Section 80G of the Income Tax Act, 1961 vide Registration No. ` +
    (settings.reg80GNumber || '[Registration No. not configured]') +
    (settings.reg80GTo ? ` valid up to ${fmtDate(settings.reg80GTo)}` : '') +
    `. The organization does not receive any benefit in return for this donation and the amount ` +
    `will be utilized solely for charitable and religious purposes.`;

  doc.fillColor(C.dark).fontSize(8.5).font('Helvetica')
    .text(certText, LEFT, y, { width: W, lineGap: 1, align: 'justify' });
  y = doc.y + 20;

  // ── Signature block ─────────────────────────────────────────────────────────
  signatureBlock(doc, y, { ...box, templeName });

  pageFooters(doc, { label: `80G Receipt · ${donation.donationNumber}` });
  doc.end();
}
