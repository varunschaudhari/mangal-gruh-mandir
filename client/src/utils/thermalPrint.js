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
  const name    = (settings?.templeName || 'MANGAL GRAH MANDIR').toUpperCase();
  const isFree  = coupon.type === 'free';
  const date    = new Date(coupon.date);
  const dateStr = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const valDays = settings?.mahaprasadCouponValidityDays ?? 1;
  const typeStr = isFree ? 'FREE SEVA' : `PAID  Rs.${coupon.amount}`;

  const expiryBytes = [];
  if (valDays > 0) {
    const exp = new Date(date);
    exp.setDate(exp.getDate() + valDays);
    const expStr = exp.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    expiryBytes.push(...line(`Valid until: ${expStr}`));
  }

  return [
    ...init(),

    // Temple name — double-height bold, centered
    ...align(1), ...bold(1), ...charSize(0x01),
    ...line(name),
    ...bold(0), ...charSize(0x00),
    ...line('Mahaprasad Seva Coupon'),
    ...dashes(),

    // Coupon number — 2×2 (double width + height)
    ...charSize(0x11), ...bold(1),
    ...line(coupon.couponNumber),
    ...bold(0), ...charSize(0x00),
    ...dashes(),

    // QR code (centered via ESC/POS alignment)
    ...align(1),
    ...qrEscPos(coupon.couponNumber, 7),
    ...nl(),

    // Type — double-height bold
    ...bold(1), ...charSize(0x01),
    ...line(typeStr),
    ...bold(0), ...charSize(0x00),

    // Occasion (free only)
    ...(isFree && coupon.occasion ? line(coupon.occasion) : []),

    // Date + validity
    ...line(dateStr),
    ...expiryBytes,

    ...dashes(),

    // Footer
    ...line('Present at Prasad counter'),
    ...line('Valid for one serving'),
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
  await qz.print(config, [{
    type:   'raw',
    format: 'bytes',
    data:   buildReceiptBytes(coupon, settings),
  }]);
}
