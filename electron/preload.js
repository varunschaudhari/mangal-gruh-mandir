'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // Settings
  getSettings:  ()         => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // Navigation (after setup or URL change)
  navigateTo: (url) => ipcRenderer.send('navigate-to', url),

  // Printer
  getPrinters:         ()                     => ipcRenderer.invoke('get-printers'),
  printRaw:            (hexData, printerName) => ipcRenderer.invoke('print-raw', hexData, printerName),
  checkPrinterStatus:  (printerName)          => ipcRenderer.invoke('check-printer-status', printerName),

  // Network
  checkOnline: () => ipcRenderer.invoke('check-online'),

  // Heartbeat events from main process
  onOnlineStatus: (cb) => {
    const handler = (_e, status) => cb(status);
    ipcRenderer.on('online-status', handler);
    return () => ipcRenderer.removeListener('online-status', handler);
  },

  // Dev tools
  openDevTools: () => ipcRenderer.send('open-devtools'),
});
