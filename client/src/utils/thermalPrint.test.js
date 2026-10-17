import { describe, expect, it, vi } from 'vitest';

vi.mock('qz-tray', () => ({ default: { websocket: { isActive: () => false } } }));
vi.mock('./bluetoothPrinter.js', () => ({ printBluetooth: vi.fn(), savedBluetoothPrinter: () => null }));
vi.mock('./temple.js', () => ({ temple: () => ({ name: 'Mangal Grah Mandir' }) }));

const { buildReceiptBytes, personsBytes } = await import('./thermalPrint.js');

const GS_SIZE = (n) => [0x1D, 0x21, n];
const SPACING = (n) => [0x1B, 0x20, n];
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
const includes = (bytes, part) => bytes.some((_, i) => part.every((b, j) => bytes[i + j] === b));

describe('Mahaprasad coupon slip', () => {
  it('prints the number of persons large on its own line, the word 2× below', () => {
    const bytes = personsBytes(4);
    expect(includes(bytes, [...GS_SIZE(0x33), ...SPACING(2), ...ascii('4\n')])).toBe(true);
    expect(includes(bytes, [...SPACING(0), 0x1B, 0x45, 1, ...GS_SIZE(0x11), ...ascii('PERSONS\n')])).toBe(true);
    expect(bytes.slice(-3)).toEqual(GS_SIZE(0x00));                     // back to normal size after
    expect(includes(personsBytes(1), ascii('PERSON\n'))).toBe(true);    // "1 PERSON"
  });

  it('keeps 3-digit counts apart: not bold, 3× wide, spaced', () => {
    const bytes = personsBytes(120);
    expect(includes(bytes, [0x1B, 0x45, 0, ...GS_SIZE(0x23), ...SPACING(2), ...ascii('120\n')])).toBe(true);
  });

  it('shows it on group and single coupons', () => {
    const base = { couponNumber: 'MP-20261017-004', date: '2026-10-17T12:00:00', type: 'paid', amount: 50 };
    const group = buildReceiptBytes({ ...base, isGroup: true, groupSize: 6 });
    expect(includes(group, [...GS_SIZE(0x33), ...SPACING(2), ...ascii('6')])).toBe(true);
    const single = buildReceiptBytes(base);
    expect(includes(single, [...GS_SIZE(0x33), ...SPACING(2), ...ascii('1')])).toBe(true);
  });
});
