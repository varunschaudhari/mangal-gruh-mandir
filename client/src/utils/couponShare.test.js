// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Where the app runs is decided per test
const env = vi.hoisted(() => ({ isNative: false, platform: 'web' }));
vi.mock('./platform.js', () => ({
  get isNative() { return env.isNative; },
  get platform() { return env.platform; },
  serverUrl: (p) => `https://mandir.example${p}`,
}));
const plugin = vi.hoisted(() => ({ share: vi.fn() }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => plugin }));
vi.mock('react-hot-toast', () => ({ default: vi.fn() }));
vi.mock('../i18n/index.jsx', () => ({ tNow: (s) => s }));

import toast from 'react-hot-toast';
import { shareCouponsOnWhatsApp } from './couponShare.js';

const batch = {
  mobile: '9822012345', numbers: ['MP-20261017-004'], date: '2026-10-17T12:00:00', persons: 1,
  link: 'https://mandir.aumora.io/m/AbCdEfGh1234', image: 'https://mandir.aumora.io/api/public/mahaprasad/AbCdEfGh1234/qr.png',
};
const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
let opened;

beforeEach(() => {
  vi.clearAllMocks();
  opened = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() { opened.push(this.href); });
  globalThis.fetch = vi.fn(async () => ({ ok: true, blob: async () => png }));
  env.isNative = false; env.platform = 'web';
});
afterEach(() => { vi.restoreAllMocks(); delete globalThis.ClipboardItem; delete navigator.clipboard; });

describe('sending coupons on WhatsApp from the counter', () => {
  it('Android app: straight into the devotee\'s chat, with the QR picture and the message as caption', async () => {
    env.isNative = true; env.platform = 'android';
    plugin.share.mockResolvedValue(undefined);
    expect(await shareCouponsOnWhatsApp(batch)).toBe('chat');
    expect(globalThis.fetch).toHaveBeenCalledWith('https://mandir.example/api/public/mahaprasad/AbCdEfGh1234/qr.png');
    const sent = plugin.share.mock.calls[0][0];
    expect(sent.phone).toBe('919822012345');
    expect(sent.image).toBe('iVBORw==');                       // the PNG, base64
    expect(sent.text).toContain('Your coupon QR: https://mandir.aumora.io/m/AbCdEfGh1234');
    expect(opened).toEqual([]);                                  // no wa.me link as well
  });

  it('Android app without WhatsApp: the message alone (wa.me)', async () => {
    env.isNative = true; env.platform = 'android';
    plugin.share.mockRejectedValue(Object.assign(new Error('not installed'), { code: 'NO_WHATSAPP' }));
    expect(await shareCouponsOnWhatsApp(batch)).toBe('text');
    expect(opened[0]).toMatch(/^https:\/\/wa\.me\/919822012345\?text=/);
  });

  it('desktop and browsers: the picture is copied, then WhatsApp opens with the message', async () => {
    const write = vi.fn(async (items) => { await items[0].items['image/png']; });
    Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true });
    globalThis.ClipboardItem = class { constructor(items) { this.items = items; } };
    expect(await shareCouponsOnWhatsApp(batch)).toBe('copied');
    expect(write).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('paste it into the WhatsApp chat'), expect.anything());
    expect(opened[0]).toMatch(/^https:\/\/wa\.me\/919822012345\?text=/);
  });

  it('a sale without a picture (sold offline): the message alone', async () => {
    env.isNative = true; env.platform = 'android';
    expect(await shareCouponsOnWhatsApp({ ...batch, link: undefined, image: undefined })).toBe('text');
    expect(plugin.share).not.toHaveBeenCalled();
    expect(decodeURIComponent(opened[0].split('text=')[1])).toContain('Please show this at the Mahaprasad hall.');
  });

  it('the picture can\'t be fetched: the message alone, still with the link', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404 }));
    const write = vi.fn(async (items) => { await items[0].items['image/png']; });
    Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true });
    globalThis.ClipboardItem = class { constructor(items) { this.items = items; } };
    expect(await shareCouponsOnWhatsApp(batch)).toBe('text');
    expect(decodeURIComponent(opened[0].split('text=')[1])).toContain('Your coupon QR: https://mandir.aumora.io/m/AbCdEfGh1234');
  });
});
