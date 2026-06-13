import QRCode from 'qrcode/lib/browser.js';

const fmt = (d) => d
  ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : null;

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const CONDITION_COLORS = { good: '#16a34a', fair: '#d97706', damaged: '#dc2626', lost: '#6b7280' };

function openPrintWindow(title) {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site and try again.');
    return null;
  }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title></head>
    <body style="font-family:Arial,sans-serif;padding:20px;color:#666;font-size:14px;">
      Generating labels…
    </body></html>`);
  return win;
}

// ── Per-unit sticker labels (3 per row, ~21 per A4) ──────────────────────────
export async function printUnitLabels(asset, units) {
  // Open window synchronously — must happen before any await or browser blocks it
  const win = openPrintWindow(`Asset Labels — ${asset.name}`);
  if (!win) return;

  const qrMap = {};
  for (const u of units) {
    try {
      qrMap[u._id] = await QRCode.toDataURL(u.unitCode, {
        width: 100, margin: 1, errorCorrectionLevel: 'M',
        color: { dark: '#1f2937', light: '#ffffff' },
      });
    } catch { qrMap[u._id] = ''; }
  }

  const stickersHtml = units.map((u) => {
    const condColor = CONDITION_COLORS[u.condition] || '#6b7280';
    const unitNum   = String(u.unitNumber).padStart(2, '0');
    return `
      <div class="sticker">
        <div class="s-inner">
          <div class="s-left">
            <div class="s-temple">Mangal Grah Mandir</div>
            <div class="s-name">${esc(asset.name)}</div>
            <div class="s-num">#${unitNum}</div>
            <div class="s-code">${esc(u.unitCode)}</div>
            <div class="s-meta">${esc(asset.category)}</div>
            <div class="s-cond" style="color:${condColor}">${u.condition.toUpperCase()}</div>
          </div>
          <div class="s-right">
            ${qrMap[u._id] ? `<img src="${qrMap[u._id]}" class="s-qr" alt="" />` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Asset Labels — ${esc(asset.name)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: #fff; }
    @media print {
      @page { size: A4 portrait; margin: 6mm; }
      .print-btn { display: none !important; }
    }
    .print-btn {
      position: fixed; top: 14px; right: 14px;
      background: #ea580c; color: #fff; border: none;
      padding: 9px 20px; border-radius: 6px; font-size: 13px;
      cursor: pointer; font-weight: bold; z-index: 999;
    }
    .print-btn:hover { background: #c2410c; }
    .page {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4mm;
      padding: 6mm;
    }
    .sticker {
      border: 1.2px dashed #ccc;
      border-radius: 3px;
      height: 38mm;
      padding: 2.5mm;
      display: flex;
      align-items: center;
      page-break-inside: avoid;
    }
    .s-inner { display: flex; align-items: center; gap: 2mm; width: 100%; }
    .s-left  { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1.5px; }
    .s-right { width: 22mm; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
    .s-qr    { width: 21mm; height: 21mm; }
    .s-temple { font-size: 5pt; color: #ea580c; font-weight: bold; text-transform: uppercase; letter-spacing: 0.2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .s-name   { font-size: 9pt; font-weight: 700; color: #111; line-height: 1.2; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; }
    .s-num    { font-size: 15pt; font-weight: 900; color: #111; line-height: 1.1; letter-spacing: -0.3px; }
    .s-code   { font-size: 11pt; font-family: 'Courier New', monospace; font-weight: bold; color: #ea580c; letter-spacing: 0.2px; }
    .s-meta   { font-size: 6pt; color: #777; }
    .s-cond   { font-size: 5.5pt; font-weight: bold; letter-spacing: 0.3px; }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">&#x1F5A8; Print (${units.length} label${units.length !== 1 ? 's' : ''})</button>
  <div class="page">${stickersHtml}</div>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
}

// ── Asset-level summary labels (2-col A4) ─────────────────────────────────────
export async function printAssetLabels(assets) {
  // Open window synchronously — must happen before any await or browser blocks it
  const win = openPrintWindow('Asset Labels — Mangal Grah Mandir');
  if (!win) return;

  const qrMap = {};
  for (const asset of assets) {
    const url = `${window.location.origin}/assets/${asset._id}/history`;
    try {
      qrMap[asset._id] = await QRCode.toDataURL(url, {
        width: 120, margin: 1, errorCorrectionLevel: 'M',
        color: { dark: '#1f2937', light: '#ffffff' },
      });
    } catch { qrMap[asset._id] = ''; }
  }

  const labelsHtml = assets.map((a) => {
    const dateStr = fmt(a.purchaseDate);
    return `
      <div class="label">
        <div class="label-inner">
          <div class="label-left">
            <div class="temple">Mangal Grah Mandir, Amalner</div>
            <div class="asset-name">${esc(a.name)}</div>
            <div class="asset-code">${esc(a.assetCode || '—')}</div>
            <div class="asset-meta">${esc(a.category)} &nbsp;|&nbsp; Qty: <strong>${a.totalQuantity}</strong></div>
            ${dateStr ? `<div class="asset-date">Purchased: ${dateStr}</div>` : ''}
          </div>
          <div class="label-right">
            ${qrMap[a._id] ? `<img src="${qrMap[a._id]}" class="qr" alt="QR" />` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Asset Labels — Mangal Grah Mandir</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: #fff; }
    @media print { @page { size: A4 portrait; margin: 8mm; } .print-btn { display: none !important; } }
    .print-btn { position: fixed; top: 16px; right: 16px; background: #ea580c; color: #fff; border: none; padding: 10px 22px; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: bold; z-index: 999; }
    .print-btn:hover { background: #c2410c; }
    .page { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; padding: 8mm; }
    .label { border: 1.5px dashed #ccc; border-radius: 4px; height: 50mm; padding: 3mm 3.5mm; display: flex; align-items: center; page-break-inside: avoid; }
    .label-inner { display: flex; align-items: center; gap: 3mm; width: 100%; }
    .label-left  { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2.5px; }
    .label-right { width: 28mm; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
    .qr { width: 26mm; height: 26mm; }
    .temple     { font-size: 5.5pt; color: #ea580c; font-weight: bold; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .asset-name { font-size: 13pt; font-weight: 900; color: #111; line-height: 1.2; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .asset-code { font-size: 9pt; font-family: 'Courier New', monospace; font-weight: bold; color: #ea580c; letter-spacing: 0.5px; }
    .asset-meta { font-size: 7pt; color: #555; }
    .asset-date { font-size: 7pt; color: #888; }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">&#x1F5A8; Print Labels</button>
  <div class="page">${labelsHtml}</div>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
}
