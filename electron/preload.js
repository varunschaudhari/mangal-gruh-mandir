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

  // Network — pass a url to test it directly; omit to test the saved one
  checkOnline: (url) => ipcRenderer.invoke('check-online', url),

  // Heartbeat events from main process
  onOnlineStatus: (cb) => {
    const handler = (_e, status) => cb(status);
    ipcRenderer.on('online-status', handler);
    return () => ipcRenderer.removeListener('online-status', handler);
  },

  // Dev tools
  openDevTools: () => ipcRenderer.send('open-devtools'),
});
