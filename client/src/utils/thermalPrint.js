import qz from 'qz-tray';

// ── Connection management ─────────────────────────────────────────────────────

let connectPromise = null;

async function ensureConnected() {
  if (qz.websocket.isActive()) return;
  if (connectPromise) return connectPromise;
  connectPromise = qz.websocket.connect({ retries: 2, delay: 1000 })
    .finally(() => { connectPromise = null; });
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

// ── Logo loader ───────────────────────────────────────────────────────────────
// Fetches /logo.png, scales it to fit a 58mm receipt (max 300px wide),
// and returns a base64 PNG string for QZ Tray pixel printing.
// Returns null silently if the logo can't be loaded.

async function fetchLogoBase64(maxWidth = 300) {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload  = resolve;
      img.onerror = reject;
      img.src = '/logo.png?' + Date.now(); // cache-bust
    });

    const scale  = Math.min(1, maxWidth / img.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(img.naturalWidth  * scale);
    canvas.height = Math.round(img.naturalHeight * scale);

    const ctx = canvas.getContext('2d');
    // White background (thermal paper is white; transparent PNG → black blobs)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/png').split(',')[1];
  } catch {
    return null;
  }
}

// ── ESC/POS byte helpers ──────────────────────────────────────────────────────

const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

const init     = ()    => [ESC, 0x40];
const align    = (n)   => [ESC, 0x61, n];          // 0=L 1=C 2=R
const bold     = (on)  => [ESC, 0x45, on ? 1 : 0];
const charSize = (n)   => [GS,  0x21, n];          // 0x00=1x 0x11=2x2 0x01=2xH 0x10=2xW
const feedN    = (n)   => [ESC, 0x64, n];
const partCut  = ()    => [GS,  0x56, 0x41, 4];

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
    GS, 0x28, 0x6B, 4, 0, 49, 65, 50, 0,          // model 2
    GS, 0x28, 0x6B, 3, 0, 49, 67, moduleSize,      // module size (dots per cell)
    GS, 0x28, 0x6B, 3, 0, 49, 69, 49,              // error correction M
    GS, 0x28, 0x6B, pL, pH, 49, 80, 48, ...bytes,  // store data
    GS, 0x28, 0x6B, 3, 0, 49, 81, 48,              // print
  ];
}

// ── Receipt layout ────────────────────────────────────────────────────────────

function buildReceiptBytes(coupon, settings) {
  const name      = (settings?.templeName || 'MANGAL GRAH MANDIR').toUpperCase();
  const isFree    = coupon.type === 'free';
  const isGroup   = coupon.isGroup && (coupon.groupSize || 1) > 1;
  const groupSize = coupon.groupSize || 1;
  const date      = new Date(coupon.date);
  const valDays   = settings?.mahaprasadCouponValidityDays ?? 1;
  const addr      = settings?.templeAddress || '';
  const phone     = settings?.templePhone   || '';

  // Date with weekday — matches PDF "Mon, 15 Jun 2026"
  const dateStr = date.toLocaleDateString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });

  // Type badge label — matches PDF badge exactly
  const badgeLabel = isGroup
    ? (isFree ? `GROUP  ${groupSize} PERSONS` : `GROUP  ${groupSize}x  Rs.${coupon.amount}`)
    : (isFree ? 'FREE SEVA' : `Rs.${coupon.amount}  PAID`);

  // Validity expiry
  const expiryLine = [];
  if (valDays > 0) {
    const exp = new Date(date);
    exp.setDate(exp.getDate() + valDays);
    const expStr = exp.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    expiryLine.push(...line(`Valid until: ${expStr}`));
  }

  // Batch ID (first 8 chars uppercase) — matches PDF
  const batchStr = coupon.batchId ? `Batch: ${coupon.batchId.substring(0, 8).toUpperCase()}` : '';

  const servingText = isGroup ? `Valid for ${groupSize} servings` : 'Valid for one serving';
  const contactLine = [addr, phone ? `Ph: ${phone}` : ''].filter(Boolean).join('  |  ');

  return [
    ...init(),
    ...align(1),

    // ── HEADER ──────────────────────────────────────────────────────────────
    // Temple name (double-height bold)
    ...bold(1), ...charSize(0x01),
    ...line(name),
    // Subtitle
    ...bold(0), ...charSize(0x00),
    ...line('Mahaprasad Seva Coupon'),
    ...nl(),

    // Type badge — bold, centered, surrounded by markers like PDF badge
    ...bold(1),
    ...line(`[ ${badgeLabel} ]`),
    ...bold(0),

    // Group sub-label
    ...(isGroup ? [...line(`GROUP COUPON  \xB7  ${groupSize} PERSONS`)] : []),

    ...dashes(),

    // ── COUPON NUMBER ────────────────────────────────────────────────────────
    // "COUPON NO." micro-label
    ...line('COUPON NO.'),
    // Coupon number — 2×2 large
    ...bold(1), ...charSize(0x11),
    ...line(coupon.couponNumber),
    ...bold(0), ...charSize(0x00),

    ...dashes(),

    // ── DATE + OCCASION ──────────────────────────────────────────────────────
    ...line(dateStr),
    ...(isFree && coupon.occasion ? line(coupon.occasion) : []),

    ...dashes(),

    // ── QR CODE ──────────────────────────────────────────────────────────────
    ...qrEscPos(coupon.couponNumber, 7),
    ...nl(),
    ...line('- SCAN TO VERIFY -'),
    ...nl(),

    // ── VALIDITY + BATCH ─────────────────────────────────────────────────────
    ...expiryLine,
    ...(batchStr ? line(batchStr) : []),

    ...dashes(),

    // ── FOOTER ───────────────────────────────────────────────────────────────
    ...bold(1),
    ...line(`Present at Prasad counter`),
    ...bold(0),
    ...line(servingText),
    ...line('Non-transferable'),
    ...(contactLine ? [...nl(), ...line(contactLine)] : []),

    // Feed + partial cut
    ...feedN(3),
    ...partCut(),
  ];
}

// ── Public print function ─────────────────────────────────────────────────────

export async function printThermalCoupon(coupon, settings) {
  const printerName = settings?.mahaprasadPrinterName;
  if (!printerName) {
    throw new Error('Thermal printer not set. Go to Settings → Mahaprasad and enter the printer name.');
  }

  await ensureConnected();

  const config = qz.configs.create(printerName);

  // Load logo and ESC/POS bytes in parallel
  const [logoBase64, receiptBytes] = await Promise.all([
    fetchLogoBase64(300),
    Promise.resolve(buildReceiptBytes(coupon, settings)),
  ]);

  // Convert ESC/POS byte array → base64 (works on all QZ Tray 2.x)
  let binary = '';
  for (const b of receiptBytes) binary += String.fromCharCode(b);
  const base64data = btoa(binary);

  const printData = [];

  // 1. Logo image — printed via QZ Tray pixel rendering (auto-converts to ESC/POS raster)
  if (logoBase64) {
    printData.push({
      type:   'pixel',
      format: 'image',
      flavor: 'base64',
      data:   logoBase64,
      options: { language: 'ESCPOS', dotDensity: 'double' },
    });
  }

  // 2. Rest of the receipt as raw ESC/POS bytes
  printData.push({
    type:   'raw',
    format: 'base64',
    data:   base64data,
  });

  await qz.print(config, printData);
}
