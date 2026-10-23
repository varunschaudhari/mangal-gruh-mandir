import QRCode from 'qrcode';
import { createPdf, letterhead, pageFooters, PDF_COLORS, mid } from './pdfLayout.js';
import { amountToWords } from './donationPdf.service.js';
import { maskMobile } from '../utils/phone.js';

// The payment receipt for Mahaprasad coupons bought online (the /prasad page): the trust's
// letterhead, what was bought, the amount and the Razorpay payment. Opened from the devotee's
// coupon page (/m/<token>); it is also the sample invoice Razorpay asks for when a website is added.

const C = { accent: PDF_COLORS.accent, dark: PDF_COLORS.text, gray: PDF_COLORS.muted, light: PDF_COLORS.accentSoft, line: PDF_COLORS.line };
const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const dayText = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
const timeText = (d) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const METHOD = { upi: 'UPI', card: 'Card', netbanking: 'Net banking', wallet: 'Wallet', emi: 'EMI', paylater: 'Pay later' };

/**
 * Writes the PDF to `out` (an HTTP response or a file stream).
 * order: { couponNumber, date, plates, pricePerPlate, amount, mobile, name, method, paymentId, paidAt }
 */
export async function writeOnlineReceipt(out, { order, validityDays = 1 }) {
  const doc = createPdf({ size: 'A4', margin: 50 });
  doc.pipe(out);
  const LEFT = 50;
  const W = doc.page.width - 100;

  let y = letterhead(doc, { title: 'Payment Receipt', number: order.couponNumber, numberLabel: 'Coupon No.', date: timeText(order.paidAt) });
  doc.moveTo(LEFT, y).lineTo(LEFT + W, y).strokeColor(C.line).lineWidth(1).stroke();
  y += 14;
  if (order.testMode) {
    // Paid with Razorpay test keys
    doc.rect(LEFT, y, W, 24).lineWidth(1.2).strokeColor('#b91c1c').stroke();
    doc.fillColor('#b91c1c').fontSize(11).font('Helvetica-Bold')
      .text('TEST — no real payment. This coupon is not valid at the Shri Mangal Mahaprasad hall.', LEFT, y + mid(24, 11), { width: W, align: 'center' });
    y += 36;
  }

  doc.fillColor(C.gray).fontSize(8).font('Helvetica').text('Received with thanks from:', LEFT, y);
  doc.fillColor(C.dark).fontSize(15).font('Helvetica-Bold').text(order.name || 'Devotee', LEFT, doc.y, { width: W });
  doc.fontSize(9).font('Helvetica').fillColor(C.gray).text(`Mobile: ${maskMobile(order.mobile)}`, LEFT, doc.y);
  y = doc.y + 14;

  // What was bought
  const cols = [
    { label: 'Item', w: W * 0.34 }, { label: 'Mahaprasad day', w: W * 0.26 },
    { label: 'Plates', w: W * 0.12, right: true }, { label: 'Rate', w: W * 0.13, right: true }, { label: 'Amount', w: W * 0.15, right: true },
  ];
  const row = (cells, { head = false } = {}) => {
    const h = head ? 18 : 22;
    if (head) {
      doc.rect(LEFT, y, W, h).fill(C.light);
      doc.moveTo(LEFT, y + h).lineTo(LEFT + W, y + h).lineWidth(0.8).strokeColor(C.accent).stroke();
    } else {
      doc.moveTo(LEFT, y + h).lineTo(LEFT + W, y + h).lineWidth(0.5).strokeColor(C.line).stroke();
    }
    let x = LEFT;
    cells.forEach((text, i) => {
      const size = head ? 8 : 10;
      doc.fillColor(head ? C.accent : C.dark).fontSize(size).font(head ? 'Helvetica-Bold' : 'Helvetica')
        .text(String(text), x + 6, y + mid(h, size), { width: cols[i].w - 12, align: cols[i].right ? 'right' : 'left', lineBreak: false });
      x += cols[i].w;
    });
    y += h;
  };
  row(cols.map((c) => c.label), { head: true });
  row([
    order.plates > 1 ? 'Shri Mangal Mahaprasad coupon (group)' : 'Shri Mangal Mahaprasad coupon',
    dayText(order.date), order.plates, rupees(order.pricePerPlate), rupees(order.amount),
  ]);
  y += 12;

  // Total
  doc.rect(LEFT, y, W, 50).fill(C.light);
  doc.moveTo(LEFT, y).lineTo(LEFT + W, y).lineWidth(0.8).strokeColor(C.accent).stroke();
  doc.moveTo(LEFT, y + 50).lineTo(LEFT + W, y + 50).lineWidth(0.8).strokeColor(C.accent).stroke();
  doc.fillColor(C.accent).fontSize(18).font('Helvetica-Bold').text(`Total paid: ${rupees(order.amount)}/-`, LEFT, y + 6, { width: W, align: 'center' });
  doc.fillColor(C.dark).fontSize(9).font('Helvetica').text(`(${amountToWords(order.amount)} Rupees Only)`, LEFT, y + 31, { width: W, align: 'center' });
  y += 64;

  // The payment
  const line = (label, value) => {
    doc.fontSize(9.5).font('Helvetica-Bold').fillColor(C.dark).text(`${label}:`, LEFT, y, { continued: true });
    doc.font('Helvetica').text(`  ${value}`);
    y = doc.y + 3;
  };
  line('Paid', `Online through Razorpay${order.method ? ` (${METHOD[order.method] || order.method})` : ''}`);
  line('Payment ID', order.paymentId || '—');
  line('Paid on', timeText(order.paidAt));
  y += 12;

  // The coupon itself: the same QR as on the coupon page (the coupon number), scanned at the hall —
  // so the printed or saved receipt works as the coupon too
  const valid = validityDays > 1 ? `on ${dayText(order.date)} or within ${validityDays} days of it` : `on ${dayText(order.date)} only`;
  const QR = 132;
  const BOX = QR + 24;
  const qr = await QRCode.toBuffer(order.couponNumber, { type: 'png', width: 600, margin: 1, errorCorrectionLevel: 'M' });
  doc.roundedRect(LEFT, y, W, BOX, 10).lineWidth(1.2).strokeColor(C.accent).stroke();
  doc.image(qr, LEFT + 12, y + 12, { width: QR, height: QR });
  const tx = LEFT + QR + 30;
  const tw = W - QR - 42;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.accent)
    .text('YOUR COUPON — SHOW THIS QR AT THE SHRI MANGAL MAHAPRASAD HALL', tx, y + 14, { width: tw, characterSpacing: 0.4 });
  doc.font('Helvetica-Bold').fontSize(17).fillColor(C.dark).text(order.couponNumber, tx, doc.y + 4, { width: tw });
  doc.font('Helvetica-Bold').fontSize(14).fillColor(C.dark)
    .text(order.plates > 1 ? `${order.plates} persons (group coupon)` : '1 person', tx, doc.y + 2, { width: tw });
  doc.font('Helvetica').fontSize(9.5).fillColor(C.dark)
    .text(`Valid ${valid}. It can be used once${order.plates > 1 ? ', for all its persons together' : ''}.`, tx, doc.y + 6, { width: tw, lineGap: 1 });
  doc.font('Helvetica').fontSize(8.5).fillColor(C.gray)
    .text('Coupons are not refunded and cannot be moved to another day.', tx, doc.y + 3, { width: tw });
  if (order.testMode) {
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#b91c1c').text('TEST — not valid at the hall', tx, doc.y + 4, { width: tw });
  }
  y = Math.max(y + BOX, doc.y) + 24;

  doc.moveTo(LEFT, y).lineTo(LEFT + W, y).strokeColor(C.line).lineWidth(0.5).stroke();
  doc.fillColor(C.gray).fontSize(8).font('Helvetica')
    .text('This is a computer-generated receipt and needs no signature.', LEFT, y + 6, { width: W, align: 'center' });

  pageFooters(doc, { label: `Mahaprasad payment receipt · ${order.couponNumber}` });
  doc.end();
}
