import ExcelJS from 'exceljs';
import { formatAddress } from '../../utils/address.js';
import PDFDocument from 'pdfkit';
import { localDateStr } from '../../utils/dates.js';

const HDR_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEA580C' } };
const BORDER = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
const MODE = { cash: 'Cash', upi: 'UPI', card: 'Card', online: 'Online' };
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '');
const money = (n) => `Rs. ${Math.round(n || 0).toLocaleString('en-IN')}`; // Helvetica has no ₹ glyph

/** Booking register as .xlsx */
export async function bookingsExcel(res, { bookings, title }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Mangal Grah Mandir';
  const ws = wb.addWorksheet('Bookings');
  ws.columns = [
    { header: 'Receipt No.', key: 'receiptNo', width: 20 },
    { header: 'Booked On', key: 'paidOn', width: 13 },
    { header: 'Time', key: 'paidTime', width: 9 },
    { header: 'Seva', key: 'seva', width: 26 },
    { header: 'Puja Date', key: 'pujaDate', width: 13 },
    { header: 'Batch', key: 'batch', width: 20 },
    { header: 'Hall', key: 'hall', width: 7 },
    { header: 'Serial', key: 'serial', width: 7 },
    { header: 'Name', key: 'name', width: 26 },
    { header: 'Phone', key: 'phone', width: 13 },
    { header: 'Address', key: 'address', width: 34 },
    { header: 'Gotra', key: 'gotra', width: 14 },
    { header: 'Family names', key: 'family', width: 30 },
    { header: 'Rashi', key: 'rashi', width: 11 },
    { header: 'Nakshatra', key: 'nakshatra', width: 13 },
    { header: 'Email', key: 'email', width: 22 },
    { header: 'Notes', key: 'notes', width: 24 },
    { header: 'Channel', key: 'channel', width: 9 },
    { header: 'People', key: 'people', width: 8 },
    { header: 'Amount', key: 'amount', width: 11 },
    { header: 'Payment', key: 'mode', width: 9 },
    { header: 'Reference', key: 'ref', width: 16 },
    { header: 'Booked By', key: 'by', width: 18 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Void reason', key: 'voidReason', width: 24 },
    { header: 'Checked in', key: 'checkedIn', width: 17 },
  ];
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = HDR_FILL; c.border = BORDER;
  });
  for (const b of bookings) {
    ws.addRow({
      receiptNo: b.receiptNo, paidOn: fmtDate(b.paidAt), paidTime: fmtTime(b.paidAt), seva: b.sevaName,
      pujaDate: fmtDate(b.performDate), batch: b.batchLabel, hall: b.hall, serial: b.serialNo ?? '',
      name: b.devotee?.name, phone: b.devotee?.phone, address: formatAddress(b.devotee), gotra: b.devotee?.gotra,
      family: (b.devotee?.familyNames || []).join(', '), rashi: b.devotee?.rashi, nakshatra: b.devotee?.nakshatra,
      email: b.devotee?.email, notes: b.notes, channel: b.channel === 'online' ? 'Online' : 'Counter', people: b.peopleCount,
      amount: b.amount, mode: MODE[b.paymentMode] || b.paymentMode, ref: b.paymentRef,
      by: b.createdBy?.name || '', status: b.status === 'voided' ? 'Voided' : 'Confirmed', voidReason: b.voidReason,
      checkedIn: b.checkedInAt ? `${fmtDate(b.checkedInAt)} ${fmtTime(b.checkedInAt)}` : '',
    });
  }
  const confirmed = bookings.filter((b) => b.status !== 'voided');
  const total = ws.addRow({ receiptNo: `${confirmed.length} bookings`, amount: confirmed.reduce((s, b) => s + b.amount, 0) });
  total.font = { bold: true };
  ws.getColumn('amount').numFmt = '#,##0';
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  if (title) ws.headerFooter.oddHeader = title;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="bookings-${localDateStr()}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

