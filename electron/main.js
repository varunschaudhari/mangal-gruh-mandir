'use strict';

const { app, BrowserWindow, ipcMain, net, Menu, shell, protocol } = require('electron');

// Register 'app' as a privileged scheme — MUST happen before app.whenReady().
// Makes app:// behave like https:// so localStorage, fetch, and cookies work.
// The renderer always loads from local files so the app starts even offline.
protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true },
}]);

// Suppress harmless Chromium GPU cache warnings on Windows corporate machines
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
const path    = require('path');
const fs      = require('fs');
const Store   = require('electron-store');
const printer = require('./printer');
const { autoUpdater } = require('electron-updater');

// ── Persistent store ──────────────────────────────────────────────────────────
const store = new Store({
  defaults: {
    settings: { apiUrl: 'https://mandir.aumora.io', printerName: '', autoPrint: false },
    windowBounds: { width: 1100, height: 750 },
  },
});

let mainWindow = null;

// The server address receives every request's sign-in token (the app proxies /api to it), so it
// must be https — plain http only for a server on this computer, when testing. Returns the
// cleaned address, or '' if it isn't acceptable.
function serverUrl(value) {
  let u;
  try { u = new URL(String(value || '').trim()); } catch { return ''; }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return '';
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
}
const savedServer = () => serverUrl(store.get('settings.apiUrl', ''));

// True when the server and its database are up (/api/health answers 200 within 5 s)
async function serverAnswers(apiUrl) {
  try {
    const res = await net.fetch(`${apiUrl}/api/health`, { method: 'GET', signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  const { width, height } = store.get('windowBounds');

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 800,
    minHeight: 600,
    title: 'MGM Mahaprasad Counter',
    icon: path.join(__dirname, 'assets/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on('resize', () => {
    if (mainWindow) {
      const [w, h] = mainWindow.getSize();
      store.set('windowBounds', { width: w, height: h });
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  Menu.setApplicationMenu(null);

  // The app's own print windows (receipts, labels — opened blank and written into) and PDF
  // previews (blob:) open inside the app; every other link goes to the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url || url === 'about:blank' || url.startsWith('blob:')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 860, height: 900, autoHideMenuBar: true, parent: mainWindow,
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
        },
      };
    }
    if (/^(https?|mailto|tel):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // The main window only ever shows the app itself. A link that would take it to another site
  // (where the page would get the printer and settings bridge) opens in the browser instead.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('app://mgm/')) return;
    event.preventDefault();
    if (/^(https?|mailto|tel):/i.test(url)) shell.openExternal(url);
  });

  // Developer tools: Ctrl+Shift+I, only while this window has focus
  mainWindow.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow?.webContents.openDevTools();
    }
  });

  // Always load from local files — works offline, starts instantly.
  // The app:// protocol handler below serves client/dist and proxies /api to VPS.
  mainWindow.loadURL('app://mgm/');
}

