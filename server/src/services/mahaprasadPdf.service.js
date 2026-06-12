import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const LOGO_PATH  = path.resolve(__dirname, '../../../client/public/logo.png');

// ── Palette ───────────────────────────────────────────────────────────────────

const C = {
  saffron:      '#d97706',
  saffronDeep:  '#92400e',
  headerText:   '#fffbeb',
  subText:      '#fde68a',

  paidAccent:   '#1d4ed8',
  paidBadgeBg:  '#dbeafe',
  paidBadgeTx:  '#1e3a8a',

  freeAccent:   '#16a34a',
  freeBadgeBg:  '#dcfce7',
  freeBadgeTx:  '#14532d',

  bodyBg:       '#fffdf7',
  white:        '#ffffff',
  dark:         '#111827',
  gray:         '#4b5563',
  muted:        '#6b7280',
  light:        '#9ca3af',
  divider:      '#e5e7eb',
};

// ── Layout ────────────────────────────────────────────────────────────────────

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 20;
const COLS   = 2;
const ROWS   = 3;
const CELL_W = (PAGE_W - MARGIN * 2) / COLS;
const CELL_H = (PAGE_H - MARGIN * 2) / ROWS;
const GAP    = 5;

const fmtDate = (d, opts = {}) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', ...opts });

// ── Draw one coupon ───────────────────────────────────────────────────────────

