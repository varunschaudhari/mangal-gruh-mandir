import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as fontkit from 'fontkit';
import QRCode from 'qrcode';
import { Resvg } from '@resvg/resvg-js';
import { couponText, localeOf } from '../../../shared/devoteeLanguage.js';

// A sale's Mahaprasad coupons as a picture (PNG): the picture at the top of the WhatsApp message,
// so the QR is in the devotee's chat and needs no internet at the hall. Each QR holds the coupon
// number, like the paper coupon; a group coupon is one QR for everyone. Up to 6 coupons are drawn
// (the page behind the link has them all).
//
// Text is drawn as outlines with fontkit (Marathi needs shaping), like the booking slip picture
// (booking/slipImage.js), so it looks the same on any server without fonts installed.

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets');
const FONTS = {
  400: fontkit.openSync(path.join(ASSETS, 'fonts/Mukta-Regular.ttf')),
  700: fontkit.openSync(path.join(ASSETS, 'fonts/Mukta-Bold.ttf')),
};
const LOGO = (() => {
  try { return `data:image/png;base64,${readFileSync(path.join(ASSETS, 'logo.png')).toString('base64')}`; } catch { return null; }
})();

const W = 1000;
const M = 40;
const MAX_SHOWN = 6;

function shape(str, size, weight = 400) {
  const font = FONTS[weight] || FONTS[400];
  const run = font.layout(String(str));
  const k = size / font.unitsPerEm;
  return { run, k, width: run.positions.reduce((s, p) => s + p.xAdvance, 0) * k };
}

function outline({ run, k }, x, baseline, fill) {
  let pen = x;
  const parts = [];
  run.glyphs.forEach((g, i) => {
    const p = run.positions[i];
    const d = g.path.toSVG();
    if (d) parts.push(`<path transform="translate(${(pen + p.xOffset * k).toFixed(2)} ${(baseline - p.yOffset * k).toFixed(2)}) scale(${k.toFixed(5)} ${(-k).toFixed(5)})" d="${d}"/>`);
    pen += p.xAdvance * k;
  });
  return `<g fill="${fill}">${parts.join('')}</g>`;
}

const dateText = (d, lang) => new Date(d).toLocaleDateString(localeOf(lang), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const PURPLE = '#6b21a8';

// How many people a coupon is for, big enough to read across the food counter: the number, and the
// word at half its size, centred in a cell (like the thermal slip — utils/thermalPrint.js).
function personsOutline(n, x, cellW, baseline, size, lang) {
  const num = shape(String(n), size, 700);
  const word = shape(` ${couponText(lang).persons(n)}`, Math.round(size * 0.5), 700);
  const left = x + (cellW - num.width - word.width) / 2;
  return outline(num, left, baseline, PURPLE) + outline(word, left + num.width, baseline, PURPLE);
}

/**
 * PNG of the coupons. `coupons` (lean, sorted): couponNumber, date, type, occasion, status,
 * groupSize. `temple` = { name, nameMr }; `lang` = Settings → Mahaprasad → Coupon language.
 */
export async function couponsQrPng(coupons, { temple = {}, lang = 'en' } = {}) {
  const L = couponText(lang);
  const STAMP = { redeemed: L.served, voided: L.cancelled };
  const out = [];
  let y = M;
  // Centred line of text, shrunk to fit the width
  const line = (str, size, { weight = 400, fill = '#111', gap = 8 } = {}) => {
    if (!str) return;
    let s = shape(str, size, weight);
    while (s.width > W - 2 * M && size > 18) { size -= 2; s = shape(str, size, weight); }
    out.push(outline(s, (W - s.width) / 2, y + size * 0.95, fill));
    y += Math.round(size * 1.3) + gap;
  };

  if (LOGO) { out.push(`<image href="${LOGO}" x="${(W - 120) / 2}" y="${y}" width="120" height="120" preserveAspectRatio="xMidYMid meet"/>`); y += 128; }
  line(temple.nameMr || temple.name, 44, { weight: 700, gap: 0 });
  if (temple.nameMr && temple.name) line(temple.name, 28, { fill: '#444', gap: 4 });
  line('श्री मंगल महाप्रसाद कूपन', 34, { weight: 700, fill: '#c2410c', gap: 0 });
  line('Shri Mangal Mahaprasad coupon', 24, { weight: 600, fill: '#c2410c', gap: 6 });

  const kind = coupons[0]?.type === 'free' ? (coupons[0].occasion || L.freeKind) : L.paidKind;
  line(`${dateText(coupons[0]?.date || Date.now(), lang)} · ${kind}`, 30, { gap: 18 });

  // One big QR, or two columns
  const shown = coupons.slice(0, MAX_SHOWN);
  const cols = shown.length === 1 ? 1 : 2;
  const cell = cols === 1 ? 620 : (W - 2 * M - 40) / 2;
  const qrSize = cols === 1 ? 600 : cell - 30;
  for (let i = 0; i < shown.length; i += cols) {
    const rowItems = shown.slice(i, i + cols);
    const rowW = rowItems.length * cell + (rowItems.length - 1) * 40;
    for (const [j, c] of rowItems.entries()) {
      const x = (W - rowW) / 2 + j * (cell + 40);
      const qx = x + (cell - qrSize) / 2;
      const qr = await QRCode.toDataURL(c.couponNumber, { width: Math.round(qrSize), margin: 1, errorCorrectionLevel: 'M' });
      out.push(`<image href="${qr}" x="${qx}" y="${y}" width="${qrSize}" height="${qrSize}" style="image-rendering:pixelated"${STAMP[c.status] ? ' opacity="0.2"' : ''}/>`);
      if (STAMP[c.status]) {
        // A served or cancelled coupon (only when the picture is opened later — it's sent at issue)
        const size = cols === 1 ? 64 : 40;
        const st = shape(STAMP[c.status], size, 700);
        const mid = y + qrSize / 2;
        out.push(`<rect x="${x + (cell - st.width) / 2 - 18}" y="${mid - size * 0.8}" width="${st.width + 36}" height="${size * 1.6}" rx="10" fill="#fff" stroke="#b91c1c" stroke-width="4"/>`);
        out.push(outline(st, x + (cell - st.width) / 2, mid + size * 0.33, '#b91c1c'));
      }
      const num = shape(c.couponNumber, cols === 1 ? 44 : 32, 700);
      out.push(outline(num, x + (cell - num.width) / 2, y + qrSize + (cols === 1 ? 52 : 42), '#111'));
      // Every coupon, single ones too: the number of people to serve
      out.push(personsOutline(c.groupSize || 1, x, cell, y + qrSize + (cols === 1 ? 152 : 114), cols === 1 ? 96 : 64, lang));
    }
    y += qrSize + (cols === 1 ? 180 : 138);
  }
  if (coupons.length > shown.length) line(L.more(coupons.length - shown.length), 28, { fill: '#444' });

  y += 6;
  out.push(`<rect x="${M}" y="${y}" width="${W - 2 * M}" height="2" fill="#ddd"/>`);
  y += 18;
  line(L.showAtHall, 32, { weight: 700, gap: 0 });   // the coupon's language (Marathi for English), then English
  line('Show this QR at the Shri Mangal Mahaprasad hall · each coupon is served once', 26, { fill: '#444', gap: 0 });

  const H = Math.ceil(y + M);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<rect width="${W}" height="${H}" fill="#fff"/>${out.join('')}</svg>`;
  return new Resvg(svg, { fitTo: { mode: 'width', value: W }, font: { loadSystemFonts: false } }).render().asPng();
}
