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
app.commandLine.appendSwitch('no-sandbox');
const path    = require('path');
const fs      = require('fs');
const Store   = require('electron-store');
const printer = require('./printer');

// ── Persistent store ──────────────────────────────────────────────────────────
const store = new Store({
  defaults: {
    settings: { apiUrl: 'http://103.168.19.129', printerName: '', autoPrint: false },
    windowBounds: { width: 1100, height: 750 },
  },
});

let mainWindow = null;

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  const { width, height } = store.get('windowBounds');

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 800,
    minHeight: 600,
    title: 'MGM Mahaprasad Counter',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
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

  // Open new-window links in the system browser instead of Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
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
  const distDir = path.join(__dirname, '../client/dist');

  protocol.handle('app', async (request) => {
    const url      = new URL(request.url);
    const pathname = url.pathname;

    // ── Proxy API + uploads to VPS ─────────────────────────────────────────
    if (pathname.startsWith('/api/') || pathname.startsWith('/uploads/')) {
      const vpsUrl = store.get('settings.apiUrl', '').replace(/\/$/, '');

      if (!vpsUrl) {
        return new Response(
          JSON.stringify({ success: false, message: 'Server URL not configured. Open ⚙ Settings and enter the VPS address.' }),
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

  // ── Online heartbeat: ping VPS every 60 s, notify renderer ────────────────
  setInterval(async () => {
    const apiUrl = store.get('settings.apiUrl', '').replace(/\/$/, '');
    if (!apiUrl || !mainWindow || mainWindow.isDestroyed()) return;
    try {
      await net.fetch(apiUrl + '/api/health', {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      mainWindow.webContents.send('online-status', { online: true, ts: Date.now() });
    } catch {
      mainWindow.webContents.send('online-status', { online: false, ts: Date.now() });
    }
  }, 60_000);

  app.on('activate', () => { if (!mainWindow) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC ───────────────────────────────────────────────────────────────────────

// Settings
ipcMain.handle('get-settings', () => store.get('settings'));
ipcMain.handle('save-settings', (_e, s) => {
  store.set('settings', { ...store.get('settings'), ...s });
  return { ok: true };
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
ipcMain.handle('check-online', async () => {
  const apiUrl = store.get('settings.apiUrl', '').replace(/\/$/, '');
  if (!apiUrl) return { online: false, reason: 'not-configured' };
  try {
    await net.fetch(apiUrl + '/api/health', {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return { online: true };
  } catch {
    return { online: false, reason: 'unreachable' };
  }
});

// Printer status check (used by Settings before test print)
ipcMain.handle('check-printer-status', async (_e, printerName) => {
  return printer.checkPrinterStatus(printerName);
});

// Dev tools shortcut
ipcMain.on('open-devtools', () => mainWindow?.webContents.openDevTools());
app.on('ready', () => {
  const { globalShortcut } = require('electron');
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    mainWindow?.webContents.openDevTools();
  });
});
