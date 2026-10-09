import { BiometricAuth, BiometryType } from '@aparajita/capacitor-biometric-auth';
import { isNative } from './platform.js';

// Optional app lock for the mobile apps: fingerprint / face, or the phone's own PIN or
// pattern as fallback. Phones stay signed in for months (rolling session), so the lock is
// what stops someone else who picks up the phone. Stored per device.
const KEY = 'mgm-app-lock';
const OFFERED_KEY = 'mgm-app-lock-offered';

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export const isLockEnabled = () => isNative && read(KEY) === 'on';
export const setLockEnabled = (on) => write(KEY, on ? 'on' : 'off');

// Offer the lock once after the first sign-in on this phone.
export const lockOffered = () => read(OFFERED_KEY) === '1';
export const markLockOffered = () => write(OFFERED_KEY, '1');

const LABELS = {
  [BiometryType.fingerprintAuthentication]: 'fingerprint',
  [BiometryType.touchId]: 'Touch ID',
  [BiometryType.faceId]: 'Face ID',
  [BiometryType.faceAuthentication]: 'face unlock',
  [BiometryType.irisAuthentication]: 'iris unlock',
};

/** What this phone can use: { available, label } — label like "fingerprint" or "phone PIN". */
export async function lockSupport() {
  if (!isNative) return { available: false, label: '' };
  try {
    const r = await BiometricAuth.checkBiometry();
    if (r.isAvailable) return { available: true, label: LABELS[r.biometryType] || 'fingerprint' };
    if (r.deviceIsSecure) return { available: true, label: 'phone PIN' };
  } catch { /* plugin unavailable */ }
  return { available: false, label: '' };
}

/** Shows the system unlock prompt. Resolves on success, throws if cancelled or failed. */
export const unlockWithDevice = () => BiometricAuth.authenticate({
  reason: 'Unlock MGM Mandir',
  cancelTitle: 'Cancel',
  allowDeviceCredential: true,
  androidTitle: 'Unlock MGM Mandir',
  androidSubtitle: 'Use your fingerprint or phone PIN',
  androidConfirmationRequired: false,
});
