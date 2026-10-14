import { useEffect, useState } from 'react';
import { registerPlugin } from '@capacitor/core';
import { canvasToEscPos } from './thermalPrint.js';
import { platform } from './platform.js';
import { temple } from './temple.js';

// A receipt printer paired with the phone over Bluetooth (Android app only), e.g. the Rugtek
// BP-03. It is chosen once on this phone (More → Bluetooth printer); after that booking slips, cash
// handover slips and Mahaprasad coupons print to it with one tap instead of opening a PDF.
// The native side: android/app/src/main/java/io/aumora/mandir/BluetoothPrinterPlugin.java

const Native = registerPlugin('BluetoothPrinter');
const KEY = 'mgm-bt-printer';
const CHANGED = 'mgm-bt-printer-changed';

/** Bluetooth printing is there only in the Android app. */
export const bluetoothSupported = () => platform === 'android';

/** The printer chosen on this phone: { name, address, paperWidth } or null. */
export function savedBluetoothPrinter() {
  if (!bluetoothSupported()) return null;
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}

export function saveBluetoothPrinter(printer) {
  try {
    if (printer) localStorage.setItem(KEY, JSON.stringify({ name: printer.name, address: printer.address, paperWidth: printer.paperWidth || 80 }));
    else localStorage.removeItem(KEY);
  } catch { /* private storage — nothing to keep */ }
  window.dispatchEvent(new Event(CHANGED));
}

/** The chosen printer, kept up to date when it is changed on the More screen. */
export function useBluetoothPrinter() {
  const [printer, setPrinter] = useState(savedBluetoothPrinter);
  useEffect(() => {
    const update = () => setPrinter(savedBluetoothPrinter());
    window.addEventListener(CHANGED, update);
    return () => window.removeEventListener(CHANGED, update);
  }, []);
  return printer;
}

/** Devices paired in the phone's Bluetooth settings, printers first. */
export async function pairedDevices() {
  const { devices = [] } = await Native.listPaired();
  return [...devices].sort((a, b) => Number(b.printer) - Number(a.printer) || String(a.name).localeCompare(String(b.name)));
}

// The native side takes the bytes as base64 text
function toBase64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.slice(i, i + 0x8000));
  return btoa(text);
}

/** Sends ESC/POS bytes to the chosen printer. Rejects with a message the counter can show. */
export async function printBluetooth(bytes, printer = savedBluetoothPrinter()) {
  if (!printer) throw new Error('Choose the Bluetooth printer first (More → Bluetooth printer)');
  try {
    await Native.print({ address: printer.address, data: toBase64(bytes) });
  } catch (err) {
    throw new Error(err?.message || 'Printer not reachable');
  }
}

/** A short test page: full-width lines (to check the paper width), Marathi and English text. */
export async function printBluetoothTest(printer) {
  const W = printer.paperWidth === 58 ? 384 : 576;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = 330;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, canvas.height);
  ctx.fillStyle = '#000'; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
  const font = '"Nirmala UI", "Noto Sans Devanagari", "Noto Sans", sans-serif';
  ctx.fillRect(0, 0, W, 6);
  ctx.font = `700 30px ${font}`; ctx.fillText(temple().nameMr || temple().name, W / 2, 24);
  ctx.font = `400 24px ${font}`; ctx.fillText('Bluetooth printer test', W / 2, 72);
  ctx.fillText(printer.name, W / 2, 106);
  ctx.fillText(new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }), W / 2, 140);
  ctx.font = `400 20px ${font}`;
  ctx.fillText(`Paper ${printer.paperWidth === 58 ? '58' : '80'} mm — the black lines should reach`, W / 2, 196);
  ctx.fillText('both edges of the printable area.', W / 2, 224);
  ctx.fillRect(0, canvas.height - 50, W, 6);
  ctx.fillRect(0, canvas.height - 50, 6, 50); ctx.fillRect(W - 6, canvas.height - 50, 6, 50);
  await printBluetooth(canvasToEscPos(canvas), printer);
}
