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

// Printed shop barcodes on packaged goods, plus QR codes.
const PRODUCT_FORMATS = [
  BarcodeFormat.QrCode, BarcodeFormat.Ean13, BarcodeFormat.Ean8, BarcodeFormat.UpcA,
  BarcodeFormat.UpcE, BarcodeFormat.Code128, BarcodeFormat.Code39, BarcodeFormat.DataMatrix,
];

/**
 * Open the native full-screen scanner (ML Kit).
 * Resolves with the scanned text, or null if the user closed the scanner.
 * @param {{ barcodes?: boolean }} options  barcodes: also read shop barcodes (EAN/UPC/Code 128…)
 */
export async function scanQrCode({ barcodes = false } = {}) {
  if (platform === 'android') {
    await ensureAndroidModule();
  } else {
    const { camera } = await BarcodeScanner.requestPermissions();
    if (camera !== 'granted' && camera !== 'limited') {
      throw new Error('Camera permission denied — enable it in Settings');
    }
  }
  try {
    const result = await BarcodeScanner.scan({ formats: barcodes ? PRODUCT_FORMATS : [BarcodeFormat.QrCode] });
    return result.barcodes[0]?.rawValue?.trim() || null;
  } catch (err) {
    if (/cancel/i.test(err?.message || '')) return null;
    throw err;
  }
}
