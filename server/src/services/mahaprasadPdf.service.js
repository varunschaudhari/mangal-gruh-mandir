import QRCode from 'qrcode';
import { existsSync } from 'fs';
import { temple } from './temple.service.js';
// The logo ships with the server (server/assets) — the client folder is not in the server image
import { createPdf, LOGO_PATH } from './pdfLayout.js';

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

  purple:       '#6b21a8',   // the number of persons (as on the thermal slip and the phone)
  purpleBg:     '#f5f3ff',
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

// Mukta (the PDF font) sets a line half its size lower than Helvetica did: lift each line by
// that much so the card keeps the spacing it was designed with
const lift = (size) => size / 2;

// ── Draw one coupon ───────────────────────────────────────────────────────────

async function drawCoupon(doc, coupon, settings, cx, cy) {
  const x = MARGIN + cx * CELL_W + GAP / 2;
  const y = MARGIN + cy * CELL_H + GAP / 2;
  const w = CELL_W - GAP;
  const h = CELL_H - GAP;
  const r = 7;

  const isFree      = coupon.type === 'free';
  const isGroup     = coupon.isGroup && (coupon.groupSize || 1) > 1;
  const groupSize   = coupon.groupSize || 1;
  const accent      = isFree ? C.freeAccent  : C.paidAccent;
  const badgeBg     = isFree ? C.freeBadgeBg : C.paidBadgeBg;
  const badgeTx     = isFree ? C.freeBadgeTx : C.paidBadgeTx;
  const badgeLabel  = isGroup
    ? (isFree ? `GROUP  ${groupSize} PERSONS` : `GROUP  ${groupSize}x  Rs.${coupon.amount}`)
    : (isFree ? 'FREE SEVA' : `Rs.${coupon.amount}  PAID`);

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

  // ── Header: type badge ────────────────────────────────────────────────────
  const BW = isGroup ? 82 : 62, BH = 16;
  const BX = x + w - BW - 7;
  const BY = y + (HEADER_H - BH) / 2;

  doc.save().roundedRect(BX, BY, BW, BH, 3).fill(badgeBg).restore();
  doc.font('Helvetica-Bold').fontSize(7).fillColor(badgeTx)
    .text(badgeLabel, BX, BY + 4.5 - lift(7), { width: BW, align: 'center', lineBreak: false });

  // ── Header: temple name (between the logo and the badge; a long name gets a smaller size) ──
  const nameX = x + (hasLogo ? LOGO_SZ + 18 : 10);
  const nameW = BX - 6 - nameX;
  const templeName = (settings?.templeName || temple().name).toUpperCase();
  let nameSize = 8.5;
  doc.font('Helvetica-Bold');
  while (nameSize > 6.5 && doc.fontSize(nameSize).widthOfString(templeName) > nameW) nameSize -= 0.25;

  doc.font('Helvetica-Bold').fontSize(nameSize).fillColor(C.headerText)
    .text(templeName, nameX, y + 11 - lift(nameSize), { width: nameW, height: 14, ellipsis: true });
  doc.font('Helvetica-Oblique').fontSize(7).fillColor(C.subText)
    .text('Mahaprasad Seva Coupon', nameX, y + 24 - lift(7), { width: nameW, lineBreak: false });

  // ── Info block (centered, below header) ───────────────────────────────────
  let iy = y + HEADER_H + 10;

  // "COUPON NO." micro-label
  doc.font('Helvetica').fontSize(6).fillColor(C.muted)
    .text('COUPON NO.', x, iy - lift(6), { width: w, align: 'center', characterSpacing: 0.5, lineBreak: false });
  iy += 9;

  // Coupon number — large, centered
  doc.font('Helvetica-Bold').fontSize(11.5).fillColor(C.saffronDeep)
    .text(coupon.couponNumber, x, iy - lift(11.5), { width: w, align: 'center', lineBreak: false });
  iy += 15;

  // Thin divider
  const DIV_PAD = w * 0.15;
  doc.save().moveTo(x + DIV_PAD, iy).lineTo(x + w - DIV_PAD, iy)
    .lineWidth(0.5).strokeColor(C.divider).stroke().restore();
  iy += 6;

  // Date
  doc.font('Helvetica').fontSize(7.5).fillColor(C.gray)
    .text(fmtDate(coupon.date, { weekday: 'short' }), x, iy - lift(7.5), { width: w, align: 'center', lineBreak: false });
  iy += 11;

  // Occasion (free only)
  if (isFree && coupon.occasion) {
    doc.font('Helvetica-Oblique').fontSize(7).fillColor(C.freeAccent)
      .text(coupon.occasion, x, iy - lift(7), { width: w, align: 'center', lineBreak: false });
    iy += 10;
  }

  // ── QR code, with the number of persons beside it — big, for the food counter ──
  const QR_SZ  = 82;
  const PB_W   = 84;                       // persons box
  const PB_GAP = 14;
  const rowX   = x + (w - (PB_W + PB_GAP + QR_SZ)) / 2;
  const QR_X   = rowX + PB_W + PB_GAP;
  const QR_Y   = iy + 8;

  doc.save().roundedRect(rowX, QR_Y + 8, PB_W, QR_SZ - 16, 6).lineWidth(1.2).fillAndStroke(C.purpleBg, C.purple).restore();
  const numSize = groupSize >= 100 ? 26 : 34;
  doc.font('Helvetica-Bold').fontSize(numSize).fillColor(C.purple)
    .text(String(groupSize), rowX, QR_Y + 20 - lift(numSize), { width: PB_W, align: 'center', lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.purple)
    .text(groupSize === 1 ? 'PERSON' : 'PERSONS', rowX, QR_Y + 57 - lift(9), { width: PB_W, align: 'center', characterSpacing: 0.6, lineBreak: false });

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
    .text('SCAN TO VERIFY', QR_X - 20, QR_Y + QR_SZ + 5 - lift(5.5), { width: QR_SZ + 40, align: 'center', lineBreak: false });

  // ── Details bar (validity + batch) ────────────────────────────────────────
  const detY = QR_Y + QR_SZ + 18;

  const validityDays = settings?.mahaprasadCouponValidityDays ?? 1;
  if (validityDays > 0) {
    const expiry = new Date(coupon.date);
    expiry.setDate(expiry.getDate() + validityDays);
    doc.font('Helvetica').fontSize(6.5).fillColor(C.muted)
      .text(`Valid until: ${fmtDate(expiry)}`, x + 10, detY - lift(6.5), { width: w / 2 - 10, lineBreak: false });
  }

  if (coupon.batchId) {
    doc.font('Helvetica').fontSize(6).fillColor(C.light)
      .text(`Batch: ${coupon.batchId.substring(0, 8).toUpperCase()}`, x + w / 2, detY - lift(6), { width: w / 2 - 10, align: 'right', lineBreak: false });
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const ftY = y + h - FOOTER_H;
  const addr  = settings?.templeAddress || '';
  const phone = settings?.templePhone   || '';
  const contactLine = [addr, phone].filter(Boolean).join('  ·  ');

  const servingText = isGroup ? `Valid for ${groupSize} servings` : 'Valid for one serving';
  doc.font('Helvetica-Bold').fontSize(5.8).fillColor(C.white)
    .text(`Present at Prasad counter · ${servingText} · Non-transferable`,
      x + 4, ftY + 4 - lift(5.8), { width: w - 8, align: 'center', lineBreak: false });

  if (contactLine) {
    doc.font('Helvetica').fontSize(5.5).fillColor(C.subText)
      .text(contactLine, x + 4, ftY + 14 - lift(5.5), { width: w - 8, align: 'center', lineBreak: false });
  }

  // ── Cut guides at shared cell edges ───────────────────────────────────────
  doc.save().dash(3, { space: 2 }).lineWidth(0.4).strokeColor('#bbbbbb');
  if (cx === 0) doc.moveTo(x + w + GAP / 2, y - GAP / 2).lineTo(x + w + GAP / 2, y + h + GAP / 2).stroke();
  if (cy > 0)   doc.moveTo(x - GAP / 2, y - GAP / 2).lineTo(x + w + GAP / 2, y - GAP / 2).stroke();
  doc.undash().restore();
}

// ── Public export ─────────────────────────────────────────────────────────────

export async function generateCouponsPdf(res, { coupons, settings }) {
  // Mukta fonts (Marathi text prints); pages stream out as they are drawn — no page footers here
  const doc = createPdf({ size: 'A4', margin: 0, autoFirstPage: true, bufferPages: false });
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