app.whenReady().then(() => {
  // ── app:// protocol handler ────────────────────────────────────────────────
  // • Static files  → served from client/dist (always available offline)
  // • /api/*        → proxied to configured VPS URL (needs internet)
  // • /uploads/*    → proxied to configured VPS URL (needs internet)
  //
  // Using a proxy here (instead of putting the VPS URL in the renderer) means
  // the renderer uses plain relative /api/... paths and has no direct contact
  // with the VPS — no CORS issues, no URL leaking into the bundle.
  // Dev: client/dist sits next to the electron folder.
  // Packaged: electron-builder copies it to resources/client-dist (extraResources).
  const distDir = app.isPackaged
    ? path.join(process.resourcesPath, 'client-dist')
    : path.join(__dirname, '../client/dist');

  protocol.handle('app', async (request) => {
    const url      = new URL(request.url);
    const pathname = url.pathname;

    // ── Proxy API + uploads to VPS ─────────────────────────────────────────
    if (pathname.startsWith('/api/') || pathname.startsWith('/uploads/')) {
      const vpsUrl = savedServer();

      if (!vpsUrl) {
        return new Response(
          JSON.stringify({ success: false, message: 'Server address not set, or not https. Open ⚙ Settings and enter the server address (https://…).' }),
          { status: 503, headers: { 'content-type': 'application/json' } },
        );
      }

      // Forward all headers except Origin/Host so VPS CORS always passes
      const fwdHeaders = {};
      for (const [k, v] of request.headers.entries()) {
        if (k.toLowerCase() !== 'origin' && k.toLowerCase() !== 'host') fwdHeaders[k] = v;
      }

      try {
        return await net.fetch(vpsUrl + pathname + url.search, {
          method:  request.method,
          headers: fwdHeaders,
          body:    ['GET', 'HEAD'].includes(request.method) ? null : request.body,
          duplex:  'half',
        });
      } catch {
        return new Response(
          JSON.stringify({ success: false, message: 'Cannot reach server — check internet connection.' }),
          { status: 503, headers: { 'content-type': 'application/json' } },
        );
      }
    }

    // ── Serve static files from client/dist ───────────────────────────────
    const safePath = path.normalize(path.join(distDir, pathname));
    // Prevent path traversal outside dist
    if (!safePath.startsWith(distDir + path.sep) && safePath !== distDir) {
      return new Response('Forbidden', { status: 403 });
    }

    let target = safePath;
    try {
      if (fs.statSync(target).isDirectory()) target = path.join(distDir, 'index.html');
    } catch {
      target = path.join(distDir, 'index.html'); // SPA fallback for unknown paths
    }

    return net.fetch(`file://${target}`);
  });

  createWindow();
  setupAutoUpdate();

  // ── Online heartbeat: ping VPS every 60 s, notify renderer ────────────────
  // Online means the server answers *and* its database does (/api/health says 503 otherwise);
  // when it doesn't, the counter switches to offline issuing.
  const heartbeat = async () => {
    const apiUrl = savedServer();
    if (!apiUrl || !mainWindow || mainWindow.isDestroyed()) return;
    const online = await serverAnswers(apiUrl);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('online-status', { online, ts: Date.now() });
  };
  setTimeout(heartbeat, 5_000);
  setInterval(heartbeat, 30_000);

  app.on('activate', () => { if (!mainWindow) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── Auto-update ───────────────────────────────────────────────────────────────
// New desktop versions are published on the server next to the Android app updates
// (mobile-releases/desktop/, served at /api/app/desktop/ — see scripts/release-desktop.mjs).
// The update downloads in the background; it installs when the counter clicks "Restart now"
// or the next time the app is closed, so a busy counter is never interrupted.
// Updates come only from this fixed https address (same as electron-builder.config.cjs → publish),
// never from the server address in ⚙ Settings: whoever can change that setting must not be able
// to install their own program on the counter.
const UPDATE_FEED = 'https://mandir.aumora.io/api/app/desktop/';
let updateReady = null; // version downloaded and waiting to install

const sendUpdateStatus = (status) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-status', status);
};

async function checkForUpdates() {
  if (!app.isPackaged) return { state: 'dev' };
  if (updateReady) return { state: 'ready', version: updateReady };
  const result = await autoUpdater.checkForUpdates();
  const version = result?.updateInfo?.version;
  return version && version !== app.getVersion() ? { state: 'downloading', version } : { state: 'current', version: app.getVersion() };
}

function setupAutoUpdate() {
  if (!app.isPackaged) return;
  autoUpdater.setFeedURL({ provider: 'generic', url: UPDATE_FEED });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (info) => sendUpdateStatus({ state: 'downloading', version: info.version }));
  autoUpdater.on('update-downloaded', (info) => {
    updateReady = info.version;
    sendUpdateStatus({ state: 'ready', version: info.version });
  });
  autoUpdater.on('error', (err) => console.error('[update]', err?.message || err));
  const check = () => checkForUpdates().catch((err) => console.error('[update]', err?.message || err));
  setTimeout(check, 15_000);                 // shortly after start
  setInterval(check, 4 * 60 * 60 * 1000);    // and every 4 hours while open
}

// ── IPC ───────────────────────────────────────────────────────────────────────

// Desktop app version and updates
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-update-status', () => (updateReady ? { state: 'ready', version: updateReady } : null));
ipcMain.handle('check-for-updates', async () => {
  try { return await checkForUpdates(); } catch (err) { return { state: 'error', message: err?.message || String(err) }; }
});
ipcMain.on('install-update', () => { if (updateReady) autoUpdater.quitAndInstall(true, true); });

// Settings
ipcMain.handle('get-settings', () => store.get('settings'));
ipcMain.handle('save-settings', (_e, s = {}) => {
  const next = { ...store.get('settings') };
  if ('apiUrl' in s) {
    const url = serverUrl(s.apiUrl);
    if (!url) return { ok: false, message: 'The server address must start with https://' };
    next.apiUrl = url;
  }
  if ('printerName' in s) next.printerName = String(s.printerName || '');
  if ('autoPrint' in s) next.autoPrint = Boolean(s.autoPrint);
  store.set('settings', next);
  return { ok: true, settings: next };
});

// Reload the app after settings change — new VPS URL takes effect immediately
// via the protocol proxy, but a reload clears stale auth state cleanly.
ipcMain.on('navigate-to', () => {
  if (mainWindow) mainWindow.loadURL('app://mgm/');
});

// Printer list via Electron built-in
ipcMain.handle('get-printers', async (event) => {
  try {
    const list = await event.sender.getPrintersAsync();
    return list.map((p) => ({ name: p.name, isDefault: p.isDefault }));
  } catch {
    return [];
  }
});

// Raw ESC/POS print via PowerShell (no native compilation needed)
ipcMain.handle('print-raw', async (_e, hexData, printerName) => {
  return printer.printRaw(hexData, printerName);
});

// On-demand health check (used by settings panel)
ipcMain.handle('check-online', async (_e, url) => {
  // Test the passed-in url (what's typed in Settings) if given; else the saved one.
  const apiUrl = url ? serverUrl(url) : savedServer();
  if (!apiUrl) return { online: false, reason: url ? 'not-https' : 'not-configured' };
  return (await serverAnswers(apiUrl)) ? { online: true } : { online: false, reason: 'unreachable' };
});

// Printer status check (used by Settings before test print)
ipcMain.handle('check-printer-status', async (_e, printerName) => {
  return printer.checkPrinterStatus(printerName);
});

// Dev tools (also Ctrl+Shift+I in the window — see createWindow)
ipcMain.on('open-devtools', () => mainWindow?.webContents.openDevTools());
