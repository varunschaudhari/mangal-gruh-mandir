import qz from 'qz-tray';

// ── Electron print path ───────────────────────────────────────────────────────
// When running inside the desktop app, bypass QZ Tray entirely and use the
// Electron IPC bridge (window.electronAPI) to send raw bytes to the printer.

async function printViaElectron(coupon, settings) {
  // Printer name comes from local electron-store (configured via ⚙ settings panel)
  const electronSettings = await window.electronAPI.getSettings();
  const printerName = electronSettings?.printerName || settings?.mahaprasadPrinterName;
  if (!printerName) {
    throw new Error('Printer not set. Open ⚙ Settings (bottom-right gear) and choose a printer.');
  }
  const [logoBytes, receiptBytes] = await Promise.all([
    logoToEscPosBytes(),
    Promise.resolve(buildReceiptBytes(coupon, settings)),
  ]);
  const allBytes = [...logoBytes, ...receiptBytes];
  const hex = allBytes.map(b => b.toString(16).padStart(2, '0')).join('');
  await window.electronAPI.printRaw(hex, printerName);
}

// ── Connection management ─────────────────────────────────────────────────────

let connectPromise = null;

// When QZ Tray isn't running, qz's connect can stay pending for a long time — give up after
// 10 s with a clear message so a counter never freezes waiting for the printer.
const QZ_TIMEOUT_MS = 10000;

async function ensureConnected() {
  if (qz.websocket.isActive()) return;
  if (connectPromise) return connectPromise;
  let timer;
  connectPromise = Promise.race([
    qz.websocket.connect({ retries: 1, delay: 1 }),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('QZ Tray is not running on this computer — start QZ Tray and try again.')), QZ_TIMEOUT_MS);
    }),
  ]).finally(() => { clearTimeout(timer); connectPromise = null; });
  return connectPromise;
}

export function isConnected() {
  try { return qz.websocket.isActive(); } catch { return false; }
}

export async function connectToQzTray() {
  return ensureConnected();
}

export async function getPrinters() {
  await ensureConnected();
  return qz.printers.find();
}

// ── ESC/POS byte helpers ──────────────────────────────────────────────────────

const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

const init     = ()    => [ESC, 0x40];
const align    = (n)   => [ESC, 0x61, n];   // 0=L 1=C 2=R
const bold     = (on)  => [ESC, 0x45, on ? 1 : 0];
const charSize = (n)   => [GS,  0x21, n];   // 0x00=1x  0x11=2x2  0x01=2xH  0x10=2xW
const feedN        = (n) => [ESC, 0x64, n];
const partCut      = ()  => [GS,  0x56, 0x41, 4];
const cashDrawerKick = () => [ESC, 0x70, 0x00, 0x19, 0xFA]; // ESC p pin2 on=50ms off=500ms

function enc(str) {
  return [...new TextEncoder().encode(str.replace(/₹/g, 'Rs.'))];
}
function line(str) { return [...enc(str), LF]; }
function nl()      { return [LF]; }
function dashes(n = 32) { return [...enc('-'.repeat(n)), LF]; }

// ESC/POS native QR code — GS ( k, model 2
function qrEscPos(data, moduleSize = 7) {
  const bytes = new TextEncoder().encode(data);
  const len3  = bytes.length + 3;
  const pL    = len3 & 0xFF;
  const pH    = (len3 >> 8) & 0xFF;
  return [
    GS, 0x28, 0x6B, 4, 0, 49, 65, 50, 0,
    GS, 0x28, 0x6B, 3, 0, 49, 67, moduleSize,
    GS, 0x28, 0x6B, 3, 0, 49, 69, 49,
    GS, 0x28, 0x6B, pL, pH, 49, 80, 48, ...bytes,
    GS, 0x28, 0x6B, 3, 0, 49, 81, 48,
  ];
}

// ── Logo → ESC/POS raster (GS v 0) ───────────────────────────────────────────
// Loads /logo.png, scales to maxWidth dots, converts to 1-bit raster, and
// returns the GS v 0 byte sequence. Returns [] if the logo can't be loaded.

