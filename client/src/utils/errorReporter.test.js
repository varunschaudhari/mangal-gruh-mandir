import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./platform.js', () => ({
  isNative: false, isElectron: false, platform: 'web', serverUrl: (p) => `https://mandir.example${p}`,
}));
vi.mock('@capacitor/app', () => ({ App: { getInfo: () => Promise.resolve({}) } }));

globalThis.window = { location: { pathname: '/payments/123' }, addEventListener: () => {} };
globalThis.localStorage = { getItem: () => 'token-1' };
const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
globalThis.fetch = fetchMock;

const { reportError } = await import('./errorReporter.js');
const lastBody = () => JSON.parse(fetchMock.mock.calls.at(-1)[1].body);

describe('reportError', () => {
  beforeEach(() => fetchMock.mockClear());

  it('sends the error with where it happened', () => {
    const err = new Error('Cannot read properties of undefined (reading "total")');
    reportError(err, { source: 'screen' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://mandir.example/api/client-errors');
    expect(init.headers.authorization).toBe('Bearer token-1');
    expect(lastBody()).toMatchObject({ message: err.message, source: 'screen', app: 'web', path: '/payments/123' });
  });

  it('sends each distinct error once per session', () => {
    const err = new Error('Duplicate me');
    reportError(err);
    reportError(err);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('skips noise and API errors (the server logs those)', () => {
    reportError(new Error('ResizeObserver loop completed with undelivered notifications.'));
    reportError(new Error('Failed to fetch dynamically imported module: /assets/x.js'));
    reportError(Object.assign(new Error('Request failed with status code 500'), { isAxiosError: true }));
    reportError(null);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never throws, even if fetch does', () => {
    fetchMock.mockImplementationOnce(() => { throw new Error('offline'); });
    expect(() => reportError(new Error('Something else'))).not.toThrow();
  });
});
