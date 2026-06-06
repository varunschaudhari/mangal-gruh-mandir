import PDFDocument from 'pdfkit';

const C = { primary: '#ea580c', dark: '#1f2937', gray: '#6b7280', light: '#fff7ed', white: '#ffffff', green: '#16a34a' };

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

export function generateDonationPDF(res, { donations, from, to }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="donations-${new Date().toISOString().split('T')[0]}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width - 80; const LEFT = 40;

  const totalCash = donations.reduce((s, d) => s + (d.cashAmount || 0), 0);
  const totalKind = donations.reduce((s, d) => s + (d.kindItems || []).reduce((k, i) => k + (i.estimatedValue || 0), 0), 0);
  const rangeLabel = from || to ? `${from ? fmtDate(from) : 'Beginning'} – ${to ? fmtDate(to) : 'Today'}` : 'All Time';

  // Header
  doc.rect(LEFT, 30, W, 54).fill(C.primary);
  doc.fillColor(C.white).fontSize(16).font('Helvetica-Bold')
    .text('Mangal Grah Mandir, Amalner', LEFT + 10, 40, { width: W - 20 });
  doc.fontSize(9).font('Helvetica').text('Donation Register', LEFT + 10, 60);

  doc.fillColor(C.dark).fontSize(9).font('Helvetica')
    .text(`Period: ${rangeLabel}`, LEFT, 96)
    .text(`Generated: ${fmtDate(new Date())}`, LEFT + W - 130, 96, { align: 'right' });

  // Summary boxes
  let y = 114;
  const boxes = [
    { label: 'Total Donations', value: donations.length },
    { label: 'Cash Collected',  value: `₹${totalCash.toLocaleString('en-IN')}` },
    { label: 'Kind Value (Est)', value: `₹${totalKind.toLocaleString('en-IN')}` },
    { label: 'Grand Total',      value: `₹${(totalCash + totalKind).toLocaleString('en-IN')}` },
  ];
  const bw = (W - 9) / 4;
  boxes.forEach((b, i) => {
    const bx = LEFT + i * (bw + 3);
    doc.rect(bx, y, bw, 34).fill(C.light);
    doc.fillColor(C.primary).fontSize(14).font('Helvetica-Bold').text(String(b.value), bx, y + 4, { width: bw, align: 'center' });
    doc.fillColor(C.gray).fontSize(7).font('Helvetica').text(b.label, bx, y + 23, { width: bw, align: 'center' });
  });

  // Table
  y += 46;
  const cols = [
    { label: 'Receipt No.',  w: 90 }, { label: 'Date',    w: 65 },
    { label: 'Type',         w: 52 }, { label: 'Donor',   w: 110 },
    { label: 'Cash (₹)',     w: 58 }, { label: 'Kind Items', w: 60 },
  ];

  doc.rect(LEFT, y, W, 14).fill(C.primary);
  let cx = LEFT + 3;
  cols.forEach((c) => {
    doc.fillColor(C.white).fontSize(7).font('Helvetica-Bold').text(c.label, cx, y + 3, { width: c.w - 3 });
    cx += c.w;
  });
  y += 14;

  let rowNum = 0;
  for (const d of donations) {
    if (y > doc.page.height - 50) { doc.addPage(); y = 40; }
    const bg = rowNum % 2 === 0 ? C.white : '#FFF7ED';
    doc.rect(LEFT, y, W, 13).fill(bg);
    const donor = d.donor?.name || d.donorName || (d.donationType === 'hundi' ? 'Hundi' : 'Anonymous');
    const kindVal = (d.kindItems || []).reduce((s, k) => s + (k.estimatedValue || 0), 0);
    const cells = [
      d.donationNumber || '—', fmtDate(d.date),
      TYPE_LABELS[d.donationType] || d.donationType, donor,
      d.cashAmount ? `₹${d.cashAmount.toLocaleString('en-IN')}` : '—',
      (d.kindItems || []).length > 0 ? `${(d.kindItems || []).length} (₹${kindVal.toLocaleString('en-IN')})` : '—',
    ];
    cx = LEFT + 3;
    cells.forEach((text, i) => {
      doc.fillColor(C.dark).fontSize(7).font('Helvetica').text(String(text), cx, y + 2, { width: cols[i].w - 3, ellipsis: true });
      cx += cols[i].w;
    });
    doc.moveTo(LEFT, y + 13).lineTo(LEFT + W, y + 13).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
    y += 13; rowNum++;
  }

  // Footer
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fillColor(C.gray).fontSize(7).font('Helvetica')
      .text(`Page ${i + 1} of ${pageCount}  ·  Mangal Grah Mandir Donation Register`, LEFT, doc.page.height - 28, { width: W, align: 'center' });
  }

  doc.end();
}

