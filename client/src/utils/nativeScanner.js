import {
  BarcodeScanner, BarcodeFormat, GoogleBarcodeScannerModuleInstallState,
} from '@capacitor-mlkit/barcode-scanning';
import toast from 'react-hot-toast';
import { platform } from './platform.js';

// Android's ready-made scanner UI ships as an on-demand Google Play services module.
// Make sure it's installed before the first scan (a one-time download of a few MB).
async function ensureAndroidModule() {
  const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
  if (available) return;

  const toastId = toast.loading('Setting up the scanner (one-time download)…');
  try {
    await new Promise((resolve, reject) => {
      let handle;
      BarcodeScanner.addListener('googleBarcodeScannerModuleInstallProgress', ({ state }) => {
        if (state === GoogleBarcodeScannerModuleInstallState.COMPLETED) { handle?.remove(); resolve(); }
        if (state === GoogleBarcodeScannerModuleInstallState.FAILED
          || state === GoogleBarcodeScannerModuleInstallState.CANCELED) {
          handle?.remove();
          reject(new Error('Scanner download failed — check the internet connection'));
        }
      }).then((h) => { handle = h; });
      BarcodeScanner.installGoogleBarcodeScannerModule().catch(reject);
    });
    toast.success('Scanner ready', { id: toastId });
  } catch (err) {
    toast.dismiss(toastId);
    throw err;
  }
}

/**
 * Open the native full-screen QR scanner (ML Kit).
 * Resolves with the scanned text, or null if the user closed the scanner.
 */
export async function scanQrCode() {
  if (platform === 'android') {
    await ensureAndroidModule();
  } else {
    const { camera } = await BarcodeScanner.requestPermissions();
    if (camera !== 'granted' && camera !== 'limited') {
      throw new Error('Camera permission denied — enable it in Settings');
    }
  }
  try {
    const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] });
    return barcodes[0]?.rawValue?.trim() || null;
  } catch (err) {
    if (/cancel/i.test(err?.message || '')) return null;
    throw err;
  }
}
