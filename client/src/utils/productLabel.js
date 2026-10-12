import QRCode from 'qrcode/lib/browser.js';
import { printHtml } from './printHtml.js';
import { isNative } from './platform.js';
import { templeHtml } from './temple.js';

// Shelf / bin labels for products: name, code and a QR of the product code. Scanning one
// in the app picks the product in stock forms, or opens it from the app bar scanner.
// Same sticker sheet as asset units: 3 per row, ~21 per A4.

const esc = (str) => String(str ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function printProductLabels(products, { title = 'Product Labels' } = {}) {
  // Browsers block pop-ups opened after an await, so open the window first.
  const win = isNative ? null : window.open('', '_blank');
  if (!win && !isNative) return;
  if (win) win.document.write('<p style="font-family:Arial;color:#666;padding:20px">Generating labels…</p>');

  const qr = await Promise.all(products.map((p) => QRCode.toDataURL(p.code, {
    width: 100, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1f2937', light: '#ffffff' },
  }).catch(() => '')));

  const stickers = products.map((p, i) => `
    <div class="sticker">
      <div class="s-left">
        <div class="s-temple">${templeHtml()}</div>
        <div class="s-name">${esc(p.name)}</div>
        <div class="s-code">${esc(p.code)}</div>
        <div class="s-meta">${esc([p.category?.name, p.unit?.symbol].filter(Boolean).join(' · '))}</div>
      </div>
      ${qr[i] ? `<img src="${qr[i]}" class="s-qr" alt="" />` : ''}
    </div>`).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(title)} — ${templeHtml()}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: #fff; }
    @media print { @page { size: A4 portrait; margin: 6mm; } .print-btn { display: none !important; } }
    .print-btn { position: fixed; top: 14px; right: 14px; background: #ea580c; color: #fff; border: none;
      padding: 9px 20px; border-radius: 6px; font-size: 13px; cursor: pointer; font-weight: bold; }
    .page { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; padding: 6mm; }
    .sticker { border: 1.2px dashed #ccc; border-radius: 3px; height: 38mm; padding: 2.5mm;
      display: flex; align-items: center; gap: 2mm; page-break-inside: avoid; }
    .s-left { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .s-temple { font-size: 5pt; color: #ea580c; font-weight: bold; text-transform: uppercase; letter-spacing: 0.3px; }
    .s-name { font-size: 10pt; font-weight: 900; color: #111; line-height: 1.15; overflow: hidden;
      display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
    .s-code { font-size: 10pt; font-family: 'Courier New', monospace; font-weight: bold; color: #ea580c; }
    .s-meta { font-size: 6.5pt; color: #777; }
    .s-qr { width: 22mm; height: 22mm; flex-shrink: 0; }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">&#x1F5A8; Print (${products.length} label${products.length !== 1 ? 's' : ''})</button>
  <div class="page">${stickers}</div>
</body>
</html>`;

  return printHtml(html, { win, filename: `${title.replace(/\s+/g, '-')}.pdf` });
}
