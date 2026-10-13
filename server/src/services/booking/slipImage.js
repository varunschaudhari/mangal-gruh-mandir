import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as fontkit from 'fontkit';
import QRCode from 'qrcode';
import { Resvg } from '@resvg/resvg-js';

// The counter slip as a picture (PNG), for the WhatsApp receipt: the same layout as the printed
// slip (client/src/utils/bookingReceipt.js → drawSlip) — hall and serial in big black boxes and
// the QR code the hall entrance scans.
//
// Text is shaped with fontkit (Marathi needs it: vowel signs, conjuncts) and drawn as outlines,
// so the picture looks the same on any server without fonts installed.

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../assets');
const FONTS = {
  400: fontkit.openSync(path.join(ASSETS, 'fonts/Mukta-Regular.ttf')),
  600: fontkit.openSync(path.join(ASSETS, 'fonts/Mukta-SemiBold.ttf')),
  700: fontkit.openSync(path.join(ASSETS, 'fonts/Mukta-Bold.ttf')),
};
const LOGO = (() => {
  try { return `data:image/png;base64,${readFileSync(path.join(ASSETS, 'logo.png')).toString('base64')}`; } catch { return null; }
})();

const W = 576;          // 80 mm thermal width at 203 dpi, like the printed slip
const M = 14;           // side margin
const SCALE = 1.5;      // rendered at 864 px wide: sharp on phones, small file
const MODE = { cash: 'Cash', upi: 'UPI', card: 'Card', online: 'Online' };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDate = (key) => new Date(`${key}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtPaid = (d) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const masked = (phone) => (phone ? `XXXXXX${String(phone).slice(-4)}` : '');
const address = (d = {}) => [d.address, d.area, d.city, d.district, d.state, d.pincode].filter(Boolean).join(', ');

// One line of text: its glyph outlines and width
function shape(str, size, weight) {
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

function wrap(str, size, weight, maxW) {
  const lines = [];
  let line = '';
  for (const word of String(str).split(/\s+/).filter(Boolean)) {
    const test = line ? `${line} ${word}` : word;
    if (line && shape(test, size, weight).width > maxW) { lines.push(line); line = word; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * PNG of the slip. `b` is a booking (lean), `hall` = { name, nameMr } for its hall,
 * `temple` = { name, nameMr }, `footer` the note printed under it, `receiptUrl` what the QR holds.
 */
export async function slipPng(b, { hall = {}, temple = {}, footer = '', receiptUrl, bookedBy = '' } = {}) {
  const out = [];
  let y = M;
  const asc = (size) => size * 0.95;   // top of the line → baseline (Mukta's Devanagari rides high)

  const text = (str, size, { weight = 400, align = 'left', gap = 6, fill = '#000' } = {}) => {
    if (!str) return;
    for (const line of wrap(str, size, weight, W - 2 * M)) {
      const s = shape(line, size, weight);
      const x = align === 'center' ? (W - s.width) / 2 : M;
      out.push(outline(s, x, y + asc(size), fill));
      y += Math.round(size * 1.3);
    }
    y += gap;
  };
  const row = (label, value, size = 24, weight = 600) => {
    if (!value) return;
    out.push(outline(shape(label, 19, 400), M, y + 4 + asc(19), '#000'));
    const lines = wrap(value, size, weight, W - 2 * M - 150);
    lines.forEach((line, i) => {
      const s = shape(line, size, weight);
      out.push(outline(s, W - M - s.width, y + i * size * 1.3 + asc(size), '#000'));
    });
    y += Math.round(lines.length * size * 1.3 + 8);
  };
  const rule = () => { out.push(`<rect x="${M}" y="${y}" width="${W - 2 * M}" height="2" fill="#000"/>`); y += 12; };

  if (LOGO) { out.push(`<image href="${LOGO}" x="${(W - 110) / 2}" y="${y}" width="110" height="110" preserveAspectRatio="xMidYMid meet"/>`); y += 116; }
  text(temple.nameMr, 30, { weight: 700, align: 'center', gap: 0 });
  text(temple.name, 21, { align: 'center', gap: 2 });
  text(b.status === 'voided' ? '*** VOIDED ***' : 'ABHISHEK / PUJA RECEIPT', 22, { weight: 700, align: 'center', gap: 4 });
  rule();
  row('Receipt', b.receiptNo, 26, 700);
  row('Booked', fmtPaid(b.paidAt), 20, 400);
  rule();
  text(b.sevaName, 32, { weight: 700, align: 'center' });
  if (b.dateKey) row('Puja date', fmtDate(b.dateKey), 26, 700);
  if (b.batchLabel) row(b.schedule === 'batch' ? 'Batch' : 'Time', b.batchLabel, 24, 700);

  // Hall and serial in big black boxes — what the devotee and the hall volunteer look for
  const boxes = [b.hall && ['HALL', b.hall], b.serialNo && ['SERIAL', String(b.serialNo)]].filter(Boolean);
  if (boxes.length) {
    const gap = 10; const bw = (W - 2 * M - gap * (boxes.length - 1)) / boxes.length; const bh = 96;
    boxes.forEach(([label, value], i) => {
      const x = M + i * (bw + gap);
      out.push(`<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="#000"/>`);
      const l = shape(label, 18, 700);
      out.push(outline(l, x + (bw - l.width) / 2, y + 8 + asc(18), '#fff'));
      let size = 52;
      let v = shape(value, size, 700);
      while (v.width > bw - 16 && size > 24) { size -= 4; v = shape(value, size, 700); }
      out.push(outline(v, x + (bw - v.width) / 2, y + 30 + (52 - size) / 2 + asc(size), '#fff'));
    });
    y += bh + 12;
  }
  // The hall's name under the boxes, so the devotee knows where H1 is
  if (hall.name) text(`${hall.name} (${b.hall})`, 24, { weight: 700, align: 'center', gap: 0 });
  if (hall.nameMr && hall.nameMr !== hall.name) text(hall.nameMr, 24, { weight: 700, align: 'center', gap: 0 });
  if (hall.name || hall.nameMr) y += 8;
  rule();

  const d = b.devotee || {};
  text(d.name, 28, { weight: 700, gap: 2 });
  text(masked(d.phone), 22, { gap: 2 });
  if (d.gotra) text(`Gotra: ${d.gotra}`, 22, { gap: 2 });
  if (d.familyNames?.length) text(`Family: ${d.familyNames.join(', ')}`, 21, { gap: 2 });
  if (b.peopleCount > 1) text(`People: ${b.peopleCount}`, 22, { gap: 2 });
  if (b.schedule === 'none' && address(d)) text(`Post to: ${address(d)}`, 20, { gap: 2 });
  rule();

  out.push(outline(shape(MODE[b.paymentMode] || b.paymentMode || '', 24, 400), M, y + 10 + asc(24), '#000'));
  const amt = shape(`₹${Math.round(b.amount || 0).toLocaleString('en-IN')}`, 40, 700);
  out.push(outline(amt, W - M - amt.width, y + asc(40), '#000'));
  y += 58;

  if (b.status === 'voided') {
    y += 6;
    text('This booking was cancelled — not valid for entry', 22, { weight: 700, align: 'center', fill: '#b91c1c' });
  } else if (receiptUrl) {
    const qr = await QRCode.toDataURL(receiptUrl, { width: 380, margin: 0, errorCorrectionLevel: 'M' });
    out.push(`<image href="${qr}" x="${(W - 220) / 2}" y="${y}" width="220" height="220"/>`);
    y += 226;
    text(b.dateKey ? 'Show this QR code at the hall entrance' : 'Scan to see this receipt on your phone', 19, { weight: 600, align: 'center' });
  }
  text(footer, 18, { align: 'center' });
  if (bookedBy) text(`Booked by ${bookedBy}`, 17, { align: 'center' });

  const H = Math.ceil(y + M);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<title>${esc(b.receiptNo || 'Receipt')}</title><rect width="${W}" height="${H}" fill="#fff"/>${out.join('')}</svg>`;
  return new Resvg(svg, { fitTo: { mode: 'width', value: Math.round(W * SCALE) }, font: { loadSystemFonts: false } }).render().asPng();
}
