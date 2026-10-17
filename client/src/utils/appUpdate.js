import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { isNative, platform, serverUrl } from './platform.js';

// android/…/AppUpdatePlugin.java — downloads the APK inside the app and opens the installer
const AppUpdate = registerPlugin('AppUpdate');

// Android builds are installed straight from our server (not the Play Store), so the app
// checks the server for a newer build itself. The server serves /api/app/latest.json,
// written by scripts/release-android.mjs:
//   { "android": { "versionCode": 3, "versionName": "1.2", "file": "mgm-mandir-1.2.apk",
//                  "minVersionCode": 2, "notes": "…" } }
// minVersionCode forces older builds to update (e.g. after an incompatible API change).
// iOS updates go through TestFlight / the App Store, so this is Android-only.

export async function checkForUpdate() {
  if (!isNative || platform !== 'android') return null;

  const [{ build }, res] = await Promise.all([
    App.getInfo(),
    fetch(serverUrl('/api/app/latest.json'), { cache: 'no-store' }),
  ]);
  if (!res.ok) return null;

  const latest = (await res.json())?.android;
  const current = Number(build);
  if (!latest?.versionCode || !latest.file || !Number.isFinite(current)) return null;
  if (latest.versionCode <= current) return null;

  return {
    versionCode: latest.versionCode,
    versionName: latest.versionName || String(latest.versionCode),
    notes: latest.notes || '',
    required: current < (latest.minVersionCode || 0),
    url: serverUrl(`/api/app/${encodeURIComponent(latest.file)}`),
    file: latest.file,
  };
}

/** This build can download and install the update itself (builds from 1.5 on) */
export const canUpdateInApp = () => isNative && platform === 'android' && Capacitor.isPluginAvailable('AppUpdate');

/** Downloads the APK into the app; onProgress(receivedBytes, totalBytes). Resolves with its path on the phone. */
export async function downloadApk(update, onProgress) {
  const listener = await AppUpdate.addListener('downloadProgress', ({ received, total }) => onProgress?.(received, total));
  try {
    const { path } = await AppUpdate.download({ url: update.url, file: update.file });
    return path;
  } finally {
    listener.remove();
  }
}

/**
 * Opens Android's installer for the downloaded APK — it installs over the current app (same
 * signing key → data and login are kept). { needsPermission: true } when Android first wants this
 * app allowed to install apps: its settings screen has been opened; call again when back.
 */
export const installApk = (path) => AppUpdate.install({ path });

// Fallback (and how builds before 1.5 update): the APK opens in the phone's browser, which downloads
// it; tapping the finished download installs it.
export const downloadUpdate = (url) => Browser.open({ url });
