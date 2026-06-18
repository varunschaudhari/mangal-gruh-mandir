'use strict';

const { app, BrowserWindow, ipcMain, net, Menu, shell } = require('electron');

// Suppress harmless Chromium GPU cache warnings on Windows corporate machines
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('no-sandbox');
const path    = require('path');
const Store   = require('electron-store');
const printer = require('./printer');

// ── Persistent store ──────────────────────────────────────────────────────────
const store = new Store({
  defaults: {
    settings: { apiUrl: '', printerName: '', autoPrint: false },
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

  // Load VPS app or first-run setup; fall back to setup.html on failure
  const apiUrl = store.get('settings.apiUrl', '');
  if (apiUrl) {
    mainWindow.loadURL(apiUrl);
    mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
      if (code === 0) return; // cancelled/aborted — not a real error
      mainWindow.loadFile(path.join(__dirname, 'setup.html'));
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, 'setup.html'));
  }
}

app.whenReady().then(() => {
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

// Navigate to a URL (used after setup or URL change)
ipcMain.on('navigate-to', (_e, url) => {
  if (mainWindow) mainWindow.loadURL(url);
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
