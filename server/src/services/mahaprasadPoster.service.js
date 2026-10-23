import QRCode from 'qrcode';
import { createPdf, LOGO_PATH, PDF_COLORS } from './pdfLayout.js';
import { temple } from './temple.service.js';

// The A4 poster for the temple: a big QR that opens the online Mahaprasad page (/prasad), with the
// steps in Marathi and English. Printed from Mahaprasad → Online orders → QR poster. Saffron only as
// an accent, so it prints clearly on the office's black & white printer.

const C = PDF_COLORS;

/** Writes the poster PDF to `out` (an HTTP response or a file stream). url = the public page's full address. */
export async function writeOnlinePoster(out, { url }) {
  const t = temple();
  const doc = createPdf({ size: 'A4', margin: 40, bufferPages: false });
  doc.pipe(out);
  const W = doc.page.width;
  const LEFT = 48;
  const INNER = W - LEFT * 2;
  const center = (text, y, { size, font = 'Body', color = C.text, gap = 0 } = {}) => {
    doc.font(font).fontSize(size).fillColor(color).text(text, LEFT, y, { width: INNER, align: 'center', lineGap: gap });
    return doc.y;
  };

  // Temple header
  let y = 40;
  try { doc.image(LOGO_PATH, W / 2 - 28, y, { fit: [56, 56] }); y += 62; } catch { /* no logo */ }
  y = center(t.nameMr || t.name, y, { size: 21, font: 'Body-Bold' });
  if (t.nameMr) y = center(t.name, y, { size: 12.5, font: 'Body-SemiBold', color: C.muted });
  y += 8;
  doc.moveTo(LEFT, y).lineTo(W - LEFT, y).lineWidth(1.6).strokeColor(C.accent).stroke();
  doc.moveTo(LEFT, y + 3).lineTo(W - LEFT, y + 3).lineWidth(0.4).strokeColor(C.accent).stroke();
  y += 16;

  // Title
  y = center('श्री मंगल महाप्रसाद कूपन ऑनलाइन घ्या', y, { size: 30, font: 'Body-Bold', color: C.accent });
  y = center('Buy Shri Mangal Mahaprasad coupons online', y, { size: 16, font: 'Body-SemiBold' });
  y += 14;

  // The QR, in a frame
  const QR = 230;
  const qr = await QRCode.toBuffer(url, { type: 'png', width: 1000, margin: 1, errorCorrectionLevel: 'M' });
  const boxX = W / 2 - QR / 2 - 16;
  doc.roundedRect(boxX, y, QR + 32, QR + 32, 14).lineWidth(2).strokeColor(C.accent).stroke();
  doc.image(qr, boxX + 16, y + 16, { width: QR, height: QR });
  y += QR + 32 + 8;
  y = center(url.replace(/^https?:\/\//, ''), y, { size: 13, font: 'Body-SemiBold' });
  y = center('फोनच्या कॅमेऱ्याने स्कॅन करा  ·  Scan with your phone camera', y + 2, { size: 12.5, color: C.muted });
  y += 18;

  // Steps
  const steps = [
    ['QR स्कॅन करा', 'Scan the QR code'],
    ['दिवस, थाळ्या व मोबाइल नंबर निवडा', 'Choose day, plates and mobile number'],
    ['UPI, कार्ड किंवा नेट बँकिंगने पैसे भरा', 'Pay by UPI, card or net banking'],
    ['कूपनचा QR सभागृहात दाखवा', 'Show the coupon QR at the hall'],
  ];
  // Two by two, so everything stays on one page
  const GAP = 24;
  const colW = (INNER - GAP) / 2;
  for (let row = 0; row < 2; row += 1) {
    let rowH = 0;
    for (let col = 0; col < 2; col += 1) {
      const i = row * 2 + col;
      const [mr, en] = steps[i];
      const x = LEFT + col * (colW + GAP);
      doc.circle(x + 11, y + 11, 11).fillColor(C.accent).fill();
      doc.font('Body-Bold').fontSize(12).fillColor('#ffffff').text(String(i + 1), x, y + 3, { width: 22, align: 'center' });
      doc.font('Body-SemiBold').fontSize(13).fillColor(C.text).text(mr, x + 30, y, { width: colW - 30 });
      doc.font('Body').fontSize(10.5).fillColor(C.muted).text(en, x + 30, doc.y, { width: colW - 30 });
      rowH = Math.max(rowH, doc.y - y);
    }
    y += rowH + 14;
  }

  // Footer, at the bottom of the same page
  doc.page.margins.bottom = 0;
  const fy = doc.page.height - 70;
  doc.moveTo(LEFT, fy).lineTo(W - LEFT, fy).lineWidth(0.5).strokeColor(C.line).stroke();
  center('कूपन निवडलेल्या दिवसासाठीच असते; पैसे परत मिळत नाहीत.  ·  Coupons are for the chosen day and are not refunded.', fy + 8, { size: 9.5, color: C.muted });
  center([
    'Payments by Razorpay',
    t.phone && `Help: ${t.phone}`,
    t.legalName || '',
  ].filter(Boolean).join('   ·   '), doc.y + 2, { size: 9.5, color: C.muted });

  doc.end();
}