/** One-page summary report as PDF (totals, by seva, by payment, by staff, month-wise). */
export function summaryPdf(res, { data, rangeLabel, templeName }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="booking-summary-${localDateStr()}.pdf"`);
  doc.pipe(res);
  const LEFT = 40; const W = doc.page.width - 80;
  const orange = '#ea580c'; const dark = '#1f2937'; const gray = '#6b7280';

  doc.rect(LEFT, 30, W, 50).fill(orange);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(15).text(templeName, LEFT + 10, 40, { width: W - 20 });
  doc.font('Helvetica').fontSize(9).text('Abhishek / Puja Booking Summary', LEFT + 10, 60);
  doc.fillColor(dark).fontSize(9).text(`Period: ${rangeLabel}`, LEFT, 92)
    .text(`Generated: ${fmtDate(new Date())}`, LEFT, 92, { width: W, align: 'right' });

  let y = 112;
  const boxes = [
    ['Bookings', data.totals.count.toLocaleString('en-IN')],
    ['Amount', money(data.totals.amount)],
    ['Cash', money(data.byMode.cash?.amount)],
    ['UPI / Card / Online', money((data.byMode.upi?.amount || 0) + (data.byMode.card?.amount || 0) + (data.byMode.online?.amount || 0))],
  ];
  const bw = (W - 9) / 4;
  boxes.forEach(([label, value], i) => {
    const x = LEFT + i * (bw + 3);
    doc.rect(x, y, bw, 38).fill('#fff7ed');
    doc.fillColor(orange).font('Helvetica-Bold').fontSize(13).text(value, x, y + 6, { width: bw, align: 'center' });
    doc.fillColor(gray).font('Helvetica').fontSize(7.5).text(label, x, y + 25, { width: bw, align: 'center' });
  });
  y += 52;

  const table = (title, cols, rows) => {
    if (y > doc.page.height - 120) { doc.addPage(); y = 40; }
    doc.fillColor(dark).font('Helvetica-Bold').fontSize(10).text(title, LEFT, y); y += 15;
    doc.rect(LEFT, y, W, 15).fill(orange);
    let x = LEFT + 4;
    cols.forEach((c) => { doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8).text(c.label, x, y + 4, { width: c.w - 8, align: c.right ? 'right' : 'left' }); x += c.w; });
    y += 15;
    rows.forEach((r, i) => {
      if (y > doc.page.height - 50) { doc.addPage(); y = 40; }
      doc.rect(LEFT, y, W, 14).fill(i % 2 ? '#fff7ed' : '#ffffff');
      x = LEFT + 4;
      r.forEach((cell, j) => { doc.fillColor(dark).font('Helvetica').fontSize(8).text(String(cell), x, y + 3, { width: cols[j].w - 8, align: cols[j].right ? 'right' : 'left', ellipsis: true }); x += cols[j].w; });
      y += 14;
    });
    y += 14;
  };

  const third = W / 3;
  table('By seva', [{ label: 'Seva', w: W - 2 * third / 1.5 }, { label: 'Bookings', w: third / 1.5, right: true }, { label: 'Amount', w: third / 1.5, right: true }],
    data.bySeva.map((r) => [r.name, r.count.toLocaleString('en-IN'), money(r.amount)]));
  table('By payment mode', [{ label: 'Mode', w: W - 2 * third / 1.5 }, { label: 'Bookings', w: third / 1.5, right: true }, { label: 'Amount', w: third / 1.5, right: true }],
    Object.entries(data.byMode).map(([m, r]) => [MODE[m] || m, r.count.toLocaleString('en-IN'), money(r.amount)]));
  const sw = W / 6;
  table('By staff (cash to hand over)', [{ label: 'Staff', w: sw * 1.5 }, { label: 'Bookings', w: sw * 0.9, right: true }, { label: 'Cash', w: sw * 0.9, right: true }, { label: 'UPI', w: sw * 0.9, right: true }, { label: 'Card', w: sw * 0.9, right: true }, { label: 'Total', w: sw * 0.9, right: true }],
    data.byStaff.map((r) => [r.name, r.count.toLocaleString('en-IN'), money(r.cash), money(r.upi), money(r.card), money(r.amount)]));
  table('Month-wise', [{ label: 'Month', w: W - 2 * third / 1.5 }, { label: 'Bookings', w: third / 1.5, right: true }, { label: 'Amount', w: third / 1.5, right: true }],
    data.monthly.map((r) => [r.month, r.count.toLocaleString('en-IN'), money(r.amount)]));
  if (data.voided.count) {
    doc.fillColor(gray).font('Helvetica').fontSize(8)
      .text(`Not included above: ${data.voided.count} voided booking(s), ${money(data.voided.amount)}.`, LEFT, y);
  }

  const pages = doc.bufferedPageRange().count;
  for (let i = 0; i < pages; i++) {
    doc.switchToPage(i);
    doc.fillColor(gray).fontSize(7).text(`Page ${i + 1} of ${pages}`, LEFT, doc.page.height - 28, { width: W, align: 'center' });
  }
  doc.end();
}
