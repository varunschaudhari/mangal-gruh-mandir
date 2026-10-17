import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./platform.js', () => ({
  isNative: true,
  platform: 'android',
  serverUrl: (p) => `https://mandir.example${p}`,
}));
vi.mock('@capacitor/browser', () => ({ Browser: { open: vi.fn() } }));
const getInfo = vi.fn();
vi.mock('@capacitor/app', () => ({ App: { getInfo: (...a) => getInfo(...a) } }));

const { checkForUpdate } = await import('./appUpdate.js');

const serve = (body, ok = true) => {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok, json: async () => body });
};

describe('checkForUpdate', () => {
  beforeEach(() => getInfo.mockResolvedValue({ build: '2', version: '1.1' }));

  it('offers a newer build', async () => {
    serve({ android: { versionCode: 3, versionName: '1.2', file: 'mgm-mandir-1.2.apk', minVersionCode: 1, notes: 'Faster' } });
    expect(await checkForUpdate()).toEqual({
      versionCode: 3,
      versionName: '1.2',
      notes: 'Faster',
      required: false,
      url: 'https://mandir.example/api/app/mgm-mandir-1.2.apk',
      file: 'mgm-mandir-1.2.apk',
    });
  });

  it('requires the update when this build is below minVersionCode', async () => {
    serve({ android: { versionCode: 4, versionName: '1.3', file: 'a.apk', minVersionCode: 3 } });
    expect((await checkForUpdate()).required).toBe(true);
  });

  it('stays quiet when already up to date', async () => {
    serve({ android: { versionCode: 2, versionName: '1.1', file: 'a.apk' } });
    expect(await checkForUpdate()).toBeNull();
  });

  it('stays quiet when nothing is published or the file is missing', async () => {
    serve({}, false);
    expect(await checkForUpdate()).toBeNull();
    serve({ android: { versionCode: 9 } });
    expect(await checkForUpdate()).toBeNull();
  });

  it('ignores builds without a numeric versionCode', async () => {
    getInfo.mockResolvedValue({ build: 'dev', version: '0' });
    serve({ android: { versionCode: 3, file: 'a.apk' } });
    expect(await checkForUpdate()).toBeNull();
  });
});
