import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { isNative, platform, serverUrl } from './platform.js';

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
  };
}

// Opens the APK in the phone's browser, which downloads it; tapping the finished
// download installs it over the current app (same signing key → data and login are kept).
export const downloadUpdate = (url) => Browser.open({ url });