async function logoToEscPosBytes(maxWidth = 140) {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload  = resolve;
      img.onerror = reject;
      img.src = '/logo.png?' + Date.now();
    });

    const scale      = Math.min(1, maxWidth / img.naturalWidth);
    const imgW       = Math.round(img.naturalWidth  * scale);
    const imgH       = Math.round(img.naturalHeight * scale);
    // ESC/POS requires width to be a multiple of 8
    const widthBytes = Math.ceil(imgW / 8);
    const widthDots  = widthBytes * 8;

    const canvas = document.createElement('canvas');
    canvas.width  = widthDots;
    canvas.height = imgH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, imgW, imgH);

    const { data: px } = ctx.getImageData(0, 0, widthDots, imgH);

    // Build raster: dark pixel (gray < 128) → bit 1, light → 0
    const raster = [];
    for (let row = 0; row < imgH; row++) {
      for (let bIdx = 0; bIdx < widthBytes; bIdx++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const col      = bIdx * 8 + bit;
          const pxOffset = (row * widthDots + col) * 4;
          const gray     = 0.299 * px[pxOffset] + 0.587 * px[pxOffset + 1] + 0.114 * px[pxOffset + 2];
          if (gray < 128) byte |= (0x80 >> bit);
        }
        raster.push(byte);
      }
    }

    const xL = widthBytes & 0xFF;
    const xH = (widthBytes >> 8) & 0xFF;
    const yL = imgH & 0xFF;
    const yH = (imgH >> 8) & 0xFF;

    return [
      ...align(1),                               // center the image
      GS, 0x76, 0x30, 0x00, xL, xH, yL, yH,    // GS v 0 — raster image
      ...raster,
      LF,                                         // line feed after logo
    ];
  } catch {
    return [];
  }
}

// ── Receipt layout ────────────────────────────────────────────────────────────

function buildReceiptBytes(coupon, settings) {
  const isFree    = coupon.type === 'free';
  const isGroup   = coupon.isGroup && (coupon.groupSize || 1) > 1;
  const groupSize = coupon.groupSize || 1;
  const date      = new Date(coupon.date);
  // Date with weekday — matches PDF
  const dateStr = date.toLocaleDateString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });

  // Type badge — matches PDF badge label exactly
  const badgeLabel = isGroup
    ? (isFree ? `GROUP  ${groupSize} PERSONS` : `GROUP  ${groupSize}x  Rs.${coupon.amount}`)
    : (isFree ? 'FREE SEVA' : `Rs.${coupon.amount}  PAID`);

  const servingText = isGroup ? `Valid for ${groupSize} servings` : 'Valid for one serving';

  return [
    ...init(),
    ...align(1),

    // ── HEADER ──────────────────────────────────────────────────────────────
    ...bold(0), ...charSize(0x00),
    ...line('Mahaprasad Seva Coupon'),
    ...bold(1),
    ...line(`[ ${badgeLabel} ]`),
    ...bold(0),
    ...(isGroup ? line(`GROUP  \xB7  ${groupSize} PERSONS`) : []),

    ...dashes(),

    // ── COUPON NUMBER ────────────────────────────────────────────────────────
    ...bold(1), ...charSize(0x01),
    ...line(coupon.couponNumber),
    ...bold(0), ...charSize(0x00),

    ...dashes(),

    // ── DATE + OCCASION + QR (merged — one less dash line) ──────────────────
    ...line(dateStr),
    ...(isFree && coupon.occasion ? line(coupon.occasion) : []),
    ...nl(),
    ...qrEscPos(coupon.couponNumber, 5),
    ...line('- SCAN TO VERIFY -'),

    ...dashes(),

    // ── FOOTER ───────────────────────────────────────────────────────────────
    ...bold(1), ...line('Present at Prasad counter'), ...bold(0),
    ...bold(1), ...line(servingText), ...bold(0),
    ...line('Non-transferable'),

    // Cut + cash drawer kick for paid coupons
    ...feedN(0),
    ...partCut(),
    ...(coupon.type === 'paid' ? cashDrawerKick() : []),
  ];
}

// ── Test page ─────────────────────────────────────────────────────────────────

function buildTestPageBytes(printerName) {
  const now = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  return [
    ...init(),
    ...align(1),
    ...bold(1), ...charSize(0x11), ...line('TEST PAGE'), ...bold(0), ...charSize(0x00),
    ...dashes(),
    ...align(0),
    ...line(`Printer : ${printerName || 'Unknown'}`),
    ...line(`Time    : ${now}`),
    ...dashes(),
    ...align(1),
    ...line('Normal  ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123'),
    ...bold(1), ...line('Bold    ABCDEFGHIJKLMNOPQRSTUVWXYZ'), ...bold(0),
    ...charSize(0x01), ...line('Double Height'), ...charSize(0x00),
    ...charSize(0x10), ...line('Double Width'), ...charSize(0x00),
    ...dashes(),
    ...bold(1), ...line('Mangal Grah Mandir'), ...bold(0),
    ...line('Printer is working correctly'),
    ...feedN(2),
    ...partCut(),
  ];
}

export async function printTestPage(printerName) {
  const bytes = buildTestPageBytes(printerName);
  const hex   = bytes.map(b => b.toString(16).padStart(2, '0')).join('');
  if (window.electronAPI?.isElectron) {
    if (!printerName) throw new Error('Select a printer in Settings first.');
    await window.electronAPI.printRaw(hex, printerName);
    return;
  }
  if (!printerName) throw new Error('Printer name not set.');
  await ensureConnected();
  const config = qz.configs.create(printerName);
  await qz.print(config, [{ type: 'raw', format: 'hex', data: hex }]);
}

// ── Shift summary slip ────────────────────────────────────────────────────────