async function drawCoupon(doc, coupon, settings, cx, cy) {
  const x = MARGIN + cx * CELL_W + GAP / 2;
  const y = MARGIN + cy * CELL_H + GAP / 2;
  const w = CELL_W - GAP;
  const h = CELL_H - GAP;
  const r = 7;

  const isFree      = coupon.type === 'free';
  const accent      = isFree ? C.freeAccent  : C.paidAccent;
  const badgeBg     = isFree ? C.freeBadgeBg : C.paidBadgeBg;
  const badgeTx     = isFree ? C.freeBadgeTx : C.paidBadgeTx;
  const badgeLabel  = isFree ? 'FREE SEVA'   : `₹${coupon.amount}  PAID`;

  const HEADER_H = 48;
  const FOOTER_H = 26;

  // ── Card backgrounds (clipped to rounded rect) ────────────────────────────
  doc.save();
  doc.roundedRect(x, y, w, h, r).clip();
  doc.rect(x, y,                       w, HEADER_H).fill(C.saffron);
  doc.rect(x, y + HEADER_H,            w, h - HEADER_H - FOOTER_H).fill(C.bodyBg);
  doc.rect(x, y + h - FOOTER_H,        w, FOOTER_H).fill(accent);
  doc.restore();

  // ── Card border ───────────────────────────────────────────────────────────
  doc.roundedRect(x, y, w, h, r).lineWidth(1.5).strokeColor(accent).stroke();

  // ── Header: logo ──────────────────────────────────────────────────────────
  const LOGO_SZ = 34;
  const LOGO_X  = x + 8;
  const LOGO_Y  = y + (HEADER_H - LOGO_SZ) / 2;
  const hasLogo = existsSync(LOGO_PATH);

  if (hasLogo) {
    doc.save()
      .circle(LOGO_X + LOGO_SZ / 2, LOGO_Y + LOGO_SZ / 2, LOGO_SZ / 2 + 2)
      .fill(C.white)
      .restore();
    try { doc.image(LOGO_PATH, LOGO_X, LOGO_Y, { width: LOGO_SZ, height: LOGO_SZ }); }
    catch { /* skip */ }
  }

  // ── Header: temple name ───────────────────────────────────────────────────
  const nameX = x + (hasLogo ? LOGO_SZ + 18 : 10);
  const nameW = w - (nameX - x) - 68;
  const templeName = settings?.templeName || 'Mangal Grah Mandir';

  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.headerText)
    .text(templeName.toUpperCase(), nameX, y + 11, { width: nameW, lineBreak: false });
  doc.font('Helvetica-Oblique').fontSize(7).fillColor(C.subText)
    .text('Mahaprasad Seva Coupon', nameX, y + 24, { width: nameW, lineBreak: false });

  // ── Header: type badge ────────────────────────────────────────────────────
  const BW = 62, BH = 16;
  const BX = x + w - BW - 7;
  const BY = y + (HEADER_H - BH) / 2;

  doc.save().roundedRect(BX, BY, BW, BH, 3).fill(badgeBg).restore();
  doc.font('Helvetica-Bold').fontSize(7).fillColor(badgeTx)
    .text(badgeLabel, BX, BY + 4.5, { width: BW, align: 'center', lineBreak: false });

  // ── Info block (centered, below header) ───────────────────────────────────
  let iy = y + HEADER_H + 10;

  // "COUPON NO." micro-label
  doc.font('Helvetica').fontSize(6).fillColor(C.muted)
    .text('COUPON NO.', x, iy, { width: w, align: 'center', characterSpacing: 0.5, lineBreak: false });
  iy += 9;

  // Coupon number — large, centered
  doc.font('Helvetica-Bold').fontSize(11.5).fillColor(C.saffronDeep)
    .text(coupon.couponNumber, x, iy, { width: w, align: 'center', lineBreak: false });
  iy += 15;

  // Thin divider
  const DIV_PAD = w * 0.15;
  doc.save().moveTo(x + DIV_PAD, iy).lineTo(x + w - DIV_PAD, iy)
    .lineWidth(0.5).strokeColor(C.divider).stroke().restore();
  iy += 6;

  // Date
  doc.font('Helvetica').fontSize(7.5).fillColor(C.gray)
    .text(fmtDate(coupon.date, { weekday: 'short' }), x, iy, { width: w, align: 'center', lineBreak: false });
  iy += 11;

  // Occasion (free only)
  if (isFree && coupon.occasion) {
    doc.font('Helvetica-Oblique').fontSize(7).fillColor(C.freeAccent)
      .text(coupon.occasion, x, iy, { width: w, align: 'center', lineBreak: false });
    iy += 10;
  }

  // ── QR code — centered ────────────────────────────────────────────────────
  const QR_SZ = 82;
  const QR_X  = x + (w - QR_SZ) / 2;
  const QR_Y  = iy + 8;

  // White frame around QR
  doc.save()
    .rect(QR_X - 3, QR_Y - 3, QR_SZ + 6, QR_SZ + 6)
    .lineWidth(0.5).strokeColor(C.divider).fill(C.white).stroke()
    .restore();

  const qrBuf = await QRCode.toBuffer(coupon.couponNumber, {
    width: 100, margin: 1, color: { dark: C.dark, light: C.white },
  });
  doc.image(qrBuf, QR_X, QR_Y, { width: QR_SZ, height: QR_SZ });

  doc.font('Helvetica').fontSize(5.5).fillColor(C.light)
    .text('SCAN TO VERIFY', x, QR_Y + QR_SZ + 5, { width: w, align: 'center', lineBreak: false });

  // ── Details bar (validity + batch) ────────────────────────────────────────
  const detY = QR_Y + QR_SZ + 18;

  const validityDays = settings?.mahaprasadCouponValidityDays ?? 1;
  if (validityDays > 0) {
    const expiry = new Date(coupon.date);
    expiry.setDate(expiry.getDate() + validityDays);
    doc.font('Helvetica').fontSize(6.5).fillColor(C.muted)
      .text(`Valid until: ${fmtDate(expiry)}`, x + 10, detY, { width: w / 2 - 10, lineBreak: false });
  }

  if (coupon.batchId) {
    doc.font('Helvetica').fontSize(6).fillColor(C.light)
      .text(`Batch: ${coupon.batchId.substring(0, 8).toUpperCase()}`, x + w / 2, detY, { width: w / 2 - 10, align: 'right', lineBreak: false });
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const ftY = y + h - FOOTER_H;
  const addr  = settings?.templeAddress || '';
  const phone = settings?.templePhone   || '';
  const contactLine = [addr, phone].filter(Boolean).join('  ·  ');

  doc.font('Helvetica-Bold').fontSize(5.8).fillColor(C.white)
    .text('Present at Prasad counter · Valid for one serving · Non-transferable',
      x + 4, ftY + 4, { width: w - 8, align: 'center', lineBreak: false });

  if (contactLine) {
    doc.font('Helvetica').fontSize(5.5).fillColor(C.subText)
      .text(contactLine, x + 4, ftY + 14, { width: w - 8, align: 'center', lineBreak: false });
  }

  // ── Cut guides at shared cell edges ───────────────────────────────────────
  doc.save().dash(3, { space: 2 }).lineWidth(0.4).strokeColor('#bbbbbb');
  if (cx === 0) doc.moveTo(x + w + GAP / 2, y - GAP / 2).lineTo(x + w + GAP / 2, y + h + GAP / 2).stroke();
  if (cy > 0)   doc.moveTo(x - GAP / 2, y - GAP / 2).lineTo(x + w + GAP / 2, y - GAP / 2).stroke();
  doc.undash().restore();
}

// ── Public export ─────────────────────────────────────────────────────────────

export async function generateCouponsPdf(res, { coupons, settings }) {
  const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="mahaprasad-coupons.pdf"');
  doc.pipe(res);

  for (let idx = 0; idx < coupons.length; idx++) {
    const pos = idx % (COLS * ROWS);
    if (pos === 0 && idx > 0) doc.addPage();
    await drawCoupon(doc, coupons[idx], settings, pos % COLS, Math.floor(pos / COLS));
  }

  doc.end();
}
