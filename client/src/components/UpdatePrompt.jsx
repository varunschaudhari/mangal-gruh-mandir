import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { Download, PackageCheck, Sparkles } from 'lucide-react';
import Sheet from './ui/Sheet.jsx';
import { canUpdateInApp, checkForUpdate, downloadApk, downloadUpdate, installApk } from '../utils/appUpdate.js';
import { isNative } from '../utils/platform.js';
import { useT } from '../i18n/index.jsx';

const CHECK_EVERY_MS = 30 * 60 * 1000;      // on launch, then at most every 30 min on resume
const SNOOZE_MS      = 24 * 60 * 60 * 1000;  // "Later" hides an optional update for a day
const SNOOZE_KEY     = 'mgm-update-snoozed';

const snoozed = (versionCode) => {
  try {
    const s = JSON.parse(localStorage.getItem(SNOOZE_KEY) || 'null');
    return s?.versionCode === versionCode && Date.now() - s.at < SNOOZE_MS;
  } catch { return false; }
};

const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

// Android app only: offers (or, below minVersionCode, requires) the newer build published
// on our server. See utils/appUpdate.js. From 1.5 the app downloads the APK itself and opens the
// installer (stage: idle → downloading → ready → installing); older builds hand it to the browser.
const UpdatePrompt = () => {
  const [update, setUpdate] = useState(null);
  const [stage, setStage] = useState('idle');
  const [progress, setProgress] = useState({ received: 0, total: 0 });
  const [apkPath, setApkPath] = useState(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [error, setError] = useState('');
  const lastCheck = useRef(0);
  const waitingForPermission = useRef(null);   // the APK to install once the person is back from Settings
  const t = useT();

  const install = useCallback(async (path) => {
    setError('');
    setStage('installing');
    try {
      const res = await installApk(path);
      if (res?.needsPermission) {
        // Settings is open: back in the app, the install continues by itself
        waitingForPermission.current = path;
        setNeedsPermission(true);
      } else {
        setNeedsPermission(false);
      }
      setStage('ready');   // if the installer is closed without installing, Install is there again
    } catch (e) {
      setStage(e?.code === 'NO_FILE' ? 'idle' : 'ready');
      setError(e?.message || t('The update could not be opened'));
    }
  }, [t]);

  const startDownload = async () => {
    if (!canUpdateInApp()) { downloadUpdate(update.url); return; }
    setError('');
    setStage('downloading');
    setProgress({ received: 0, total: 0 });
    try {
      const path = await downloadApk(update, (received, total) => setProgress({ received, total }));
      setApkPath(path);
      await install(path);
    } catch (e) {
      setStage('idle');
      setError(e?.message || t('Download failed — check the internet connection and try again'));
    }
  };

  const check = useCallback(async () => {
    if (Date.now() - lastCheck.current < CHECK_EVERY_MS) return;
    lastCheck.current = Date.now();
    try {
      const found = await checkForUpdate();
      if (found && (found.required || !snoozed(found.versionCode))) setUpdate(found);
    } catch { /* offline or server unreachable — try again next time */ }
  }, []);

  useEffect(() => {
    if (!isNative) return undefined;
    check();
    const handle = App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      // Back from "Install unknown apps": carry on installing
      const path = waitingForPermission.current;
      if (path) { waitingForPermission.current = null; install(path); return; }
      check();
    });
    return () => { handle.then((h) => h.remove()); };
  }, [check, install]);

  if (!update) return null;

  const later = () => {
    try { localStorage.setItem(SNOOZE_KEY, JSON.stringify({ versionCode: update.versionCode, at: Date.now() })); } catch { /* ignore */ }
    setUpdate(null);
  };

  return (
    <Sheet open onClose={update.required || stage === 'downloading' ? () => {} : later} size="sm">
      <div className="space-y-4 pt-2 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
          <Sparkles className="h-7 w-7" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            {update.required ? t('Update required') : t('Update available')}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {t('Version {version} is ready.', { version: update.versionName })}
            {update.required && ` ${t('This version of the app no longer works with the server.')}`}
          </p>
        </div>
        {update.notes && (
          <p className="whitespace-pre-line rounded-xl bg-gray-50 px-4 py-3 text-left text-sm text-gray-700">{update.notes}</p>
        )}
        {stage === 'downloading' ? (
          <div className="space-y-2 text-left">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-primary-600 transition-[width] duration-200"
                style={{ width: progress.total ? `${Math.min(100, (progress.received / progress.total) * 100)}%` : '8%' }} />
            </div>
            <p className="text-center text-sm text-gray-600">
              {progress.total
                ? t('Downloading… {done} of {total} MB', { done: mb(progress.received), total: mb(progress.total) })
                : t('Downloading…')}
            </p>
          </div>
        ) : (
          <p className="text-xs text-gray-400">
            {canUpdateInApp()
              ? t('Tap Download: the update downloads here and Android asks you to install it. Your data and login stay as they are.')
              : t('Tap Download, then open the downloaded file to install. Your data and login stay as they are.')}
          </p>
        )}
        {needsPermission && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-left text-sm text-amber-800">
            {t('Android asks once: turn on “Allow from this source” for MGM Mandir, then come back — the install continues.')}
          </p>
        )}
        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-left text-sm text-red-700">{error}</p>}
        <div className="flex flex-col gap-2">
          {stage === 'ready' || stage === 'installing' ? (
            <button onClick={() => install(apkPath)} disabled={stage === 'installing'} className="btn-primary w-full py-3 text-base disabled:opacity-60">
              <PackageCheck className="h-5 w-5" /> {t('Install update')}
            </button>
          ) : (
            <button onClick={startDownload} disabled={stage === 'downloading'} className="btn-primary w-full py-3 text-base disabled:opacity-60">
              <Download className="h-5 w-5" /> {stage === 'downloading' ? t('Downloading…') : t('Download update')}
            </button>
          )}
          {error && canUpdateInApp() && (
            <button onClick={() => downloadUpdate(update.url)} className="btn-ghost w-full text-sm">{t('Download in the browser instead')}</button>
          )}
          {!update.required && stage !== 'downloading' && (
            <button onClick={later} className="btn-ghost w-full">{t('Later')}</button>
          )}
        </div>
      </div>
    </Sheet>
  );
};

export default UpdatePrompt;
