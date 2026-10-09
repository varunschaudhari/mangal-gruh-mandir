import { Capacitor } from '@capacitor/core';

// True inside the Capacitor Android/iOS apps (not the browser/PWA, not Electron).
export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'android' | 'ios' | 'web'
export const isElectron = Boolean(typeof window !== 'undefined' && window.electronAPI?.isElectron);

// The native apps serve the UI from https://localhost (Android) / capacitor://localhost (iOS),
// so relative /api and /uploads paths must be pointed at the real server.
// Browser and Electron keep relative paths (same origin / app:// proxy).
export const API_ORIGIN = isNative
  ? (import.meta.env.VITE_API_ORIGIN || 'https://mandir.aumora.io').replace(/\/$/, '')
  : '';

export const serverUrl = (path) => `${API_ORIGIN}${path}`;
