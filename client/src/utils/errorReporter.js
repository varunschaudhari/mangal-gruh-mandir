import { App } from '@capacitor/app';
import { isElectron, isNative, platform, serverUrl } from './platform.js';

// Sends crashes to our own server (POST /api/client-errors) so admins can see them under
// Admin → App Errors. Best effort: never throws, never retries, at most a few per session.

const MAX_PER_SESSION = 10;
const sent = new Set();

// Not bugs in our code: browser noise, cross-origin scripts, and old chunks after a deploy
// (lazyPage.js reloads for those). API errors are logged by the server already.
const IGNORE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i,
];

const appName = isNative ? platform : isElectron ? 'electron' : 'web';
const buildDate = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : '';
let appVersion = buildDate;
if (isNative) {
  App.getInfo().then((i) => { appVersion = `${i.version} (${i.build}) ${buildDate}`.trim(); }).catch(() => {});
}

export function reportError(error, { source = 'script' } = {}) {
  try {
    if (!error || error.isAxiosError) return;
    const message = String(error.message || error).slice(0, 500);
    if (!message || IGNORE.some((re) => re.test(message))) return;

    const stack = String(error.stack || '').slice(0, 4000);
    const key = `${message}|${stack.split('\n')[1] || ''}`;
    if (sent.has(key) || sent.size >= MAX_PER_SESSION) return;
    sent.add(key);

    let token = null;
    try { token = localStorage.getItem('accessToken'); } catch { /* ignore */ }

    fetch(serverUrl('/api/client-errors'), {
      method: 'POST',
      keepalive: true,
      headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
      body: JSON.stringify({
        message, stack, source, app: appName, appVersion, path: window.location.pathname,
      }),
    }).catch(() => {});
  } catch { /* reporting must never cause another error */ }
}

// Uncaught errors outside React's render (event handlers, timers, promises).
export function installGlobalErrorHandlers() {
  window.addEventListener('error', (e) => reportError(e.error || e.message, { source: 'script' }));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, { source: 'promise' }));
}