function buildShiftSummaryBytes({ dateStr, staffName, count, cash, upi }) {
  const total = cash + upi;
  const now   = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const pad   = 16;
  const r     = (label, value) => {
    const l = label.length > pad ? label.slice(0, pad) : label.padEnd(pad);
    return line(`${l}: ${value}`);
  };

  return [
    ...init(), ...align(1),
    ...bold(1), ...charSize(0x01), ...line('SHIFT SUMMARY'), ...bold(0), ...charSize(0x00),
    ...dashes(),
    ...align(0),
    ...r('Date',    dateStr),
    ...r('Staff',   staffName),
    ...r('Printed', now),
    ...dashes(),
    ...r('Coupons', String(count)),
    ...r('Cash',    `Rs.${cash.toLocaleString('en-IN')}`),
    ...r('UPI',     `Rs.${upi.toLocaleString('en-IN')}`),
    ...dashes(),
    ...bold(1), ...r('TOTAL', `Rs.${total.toLocaleString('en-IN')}`), ...bold(0),
    ...dashes(),
    ...align(1),
    ...line('Mangal Grah Mandir'),
    ...nl(),
    ...line('Supervisor: ___________________'),
    ...feedN(3),
    ...partCut(),
  ];
}

export async function printShiftSummary(data, printerName) {
  const bytes = buildShiftSummaryBytes(data);
  const hex   = bytes.map(b => b.toString(16).padStart(2, '0')).join('');
  if (window.electronAPI?.isElectron) {
    if (!printerName) throw new Error('No printer configured. Open ⚙ Settings to set one.');
    await window.electronAPI.printRaw(hex, printerName);
    return;
  }
  if (!printerName) throw new Error('Printer name not set.');
  await ensureConnected();
  const config = qz.configs.create(printerName);
  await qz.print(config, [{ type: 'raw', format: 'hex', data: hex }]);
}

// ── Public print function ─────────────────────────────────────────────────────

export async function printThermalCoupon(coupon, settings) {
  // Electron: use IPC bridge directly — no QZ Tray needed
  if (window.electronAPI?.isElectron) {
    return printViaElectron(coupon, settings);
  }

  // Web: QZ Tray path
  const printerName = settings?.mahaprasadPrinterName;
  if (!printerName) {
    throw new Error('Thermal printer not set. Go to Settings → Mahaprasad and enter the printer name.');
  }

  await ensureConnected();
  const config = qz.configs.create(printerName);

  const [logoBytes, receiptBytes] = await Promise.all([
    logoToEscPosBytes(),
    Promise.resolve(buildReceiptBytes(coupon, settings)),
  ]);

  const allBytes = [...logoBytes, ...receiptBytes];
  const hex = allBytes.map(b => b.toString(16).padStart(2, '0')).join('');

  await qz.print(config, [{
    type:   'raw',
    format: 'hex',
    data:   hex,
  }]);
}

// ── Images (any script, including Marathi) ────────────────────────────────────
// Thermal printers have no Devanagari font, so text that may be Marathi is drawn on a
// canvas in the browser and sent as a 1-bit raster image, in bands of 200 rows (some
// printers drop very tall single images).

export function canvasToEscPos(canvas, { cut = true } = {}) {
  const widthBytes = Math.ceil(canvas.width / 8);
  const { data: px } = canvas.getContext('2d').getImageData(0, 0, widthBytes * 8, canvas.height);
  const bytes = [...init(), ...align(1)];
  const BAND = 200;
  for (let top = 0; top < canvas.height; top += BAND) {
    const rows = Math.min(BAND, canvas.height - top);
    bytes.push(GS, 0x76, 0x30, 0x00, widthBytes & 0xFF, (widthBytes >> 8) & 0xFF, rows & 0xFF, (rows >> 8) & 0xFF);
    for (let row = top; row < top + rows; row++) {
      for (let b = 0; b < widthBytes; b++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const o = (row * widthBytes * 8 + b * 8 + bit) * 4;
          const gray = 0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2];
          if (px[o + 3] > 0 && gray < 140) byte |= (0x80 >> bit);
        }
        bytes.push(byte);
      }
    }
  }
  return cut ? [...bytes, ...feedN(4), ...partCut()] : bytes;
}

/** Sends ESC/POS bytes to the desktop app's printer, or through QZ Tray in the browser. */
export async function printRawBytes(bytes, printerName) {
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  if (window.electronAPI?.isElectron) {
    const electronSettings = await window.electronAPI.getSettings();
    const name = electronSettings?.printerName || printerName;
    if (!name) throw new Error('Printer not set. Open ⚙ Settings (bottom-right gear) and choose a printer.');
    await window.electronAPI.printRaw(hex, name);
    return;
  }
  if (!printerName) throw new Error('Thermal printer not set (Bookings → Setup → Settings).');
  await ensureConnected();
  await qz.print(qz.configs.create(printerName), [{ type: 'raw', format: 'hex', data: hex }]);
}
