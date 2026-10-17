import { describe, expect, it, vi } from 'vitest';

vi.mock('qz-tray', () => ({ default: { websocket: { isActive: () => false } } }));
vi.mock('./bluetoothPrinter.js', () => ({ printBluetooth: vi.fn(), savedBluetoothPrinter: () => null }));
vi.mock('./temple.js', () => ({ temple: () => ({ name: 'Mangal Grah Mandir' }) }));

const { buildReceiptBytes, personsBytes } = await import('./thermalPrint.js');

const GS_SIZE = (n) => [0x1D, 0x21, n];
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
const includes = (bytes, part) => bytes.some((_, i) => part.every((b, j) => bytes[i + j] === b));

describe('Mahaprasad coupon slip', () => {
  it('prints the number of persons large: the number 4×, the word 2×', () => {
    const bytes = personsBytes(4);
    expect(includes(bytes, [...GS_SIZE(0x33), ...ascii('4')])).toBe(true);
    expect(includes(bytes, [...GS_SIZE(0x11), ...ascii(' PERSONS')])).toBe(true);
    expect(bytes.slice(-3)).toEqual(GS_SIZE(0x00));                     // back to normal size after
    expect(includes(personsBytes(1), ascii(' PERSON\n'))).toBe(true);   // "1 PERSON"
  });

  it('shows it on group and single coupons', () => {
    const base = { couponNumber: 'MP-20261017-004', date: '2026-10-17T12:00:00', type: 'paid', amount: 50 };
    const group = buildReceiptBytes({ ...base, isGroup: true, groupSize: 6 });
    expect(includes(group, [...GS_SIZE(0x33), ...ascii('6')])).toBe(true);
    const single = buildReceiptBytes(base);
    expect(includes(single, [...GS_SIZE(0x33), ...ascii('1')])).toBe(true);
  });
});
