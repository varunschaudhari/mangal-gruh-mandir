// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = { print: vi.fn(), listPaired: vi.fn() };
vi.mock('@capacitor/core', () => ({ registerPlugin: () => native }));
vi.mock('./platform.js', () => ({ platform: 'android' }));
vi.mock('./thermalPrint.js', () => ({ canvasToEscPos: () => [] }));
vi.mock('./temple.js', () => ({ temple: () => ({ name: 'Mangal Grah Mandir', nameMr: 'श्री मंगळग्रह मंदिर' }) }));

const {
  pairedDevices, printBluetooth, savedBluetoothPrinter, saveBluetoothPrinter,
} = await import('./bluetoothPrinter.js');

describe('Bluetooth printer', () => {
  beforeEach(() => { localStorage.clear(); native.print.mockReset(); native.listPaired.mockReset(); });

  it('is remembered on the phone, 80 mm unless told otherwise', () => {
    expect(savedBluetoothPrinter()).toBe(null);
    saveBluetoothPrinter({ name: 'BP-03', address: '00:11:22:33:44:55', printer: true });
    expect(savedBluetoothPrinter()).toEqual({ name: 'BP-03', address: '00:11:22:33:44:55', paperWidth: 80 });
    saveBluetoothPrinter(null);
    expect(savedBluetoothPrinter()).toBe(null);
  });

  it('sends exactly the bytes given, as base64', async () => {
    saveBluetoothPrinter({ name: 'BP-03', address: 'AA:BB' });
    const bytes = [0x1b, 0x40, 0x00, 0xff, 0x0a, ...Array.from({ length: 70000 }, (_, i) => i % 256)];
    await printBluetooth(bytes);
    const { address, data } = native.print.mock.calls[0][0];
    expect(address).toBe('AA:BB');
    expect([...atob(data)].map((c) => c.charCodeAt(0))).toEqual(bytes);
  });

  it('says what to do when no printer is chosen, or the printer is off', async () => {
    await expect(printBluetooth([1, 2, 3])).rejects.toThrow(/Choose the Bluetooth printer first/);
    saveBluetoothPrinter({ name: 'BP-03', address: 'AA:BB' });
    native.print.mockRejectedValue(new Error('Printer not reachable — is it on, charged and near the phone?'));
    await expect(printBluetooth([1])).rejects.toThrow(/is it on, charged/);
  });

  it('lists printers before other paired devices', async () => {
    native.listPaired.mockResolvedValue({ devices: [
      { name: 'Earbuds', address: '1', printer: false },
      { name: 'BP-03', address: '2', printer: true },
    ] });
    expect((await pairedDevices()).map((d) => d.name)).toEqual(['BP-03', 'Earbuds']);
  });
});