// ── Standard Donation Receipt ─────────────────────────────────────────────────
export function generateDonationReceipt(res, { donation, settings }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="RECEIPT-${donation.donationNumber}.pdf"`);
  doc.pipe(res);

  const W    = doc.page.width - 100;
  const LEFT = 50;
  const PM   = { cash: 'Cash', upi: 'UPI / Online', cheque: 'Cheque', bank_transfer: 'Bank Transfer' };

  const templeName = settings?.templeName || 'Mangal Grah Mandir, Amalner';
  const donorName  = donation.donor?.name || donation.donorName || (donation.donationType === 'hundi' ? 'Hundi Collection' : 'Anonymous');
  const donorPhone = donation.donorPhone || donation.donor?.phone || '';
  const donorPAN   = donation.panNumber   || donation.donor?.panNumber || '';
  const occasion   = donation.occasion?.name || 'General Donation';
  const cashAmt    = donation.cashAmount || 0;
  const kindItems  = donation.kindItems || [];
  const kindTotal  = kindItems.reduce((s, i) => s + (i.estimatedValue || 0), 0);
  const grandTotal = cashAmt + kindTotal;

  // Header
  doc.rect(LEFT, 40, W, 62).fill(C.primary);
  doc.fillColor(C.white).fontSize(17).font('Helvetica-Bold')
    .text(templeName, LEFT + 12, 50, { width: W - 24 });
  doc.fontSize(8).font('Helvetica')
    .text('DONATION RECEIPT', LEFT + 12, 72, { width: W - 24, characterSpacing: 1 });

  // Receipt No + Date
  let y = 120;
  doc.fillColor(C.dark).fontSize(9);
  doc.font('Helvetica-Bold').text('Receipt No.', LEFT, y, { continued: true });
  doc.font('Helvetica').text(`  ${donation.donationNumber || '—'}`);
  doc.font('Helvetica-Bold').text('Date', LEFT + W - 120, y, { continued: true });
  doc.font('Helvetica').text(`  ${fmtDate(donation.date)}`);
  y += 20;

  doc.moveTo(LEFT, y).lineTo(LEFT + W, y).strokeColor('#E5E7EB').lineWidth(1).stroke();
  y += 16;

  // Donor section
  if (donorName !== 'Hundi Collection') {
    doc.fillColor(C.gray).fontSize(8).font('Helvetica').text('Received with thanks from:', LEFT, y);
    y += 14;
    doc.fillColor(C.dark).fontSize(16).font('Helvetica-Bold').text(donorName, LEFT, y);
    y += 24;
    if (donorPhone) { doc.fontSize(9).font('Helvetica').fillColor(C.gray).text(`Phone: ${donorPhone}`, LEFT, y); y += 14; }
    if (donorPAN)   { doc.fontSize(9).font('Helvetica').fillColor(C.gray).text(`PAN: ${donorPAN}`, LEFT, y); y += 14; }
  }

  y += 6;
  doc.fontSize(9).font('Helvetica-Bold').fillColor(C.dark).text('Occasion / Purpose:', LEFT, y, { continued: true });
  doc.font('Helvetica').text(`  ${occasion}`);
  y = doc.y + 12;

  // Cash amount box
  if (cashAmt > 0) {
    doc.rect(LEFT, y, W, 54).fill(C.light);
    doc.fillColor(C.primary).fontSize(24).font('Helvetica-Bold')
      .text(`₹${cashAmt.toLocaleString('en-IN')}/-`, LEFT, y + 8, { width: W, align: 'center' });
    doc.fillColor(C.dark).fontSize(9).font('Helvetica')
      .text(`(${amountToWords(cashAmt)} Rupees Only)`, LEFT, y + 36, { width: W, align: 'center' });
    y += 64;
    doc.fontSize(9).font('Helvetica-Bold').fillColor(C.dark).text('Paid by:', LEFT, y, { continued: true });
    doc.font('Helvetica').text(`  ${PM[donation.paymentMode] || donation.paymentMode || 'Cash'}${donation.paymentRef ? ` — Ref: ${donation.paymentRef}` : ''}`);
    y = doc.y + 14;
  }

  // Kind items table
  if (kindItems.length > 0) {
    doc.fillColor(C.dark).fontSize(9).font('Helvetica-Bold').text('Kind Donation Items (Vastu Daan):', LEFT, y);
    y = doc.y + 8;
    const cols = [{ w: 220, label: 'Item' }, { w: 100, label: 'Quantity' }, { w: 100, label: 'Est. Value (₹)' }];
    doc.rect(LEFT, y, W, 14).fill(C.primary);
    let cx = LEFT + 4;
    cols.forEach((c) => {
      doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold').text(c.label, cx, y + 3, { width: c.w - 4 });
      cx += c.w;
    });
    y += 14;
    for (const item of kindItems) {
      doc.rect(LEFT, y, W, 13).fill('#FFF7ED');
      cx = LEFT + 4;
      const cells = [
        item.product?.name || '—',
        `${item.quantity} ${item.unit?.symbol || ''}`,
        item.estimatedValue > 0 ? `₹${item.estimatedValue.toLocaleString('en-IN')}` : '—',
      ];
      cells.forEach((text, i) => {
        doc.fillColor(C.dark).fontSize(8).font('Helvetica').text(String(text), cx, y + 2, { width: cols[i].w - 4 });
        cx += cols[i].w;
      });
      y += 13;
    }
    y += 8;
  }

  // Grand total
  if (grandTotal > 0) {
    doc.rect(LEFT, y, W, 26).fill(C.primary);
    doc.fillColor(C.white).fontSize(11).font('Helvetica-Bold')
      .text(`Total Donation Value: ₹${grandTotal.toLocaleString('en-IN')}`, LEFT + 8, y + 8);
    y += 36;
  }

  y += 10;
  doc.moveTo(LEFT, y).lineTo(LEFT + W, y).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
  y += 16;

  // Signature block
  doc.fillColor(C.dark).fontSize(9).font('Helvetica-Bold').text(`For ${templeName}`, LEFT, y);
  doc.font('Helvetica').fillColor(C.gray).text(`Date: ${fmtDate(new Date())}`, LEFT + W - 130, y);
  y += 44;
  doc.moveTo(LEFT, y).lineTo(LEFT + 130, y).strokeColor('#9CA3AF').lineWidth(0.5).stroke();
  y += 6;
  doc.fillColor(C.gray).fontSize(8).font('Helvetica').text('Authorized Signatory', LEFT, y);

  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fillColor(C.gray).fontSize(7).font('Helvetica')
      .text(`Donation Receipt · ${donation.donationNumber} · ${templeName}`, LEFT, doc.page.height - 32, { width: W, align: 'center' });
  }

  doc.end();
}

// ── Donor Statement ───────────────────────────────────────────────────────────
export function generateDonorStatement(res, { donor, donations, settings }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  const safeName = (donor.name || 'Donor').replace(/[^a-zA-Z0-9_-]/g, '_');
  res.setHeader('Content-Disposition', `attachment; filename="Donor-Statement-${safeName}.pdf"`);
  doc.pipe(res);

  const W    = doc.page.width - 80;
  const LEFT = 40;
  const templeName = settings?.templeName || 'Mangal Grah Mandir, Amalner';

  const totalCash = donations.reduce((s, d) => s + (d.cashAmount || 0), 0);
  const totalKind = donations.reduce((s, d) => s + (d.kindItems || []).reduce((k, i) => k + (i.estimatedValue || 0), 0), 0);

  // Header
  doc.rect(LEFT, 30, W, 54).fill(C.primary);
  doc.fillColor(C.white).fontSize(16).font('Helvetica-Bold').text(templeName, LEFT + 10, 40, { width: W - 20 });
  doc.fontSize(9).font('Helvetica').text('Donor Contribution Statement', LEFT + 10, 60);

  doc.fillColor(C.dark).fontSize(9).font('Helvetica').text(`Generated: ${fmtDate(new Date())}`, LEFT, 96, { align: 'right', width: W });

  // Donor info box
  let y = 114;
  doc.rect(LEFT, y, W, 40).fill(C.light);
  doc.fillColor(C.primary).fontSize(14).font('Helvetica-Bold').text(donor.name || 'Donor', LEFT + 10, y + 6, { width: W - 20 });
  const meta = [donor.phone, donor.panNumber ? `PAN: ${donor.panNumber}` : null].filter(Boolean).join('  ·  ');
  if (meta) doc.fillColor(C.gray).fontSize(8).font('Helvetica').text(meta, LEFT + 10, y + 26);
  y += 50;

  // Summary boxes
  const boxes = [
    { label: 'Total Donations',  value: String(donations.length) },
    { label: 'Cash Donated',     value: `₹${totalCash.toLocaleString('en-IN')}` },
    { label: 'Kind Value (Est)', value: `₹${totalKind.toLocaleString('en-IN')}` },
    { label: 'Grand Total',      value: `₹${(totalCash + totalKind).toLocaleString('en-IN')}` },
  ];
  const bw = (W - 9) / 4;
  boxes.forEach((b, i) => {
    const bx = LEFT + i * (bw + 3);
    doc.rect(bx, y, bw, 34).fill(C.light);
    doc.fillColor(C.primary).fontSize(13).font('Helvetica-Bold').text(b.value, bx, y + 4, { width: bw, align: 'center' });
    doc.fillColor(C.gray).fontSize(7).font('Helvetica').text(b.label, bx, y + 22, { width: bw, align: 'center' });
  });
  y += 46;

  // Table
  const cols = [
    { label: 'Receipt No.', w: 100 }, { label: 'Date',    w: 65 },
    { label: 'Occasion',    w: 110 }, { label: 'Cash (₹)', w: 60 },
    { label: 'Kind Items',  w: 55 },  { label: 'Total (₹)', w: 55 },
  ];
  doc.rect(LEFT, y, W, 14).fill(C.primary);
  let cx = LEFT + 3;
  cols.forEach((c) => {
    doc.fillColor(C.white).fontSize(7).font('Helvetica-Bold').text(c.label, cx, y + 3, { width: c.w - 3 });
    cx += c.w;
  });
  y += 14;

  let rowNum = 0;
  for (const d of donations) {
    if (y > doc.page.height - 50) { doc.addPage(); y = 40; }
    const bg    = rowNum % 2 === 0 ? C.white : '#FFF7ED';
    const kVal  = (d.kindItems || []).reduce((s, k) => s + (k.estimatedValue || 0), 0);
    const total = (d.cashAmount || 0) + kVal;
    doc.rect(LEFT, y, W, 13).fill(bg);
    const cells = [
      d.donationNumber || '—', fmtDate(d.date), d.occasion?.name || '—',
      d.cashAmount > 0 ? `₹${d.cashAmount.toLocaleString('en-IN')}` : '—',
      (d.kindItems || []).length > 0 ? `${(d.kindItems || []).length} item${(d.kindItems || []).length > 1 ? 's' : ''}` : '—',
      total > 0 ? `₹${total.toLocaleString('en-IN')}` : '—',
    ];
    cx = LEFT + 3;
    cells.forEach((text, i) => {
      doc.fillColor(C.dark).fontSize(7).font('Helvetica').text(String(text), cx, y + 2, { width: cols[i].w - 3, ellipsis: true });
      cx += cols[i].w;
    });
    doc.moveTo(LEFT, y + 13).lineTo(LEFT + W, y + 13).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
    y += 13; rowNum++;
  }

  // Total row
  if (y > doc.page.height - 30) { doc.addPage(); y = 40; }
  doc.rect(LEFT, y, W, 16).fill(C.primary);
  doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold')
    .text('Grand Total', LEFT + 3, y + 4, { width: cols[0].w + cols[1].w + cols[2].w + cols[3].w - 3 });
  const totalsCx = LEFT + cols[0].w + cols[1].w + cols[2].w + 3;
  doc.text(`₹${totalCash.toLocaleString('en-IN')}`, totalsCx, y + 4, { width: cols[3].w - 3 });
  const grandCx = totalsCx + cols[3].w + cols[4].w;
  doc.text(`₹${(totalCash + totalKind).toLocaleString('en-IN')}`, grandCx, y + 4, { width: cols[5].w - 3 });

  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fillColor(C.gray).fontSize(7).font('Helvetica')
      .text(`Donor Statement · ${donor.name} · ${templeName}`, LEFT, doc.page.height - 28, { width: W, align: 'center' });
  }

  doc.end();
}

// ── 80G Tax Exemption Receipt ─────────────────────────────────────────────────
export function generate80GReceipt(res, { donation, settings }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="80G-${donation.donationNumber}.pdf"`);
  doc.pipe(res);

  const W    = doc.page.width - 100;
  const LEFT = 50;
  const PM   = { cash: 'Cash', upi: 'UPI / Online', cheque: 'Cheque', bank_transfer: 'Bank Transfer' };

  const templeName = settings.templeName || 'Mangal Grah Mandir, Amalner';
  const donorName  = donation.donor?.name || donation.donorName || 'Anonymous';
  const donorPAN   = donation.panNumber   || donation.donor?.panNumber || '';
  const amount     = donation.cashAmount  || 0;
  const occasion   = donation.occasion?.name || 'General Donation';
  const words      = amountToWords(amount);

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.rect(LEFT, 40, W, 62).fill(C.primary);
  doc.fillColor(C.white).fontSize(17).font('Helvetica-Bold')
    .text(templeName, LEFT + 12, 50, { width: W - 24 });
  doc.fontSize(8).font('Helvetica')
    .text('DONATION RECEIPT UNDER SECTION 80G OF THE INCOME TAX ACT, 1961', LEFT + 12, 72, { width: W - 24 });

  // ── Meta row ────────────────────────────────────────────────────────────────
  let y = 118;
  doc.fillColor(C.dark).fontSize(9);
  doc.font('Helvetica-Bold').text('Receipt No.', LEFT, y, { continued: true });
  doc.font('Helvetica').text(`  ${donation.donationNumber || '—'}`);
  doc.font('Helvetica-Bold').text('Date', LEFT + W - 120, y, { continued: true });
  doc.font('Helvetica').text(`  ${fmtDate(donation.date)}`);
  y += 16;

  if (settings.trustPAN) {
    doc.font('Helvetica-Bold').text('Trust PAN', LEFT, y, { continued: true });
    doc.font('Helvetica').text(`  ${settings.trustPAN}`);
  }
  if (settings.reg80GNumber) {
    doc.font('Helvetica-Bold').text('80G Reg. No.', LEFT + W - 180, y, { continued: true });
    doc.font('Helvetica').text(`  ${settings.reg80GNumber}`);
    y += 16;
  } else { y += 16; }

  if (settings.reg80GFrom || settings.reg80GTo) {
    doc.font('Helvetica-Bold').text('Valid', LEFT, y, { continued: true });
    doc.font('Helvetica').text(`  ${settings.reg80GFrom ? fmtDate(settings.reg80GFrom) : '—'}  to  ${settings.reg80GTo ? fmtDate(settings.reg80GTo) : '—'}`);
    y += 16;
  }

  // ── Divider ─────────────────────────────────────────────────────────────────
  y += 4;
  doc.moveTo(LEFT, y).lineTo(LEFT + W, y).strokeColor('#E5E7EB').lineWidth(1).stroke();
  y += 16;

  // ── Received from ───────────────────────────────────────────────────────────
  doc.fillColor(C.gray).fontSize(8).font('Helvetica').text('Received with thanks from:', LEFT, y);
  y += 14;
  doc.fillColor(C.dark).fontSize(16).font('Helvetica-Bold').text(donorName, LEFT, y);
  y += 24;
  if (donorPAN) {
    doc.fontSize(9).font('Helvetica').fillColor(C.gray).text('PAN: ', LEFT, y, { continued: true });
    doc.font('Helvetica-Bold').fillColor(C.dark).text(donorPAN);
    y += 14;
  }

  // ── Amount box ──────────────────────────────────────────────────────────────
  y += 8;
  doc.rect(LEFT, y, W, 54).fill(C.light);
  doc.fillColor(C.primary).fontSize(24).font('Helvetica-Bold')
    .text(`₹${amount.toLocaleString('en-IN')}/-`, LEFT, y + 8, { width: W, align: 'center' });
  doc.fillColor(C.dark).fontSize(9).font('Helvetica')
    .text(`(${words} Rupees Only)`, LEFT, y + 36, { width: W, align: 'center' });
  y += 64;

  doc.fontSize(9).font('Helvetica-Bold').fillColor(C.dark)
    .text('Being:', LEFT, y, { continued: true });
  doc.font('Helvetica').text(`  ${occasion}`);
  y += 14;
  doc.font('Helvetica-Bold').text('Paid by:', LEFT, y, { continued: true });
  doc.font('Helvetica').text(`  ${PM[donation.paymentMode] || donation.paymentMode || 'Cash'}${donation.paymentRef ? ` — Ref: ${donation.paymentRef}` : ''}`);
  y += 26;

  // ── Certification ───────────────────────────────────────────────────────────
  doc.rect(LEFT, y, W, 4).fill(C.primary);
  y += 12;

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
    .text(certText, LEFT, y, { width: W, lineGap: 3, align: 'justify' });
  y = doc.y + 20;

  // ── Signature block ─────────────────────────────────────────────────────────
  doc.moveTo(LEFT, y).lineTo(LEFT + W, y).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
  y += 16;
  doc.fillColor(C.dark).fontSize(9).font('Helvetica-Bold').text(`For ${templeName}`, LEFT, y);
  doc.font('Helvetica').fillColor(C.gray).text(`Date: ${fmtDate(new Date())}`, LEFT + W - 130, y);
  y += 44;
  doc.moveTo(LEFT, y).lineTo(LEFT + 130, y).strokeColor('#9CA3AF').lineWidth(0.5).stroke();
  y += 6;
  doc.fillColor(C.gray).fontSize(8).font('Helvetica').text('Authorized Signatory', LEFT, y);

  // ── Footer ──────────────────────────────────────────────────────────────────
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fillColor(C.gray).fontSize(7).font('Helvetica')
      .text(`80G Receipt · ${donation.donationNumber} · ${templeName}`, LEFT, doc.page.height - 32, { width: W, align: 'center' });
  }

  doc.end();
}
