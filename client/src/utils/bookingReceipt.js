// Booking receipts: the counter's thermal slip, the A4 receipt, and the WhatsApp link.
// Text is drawn by the browser (canvas / HTML), so Marathi names print correctly.
import QRCode from 'qrcode/lib/browser.js';
import { printHtml } from './printHtml.js';
import { canvasToEscPos, printRawBytes } from './thermalPrint.js';
import { isNative, isElectron } from './platform.js';

const FONT = '"Nirmala UI", "Mangal", "Noto Sans Devanagari", "Noto Sans", Arial, sans-serif';
const MODE = { cash: 'Cash', upi: 'UPI', card: 'Card', online: 'Online' };
const TEMPLE_MR = 'श्री मंगळग्रह मंदिर, अमळनेर';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const fmtPujaDate = (b) => (b.dateKey
  ? new Date(`${b.dateKey}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  : '');
const fmtPaid = (d) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const rupees = (n) => `Rs. ${Math.round(n || 0).toLocaleString('en-IN')}`;

// Indian numbering: 6300 → "Six Thousand Three Hundred"
export function amountInWords(amount) {
  const n = Math.floor(amount || 0);
  if (!n) return 'Zero';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
    'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x) => (x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? ` ${ones[x % 10]}` : ''));
  const three = (x) => (x < 100 ? two(x) : `${ones[Math.floor(x / 100)]} Hundred${x % 100 ? ` ${two(x % 100)}` : ''}`);
  const parts = [];
  if (n >= 1e7) parts.push(`${two(Math.floor(n / 1e7))} Crore`);
  if (n % 1e7 >= 1e5) parts.push(`${two(Math.floor((n % 1e7) / 1e5))} Lakh`);
  if (n % 1e5 >= 1e3) parts.push(`${two(Math.floor((n % 1e5) / 1e3))} Thousand`);
  if (n % 1e3) parts.push(three(n % 1e3));
  return parts.join(' ');
}

/** Pre-filled WhatsApp message to the devotee with the receipt link (works without the WhatsApp API). */
export function whatsappShareUrl(b) {
  const when = b.dateKey ? `${fmtPujaDate(b)}${b.batchLabel ? `, ${b.batchLabel}` : ''}${b.hall ? `, Hall ${b.hall}` : ''}` : 'on your behalf';
  const text = `Namaste ${b.devotee?.name || ''}, your ${b.sevaName} at Shri Mangal Grah Mandir, Amalner is booked for ${when}.`
    + `\nReceipt ${b.receiptNo}${b.serialNo ? ` · Serial ${b.serialNo}` : ''}\n${b.receiptUrl || ''}`;
  const phone = String(b.devotee?.phone || '').replace(/\D/g, '');
  return `https://wa.me/${phone.length === 10 ? `91${phone}` : phone}?text=${encodeURIComponent(text)}`;
}

// ── Thermal slip ──────────────────────────────────────────────────────────────

const loadImage = (src) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

/** Draws the counter slip on a canvas the width of the paper (80 mm = 576 dots, 58 mm = 384). */
export async function drawSlip(b, settings = {}) {
  const W = settings.paperWidth === 58 ? 384 : 576;
  const s = W / 576; // scale fonts for 58 mm paper
  const M = Math.round(14 * s);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = 3000;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, canvas.height);
  ctx.fillStyle = '#000'; ctx.textBaseline = 'top';
  let y = M;

  const font = (size, weight = 400) => { ctx.font = `${weight} ${Math.round(size * s)}px ${FONT}`; };
  const wrap = (text, maxW) => {
    const words = String(text).split(/\s+/); const lines = []; let line = '';
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
  const row = (label, value, size = 24, weight = 600) => {
    if (!value) return;
    font(19); ctx.fillText(label, M, y + Math.round(4 * s));
    font(size, weight);
    const lines = wrap(value, W - 2 * M - 150 * s);
    lines.forEach((line, i) => ctx.fillText(line, W - M - ctx.measureText(line).width, y + i * size * s * 1.25));
    y += Math.round(lines.length * size * s * 1.25 + 8 * s);
  };
  const rule = () => { ctx.fillRect(M, y, W - 2 * M, Math.max(1, Math.round(2 * s))); y += Math.round(12 * s); };

  const logo = await loadImage('/logo.png');
  if (logo) { const h = Math.round(110 * s); const w = (logo.width / logo.height) * h; ctx.drawImage(logo, (W - w) / 2, y, w, h); y += h + Math.round(6 * s); }
  text(TEMPLE_MR, 30, { weight: 700, align: 'center', gap: 0 });
  text(settings.templeName || 'Shri Mangal Grah Mandir, Amalner', 21, { align: 'center', gap: 2 });
  text(b.status === 'voided' ? '*** VOIDED ***' : 'ABHISHEK / PUJA RECEIPT', 22, { weight: 700, align: 'center', gap: 4 });
  rule();
  row('Receipt', b.receiptNo, 26, 700);
  row('Booked', fmtPaid(b.paidAt), 20, 400);
  rule();
  text(b.sevaName, 32, { weight: 700, align: 'center' });
  if (b.dateKey) row('Puja date', fmtPujaDate(b), 26, 700);
  if (b.batchLabel) row(b.schedule === 'batch' ? 'Batch' : 'Time', b.batchLabel, 24, 700);

  // Hall and serial in big black boxes — what the devotee and the hall volunteer look for
  const boxes = [b.hall && ['HALL', b.hall], b.serialNo && ['SERIAL', String(b.serialNo)]].filter(Boolean);
  if (boxes.length) {
    const gap = Math.round(10 * s); const bw = (W - 2 * M - gap * (boxes.length - 1)) / boxes.length; const bh = Math.round(96 * s);
    boxes.forEach(([label, value], i) => {
      const x = M + i * (bw + gap);
      ctx.fillStyle = '#000'; ctx.fillRect(x, y, bw, bh); ctx.fillStyle = '#fff';
      font(18, 700); ctx.fillText(label, x + (bw - ctx.measureText(label).width) / 2, y + 8 * s);
      font(52, 800); ctx.fillText(value, x + (bw - ctx.measureText(value).width) / 2, y + 32 * s);
    });
    ctx.fillStyle = '#000'; y += bh + Math.round(12 * s);
  }
  rule();
  text(b.devotee?.name, 28, { weight: 700, gap: 2 });
  text(b.devotee?.phone, 22, { gap: 2 });
  if (b.devotee?.gotra) text(`Gotra: ${b.devotee.gotra}`, 22, { gap: 2 });
  if (b.devotee?.familyNames?.length) text(`Family: ${b.devotee.familyNames.join(', ')}`, 21, { gap: 2 });
  if (b.peopleCount > 1) text(`People: ${b.peopleCount}`, 22, { gap: 2 });
  if (b.schedule === 'none' && b.devotee?.address) text(`Post to: ${b.devotee.address}`, 20, { gap: 2 });
  rule();
  font(24); ctx.fillText(MODE[b.paymentMode] || b.paymentMode, M, y + 10 * s);
  font(40, 800); const amt = rupees(b.amount); ctx.fillText(amt, W - M - ctx.measureText(amt).width, y);
  y += Math.round(54 * s);
  if (b.receiptUrl) {
    const qr = document.createElement('canvas');
    await QRCode.toCanvas(qr, b.receiptUrl, { width: Math.round(190 * s), margin: 0, errorCorrectionLevel: 'M' });
    ctx.drawImage(qr, (W - qr.width) / 2, y); y += qr.height + Math.round(6 * s);
    text('Scan to see this receipt on your phone', 18, { align: 'center' });
  }
  text(settings.receiptFooter, 18, { align: 'center' });
  if (b.createdBy?.name) text(`Booked by ${b.createdBy.name}`, 17, { align: 'center' });

  const out = document.createElement('canvas');
  out.width = W; out.height = y + M;
  out.getContext('2d').drawImage(canvas, 0, 0);
  return out;
}

/**
 * Prints the counter slip: straight to the thermal printer from the desktop app or through
 * QZ Tray; otherwise opens the slip in the print dialog (or the share sheet in the phone app).
 */
export async function printBookingSlip(b, settings = {}) {
  const canvas = await drawSlip(b, settings);
  if (!isNative && (isElectron || settings.printerName)) {
    await printRawBytes(canvasToEscPos(canvas), settings.printerName);
    return 'thermal';
  }
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(b.receiptNo)}</title>
<style>@page{size:80mm auto;margin:0}body{margin:0}img{width:72mm;display:block;margin:0 auto}</style></head>
<body><img src="${canvas.toDataURL('image/png')}" alt=""><script>window.onload=()=>window.print()<\/script></body></html>`;
  await printHtml(html, { filename: `Slip-${b.receiptNo.replace(/\//g, '-')}.pdf`, width: 320, features: 'width=420,height=800' });
  return 'dialog';
}

// ── A4 receipt ────────────────────────────────────────────────────────────────

/** Full-page receipt as an HTML document (also used by the public receipt page). */
export async function bookingReceiptHtml(b, settings = {}, { autoPrint = true } = {}) {
  const qr = b.receiptUrl ? await QRCode.toDataURL(b.receiptUrl, { width: 220, margin: 1 }) : '';
  const d = b.devotee || {};
  const rows = [
    ['Seva', esc(b.sevaName)],
    b.dateKey && ['Puja date', esc(fmtPujaDate(b))],
    b.batchLabel && [b.schedule === 'batch' ? 'Batch' : 'Time', esc(b.batchLabel)],
    b.hall && ['Hall', `<b>${esc(b.hall)}</b>`],
    b.serialNo && ['Serial no.', `<b>${esc(b.serialNo)}</b>`],
    ['Devotee', `<b>${esc(d.name)}</b>`],
    d.phone && ['Mobile', esc(d.phone)],
    d.address && [b.schedule === 'none' ? 'Postal address' : 'Address', esc(d.address)],
    d.gotra && ['Gotra', esc(d.gotra)],
    d.familyNames?.length && ['Family names', esc(d.familyNames.join(', '))],
    (d.rashi || d.nakshatra) && ['Rashi / Nakshatra', esc([d.rashi, d.nakshatra].filter(Boolean).join(' / '))],
    b.peopleCount > 1 && ['People', esc(b.peopleCount)],
    ['Payment', esc(`${MODE[b.paymentMode] || b.paymentMode}${b.paymentRef ? ` · Ref ${b.paymentRef}` : ''}`)],
  ].filter(Boolean);
  const temple = settings.templeName || 'Shri Mangal Grah Mandir, Amalner';

  return `<!DOCTYPE html><html lang="mr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Receipt ${esc(b.receiptNo)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: ${FONT}; color: #1f2937; margin: 0; padding: 24px; background: #fff; }
  .sheet { max-width: 720px; margin: 0 auto; border: 1px solid #fed7aa; border-radius: 10px; overflow: hidden; position: relative; }
  .head { background: #ea580c; color: #fff; padding: 16px 20px; display: flex; gap: 14px; align-items: center; }
  .head img { width: 64px; height: 64px; background: #fff; border-radius: 10px; padding: 4px; object-fit: contain; }
  .head h1 { font-size: 22px; margin: 0; } .head p { margin: 2px 0 0; font-size: 13px; opacity: .95; }
  .title { display: flex; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid #fde4cf; font-size: 14px; }
  .title b { font-size: 16px; }
  .body { display: flex; gap: 20px; padding: 16px 20px; }
  table { border-collapse: collapse; flex: 1; font-size: 14px; }
  td { padding: 6px 0; vertical-align: top; border-bottom: 1px dashed #f3f4f6; }
  td:first-child { color: #6b7280; width: 38%; padding-right: 12px; }
  .qr { text-align: center; font-size: 11px; color: #6b7280; width: 150px; }
  .qr img { width: 140px; height: 140px; }
  .amount { margin: 0 20px; padding: 12px 16px; background: #fff7ed; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
  .amount b { font-size: 22px; color: #c2410c; } .amount span { font-size: 12px; color: #6b7280; }
  .foot { padding: 14px 20px 20px; font-size: 12px; color: #6b7280; display: flex; justify-content: space-between; gap: 20px; align-items: flex-end; }
  .sign { text-align: center; min-width: 160px; } .sign div { border-top: 1px solid #9ca3af; margin-top: 36px; padding-top: 4px; }
  .void { position: absolute; top: 40%; left: 0; right: 0; text-align: center; font-size: 80px; font-weight: 800; color: rgba(220,38,38,.18); transform: rotate(-18deg); pointer-events: none; }
  @media (max-width: 560px) { body { padding: 8px; } .body { flex-direction: column; } .qr { width: auto; } td:first-child { width: 42%; } }
  @media print { body { padding: 0; } }
</style></head><body>
<div class="sheet">
  ${b.status === 'voided' ? '<div class="void">VOIDED</div>' : ''}
  <div class="head"><img src="${esc(settings.logoUrl || '/logo.png')}" alt="">
    <div><h1>${esc(TEMPLE_MR)}</h1><p>${esc(temple)}${settings.templeAddress ? ` · ${esc(settings.templeAddress)}` : ''}</p>${settings.templePhone ? `<p>${esc(settings.templePhone)}</p>` : ''}</div></div>
  <div class="title"><span>Abhishek / Puja Receipt<br><b>${esc(b.receiptNo)}</b></span><span style="text-align:right">Booked on<br><b>${esc(fmtPaid(b.paidAt))}</b></span></div>
  <div class="body"><table>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
    ${qr ? `<div class="qr"><img src="${qr}" alt=""><br>Scan to view this receipt</div>` : ''}</div>
  <div class="amount"><span>Amount received<br>Rupees ${esc(amountInWords(b.amount))} only</span><b>₹${esc(Math.round(b.amount).toLocaleString('en-IN'))}</b></div>
  <div class="foot"><span>${esc(settings.receiptFooter || '')}${b.createdBy?.name ? `<br>Booked by ${esc(b.createdBy.name)}` : ''}</span>
    <span class="sign"><div>For ${esc(temple)}</div></span></div>
</div>
${autoPrint ? '<script>window.onload = () => window.print()<\/script>' : ''}
</body></html>`;
}

/** A4 receipt: print dialog in the browser / desktop app, PDF to the share sheet in the phone app. */
export async function printBookingReceipt(b, settings = {}) {
  const logoUrl = `${window.location.origin}/logo.png`;
  const html = await bookingReceiptHtml(b, { ...settings, logoUrl: isNative ? '/logo.png' : logoUrl });
  await printHtml(html, { filename: `Receipt-${b.receiptNo.replace(/\//g, '-')}.pdf` });
}
