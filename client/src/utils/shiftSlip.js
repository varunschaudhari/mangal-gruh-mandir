// Cash handover slip for a closed booking-counter shift: drawn on a canvas like the booking slip
// (so Marathi names print), sent raw to the thermal printer, or opened in the print dialog / as a PDF.
import { printHtml } from './printHtml.js';
import { canvasToEscPos, printRawBytes } from './thermalPrint.js';
import { printBluetooth, savedBluetoothPrinter } from './bluetoothPrinter.js';
import { isNative, isElectron } from './platform.js';
import { temple } from './temple.js';
import { denominationLines, differenceTone } from '../components/booking/shift/shiftUtils.js';

const FONT = '"Nirmala UI", "Mangal", "Noto Sans Devanagari", "Noto Sans", Arial, sans-serif';

const rupees = (n) => `Rs. ${Math.round(Math.abs(Number(n) || 0)).toLocaleString('en-IN')}`;
const fmtAt = (d) => (d
  ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—');

const loadImage = (src) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

/** Draws the handover slip on a canvas the width of the paper (80 mm = 576 dots, 58 mm = 384). */
export async function drawShiftSlip(shift, settings = {}) {
  const W = settings.paperWidth === 58 ? 384 : 576;
  const s = W / 576;
  const M = Math.round(14 * s);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = 3000;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, canvas.height);
  ctx.fillStyle = '#000'; ctx.textBaseline = 'top';
  let y = M;

  const font = (size, weight = 400) => { ctx.font = `${weight} ${Math.round(size * s)}px ${FONT}`; };
  const wrap = (str, maxW) => {
    const words = String(str).split(/\s+/); const lines = []; let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  };
  const text = (str, size, { weight = 400, align = 'left', gap = 6 } = {}) => {
    if (!str) return;
    font(size, weight);
    for (const line of wrap(str, W - 2 * M)) {
      const x = align === 'center' ? (W - ctx.measureText(line).width) / 2 : M;
      ctx.fillText(line, x, y);
      y += Math.round(size * s * 1.25);
    }
    y += Math.round(gap * s);
  };
  // Label on the left, value on the right (wrapped when long).
  const row = (label, value, size = 22, weight = 600) => {
    if (value === undefined || value === null || value === '') return;
    font(19); ctx.fillText(label, M, y + Math.round(3 * s));
    font(size, weight);
    const lines = wrap(String(value), W - 2 * M - 190 * s);
    lines.forEach((line, i) => ctx.fillText(line, W - M - ctx.measureText(line).width, y + i * size * s * 1.25));
    y += Math.round(lines.length * size * s * 1.25 + 7 * s);
  };
  const rule = () => { ctx.fillRect(M, y, W - 2 * M, Math.max(1, Math.round(2 * s))); y += Math.round(12 * s); };

  const t = shift.totals || {};
  const logo = await loadImage('/logo.png');
  if (logo) { const h = Math.round(80 * s); const w = (logo.width / logo.height) * h; ctx.drawImage(logo, (W - w) / 2, y, w, h); y += h + Math.round(6 * s); }
  text(temple().nameMr, 28, { weight: 700, align: 'center', gap: 0 });
  text(settings.templeName || temple().name, 20, { align: 'center', gap: 2 });
  text('CASH HANDOVER', 26, { weight: 800, align: 'center', gap: 0 });
  text('Abhishek / Puja counter', 18, { align: 'center', gap: 4 });
  rule();
  row('Counter', shift.user?.name || '—', 24, 700);
  row('From', fmtAt(shift.startedAt), 20, 400);
  row('To', fmtAt(shift.closedAt), 20, 400);
  rule();
  row('Bookings', String(t.count || 0), 24, 700);
  row('Amount', rupees(t.amount), 24, 700);
  row('Cash', rupees(t.cash));
  row('UPI', rupees(t.upi));
  row('Card', rupees(t.card));
  if (t.voidedCount) row('Voided', `${t.voidedCount} (not counted)`, 20, 400);
  rule();
  if (shift.openingFloat) row('Opening float', rupees(shift.openingFloat));
  row('Expected cash', rupees(shift.expectedCash), 26, 800);

  const lines = denominationLines(shift.denominations);
  if (lines.length) {
    y += Math.round(2 * s);
    for (const l of lines) {
      font(20);
      const left = `${l.note} x ${l.count}`;
      ctx.fillText(left, M + Math.round(20 * s), y);
      const right = rupees(l.total);
      ctx.fillText(right, W - M - ctx.measureText(right).width, y);
      y += Math.round(26 * s);
    }
    y += Math.round(4 * s);
  }
  row('Counted cash', rupees(shift.countedCash), 30, 800);

  // Difference in a box: black for SHORT / EXCESS so it can't be missed, outlined when it matches.
  const tone = differenceTone(shift.difference);
  const label = tone === 'match' ? 'CASH MATCHES' : `${tone === 'short' ? 'SHORT' : 'EXCESS'}  ${rupees(shift.difference)}`;
  const bh = Math.round(64 * s);
  if (tone === 'match') {
    ctx.lineWidth = Math.max(2, Math.round(3 * s)); ctx.strokeRect(M, y, W - 2 * M, bh);
  } else {
    ctx.fillRect(M, y, W - 2 * M, bh); ctx.fillStyle = '#fff';
  }
  font(32, 800); ctx.fillText(label, (W - ctx.measureText(label).width) / 2, y + Math.round(14 * s));
  ctx.fillStyle = '#000'; y += bh + Math.round(12 * s);

  if (shift.notes) text(`Note: ${shift.notes}`, 20, { gap: 4 });
  if (shift.voidedAfterClose?.count) {
    text(`! ${shift.voidedAfterClose.count} voided after close (${rupees(shift.voidedAfterClose.amount)}) - counted in the cash above`, 19, { weight: 700, gap: 4 });
  }
  if (shift.status === 'verified') {
    text(`Verified by ${shift.verifiedBy?.name || '—'} · ${fmtAt(shift.verifiedAt)}`, 19, { gap: 2 });
    if (shift.verifyNote) text(shift.verifyNote, 18, { gap: 2 });
  }

  // Signatures
  y += Math.round(56 * s);
  const gap = Math.round(24 * s); const sw = (W - 2 * M - gap) / 2;
  font(18);
  [['Counter', shift.user?.name], ['Received by', '']].forEach(([title, name], i) => {
    const x = M + i * (sw + gap);
    ctx.fillRect(x, y, sw, Math.max(1, Math.round(2 * s)));
    ctx.fillText(title, x + (sw - ctx.measureText(title).width) / 2, y + Math.round(6 * s));
    if (name) {
      const n = name.length > 22 ? `${name.slice(0, 21)}…` : name;
      ctx.fillText(n, x + (sw - ctx.measureText(n).width) / 2, y + Math.round(30 * s));
    }
  });
  y += Math.round(58 * s);
  text(`Printed ${fmtAt(new Date())}`, 16, { align: 'center' });

  const out = document.createElement('canvas');
  out.width = W; out.height = y + M;
  out.getContext('2d').drawImage(canvas, 0, 0);
  return out;
}

/**
 * Prints the handover slip: straight to the thermal printer from the desktop app or through
 * QZ Tray, to the phone app's Bluetooth printer; otherwise opens it in the print dialog (or the
 * share sheet in the phone app).
 * Returns 'thermal' or 'dialog'.
 */
export async function printShiftSlip(shift, settings = {}) {
  const canvas = await drawShiftSlip(shift, settings);
  if (savedBluetoothPrinter()) {
    await printBluetooth(canvasToEscPos(canvas));
    return 'thermal';
  }
  if (!isNative && (isElectron || settings.printerName)) {
    await printRawBytes(canvasToEscPos(canvas), settings.printerName);
    return 'thermal';
  }
  const day = shift.closedAt ? new Date(shift.closedAt).toISOString().slice(0, 16).replace(/[T:]/g, '-') : 'shift';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cash handover</title>
<style>@page{size:80mm auto;margin:0}body{margin:0}img{width:72mm;display:block;margin:0 auto}</style></head>
<body><img src="${canvas.toDataURL('image/png')}" alt=""><script>window.onload=()=>window.print()</script></body></html>`;
  await printHtml(html, { filename: `Handover-${day}.pdf`, width: 320, features: 'width=420,height=800' });
  return 'dialog';
}
