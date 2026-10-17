import { describe, expect, it, vi } from 'vitest';

vi.mock('qz-tray', () => ({ default: { websocket: { isActive: () => false } } }));
vi.mock('./bluetoothPrinter.js', () => ({ printBluetooth: vi.fn(), savedBluetoothPrinter: () => null }));
vi.mock('./temple.js', () => ({ temple: () => ({ name: 'Mangal Grah Mandir' }) }));

const { buildReceiptBytes, personsBytes } = await import('./thermalPrint.js');

const GS_SIZE = (n) => [0x1D, 0x21, n];
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
const includes = (bytes, part) => bytes.some((_, i) => part.every((b, j) => bytes[i + j] === b));

// A stand-in canvas: records what is drawn; text is 0.55 em wide per character
function fakeCanvas() {
  const drawn = [];
  const ctx = {
    font: '', fillStyle: '', textBaseline: '',
    fillRect: () => {},
    measureText: (s) => ({ width: s.length * 0.55 * Number(/(\d+)px/.exec(ctx.font)[1]) }),
    fillText: (s, x, y) => drawn.push({ s, x, y, size: Number(/(\d+)px/.exec(ctx.font)[1]) }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  };
  return { width: 0, height: 0, getContext: () => ctx, drawn };
}
const rightEdge = (d) => d.x + d.s.length * 0.55 * d.size;

describe('Mahaprasad coupon slip — number of persons', () => {
  it('is drawn as a picture: each digit apart, the word beside it, one short line, 58 mm wide', () => {
    let canvas;
    const bytes = personsBytes(108, () => (canvas = fakeCanvas()));
    const digits = canvas.drawn.filter((d) => /^\d$/.test(d.s));
    expect(digits.map((d) => d.s)).toEqual(['1', '0', '8']);
    digits.slice(1).forEach((d, i) => expect(d.x - rightEdge(digits[i])).toBeGreaterThanOrEqual(10));   // a clear gap
    expect(digits[0].size).toBeGreaterThanOrEqual(96);                       // about 9 mm tall
    const word = canvas.drawn.at(-1);
    expect(word.s).toBe('PERSONS');
    expect(word.y).toBe(digits[0].y);                                        // same line
    expect(word.x).toBeGreaterThan(rightEdge(digits.at(-1)));
    // Centred raster image, 384 dots (48 bytes) wide, 96 rows (12 mm) — no printer reset inside the slip
    expect(bytes.slice(0, 3)).toEqual([0x1B, 0x61, 1]);
    expect(includes(bytes, [0x1D, 0x76, 0x30, 0x00, 48, 0, 96, 0])).toBe(true);
    expect(includes(bytes, [0x1B, 0x40])).toBe(false);
  });

  it('shrinks very long counts to stay inside the roll', () => {
    let canvas;
    personsBytes(123456, () => (canvas = fakeCanvas()));
    expect(canvas.drawn[0].x).toBeGreaterThanOrEqual(0);
    expect(rightEdge(canvas.drawn.at(-1))).toBeLessThanOrEqual(384);
  });

  it('says PERSON for one', () => {
    let canvas;
    personsBytes(1, () => (canvas = fakeCanvas()));
    expect(canvas.drawn.at(-1).s).toBe('PERSON');
  });

  it('falls back to the printer font without a canvas', () => {
    const bytes = personsBytes(4, () => null);
    expect(includes(bytes, [...GS_SIZE(0x33), ...ascii('4'), ...GS_SIZE(0x11), ...ascii(' PERSONS\n')])).toBe(true);
    expect(bytes.slice(-3)).toEqual(GS_SIZE(0x00));
  });

  it('is on group and single coupons', () => {
    const base = { couponNumber: 'MP-20261017-004', date: '2026-10-17T12:00:00', type: 'paid', amount: 50 };
    // No document in these tests, so the fallback shows which count was printed
    expect(includes(buildReceiptBytes({ ...base, isGroup: true, groupSize: 6 }), [...GS_SIZE(0x33), ...ascii('6')])).toBe(true);
    expect(includes(buildReceiptBytes(base), [...GS_SIZE(0x33), ...ascii('1')])).toBe(true);
  });

  it('keeps the slip short: the count right under the coupon number, not repeated in the footer', () => {
    const bytes = buildReceiptBytes({ couponNumber: 'MP-20261017-004', date: '2026-10-17T12:00:00', type: 'paid', amount: 50, isGroup: true, groupSize: 6 });
    expect(includes(bytes, ascii('Valid for'))).toBe(false);
    const afterNumber = bytes.slice(bytes.indexOf(0x0A, bytes.findIndex((_, i) => includes(bytes.slice(i, i + 15), ascii('MP-20261017-004')))) + 1);
    expect(includes(afterNumber.slice(0, 12), ascii('---'))).toBe(false);   // no divider before the count
  });
});
