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

// ── ESC/POS byte helpers ──────────────────────────────────────────────────────

const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

const init     = ()    => [ESC, 0x40];
const align    = (n)   => [ESC, 0x61, n];   // 0=L 1=C 2=R
const bold     = (on)  => [ESC, 0x45, on ? 1 : 0];
const charSize = (n)   => [GS,  0x21, n];   // 0x00=1x  0x11=2x2  0x01=2xH  0x10=2xW
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

async function logoToEscPosBytes(maxWidth = 200) {
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
    // Temple name removed — logo + subtitle only
    ...bold(0), ...charSize(0x00),
    ...line('Mahaprasad Seva Coupon'),
    ...nl(),

    // Type badge — bold, centered, bracketed like PDF badge
    ...bold(1),
    ...line(`[ ${badgeLabel} ]`),
    ...bold(0),
    ...(isGroup ? line(`GROUP COUPON  \xB7  ${groupSize} PERSONS`) : []),

    ...dashes(),

    // ── COUPON NUMBER ────────────────────────────────────────────────────────
    ...line('COUPON NO.'),
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

    ...dashes(),

    // ── FOOTER ───────────────────────────────────────────────────────────────
    ...bold(1), ...line('Present at Prasad counter'), ...bold(0),
    // Serving count — large 2×2, same as coupon number
    ...line('SERVINGS'),
    ...bold(1), ...charSize(0x11),
    ...line(servingText),
    ...bold(0), ...charSize(0x00),
    ...line('Non-transferable'),

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

  // Build logo ESC/POS raster bytes and receipt bytes in parallel
  const [logoBytes, receiptBytes] = await Promise.all([
    logoToEscPosBytes(200),
    Promise.resolve(buildReceiptBytes(coupon, settings)),
  ]);

  // Single raw print job: logo (if loaded) + receipt
  // Using hex format — supported in ALL QZ Tray 2.x versions without enum issues
  const allBytes = [...logoBytes, ...receiptBytes];
  const hex = allBytes.map(b => b.toString(16).padStart(2, '0')).join('');

  await qz.print(config, [{
    type:   'raw',
    format: 'hex',
    data:   hex,
  }]);
}
