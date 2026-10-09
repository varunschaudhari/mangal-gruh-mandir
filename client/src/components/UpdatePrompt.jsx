import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { Download, Sparkles } from 'lucide-react';
import Sheet from './ui/Sheet.jsx';
import { checkForUpdate, downloadUpdate } from '../utils/appUpdate.js';
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

// Android app only: offers (or, below minVersionCode, requires) the newer build published
// on our server. See utils/appUpdate.js.
const UpdatePrompt = () => {
  const [update, setUpdate] = useState(null);
  const lastCheck = useRef(0);
  const t = useT();

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
    const handle = App.addListener('appStateChange', ({ isActive }) => { if (isActive) check(); });
    return () => { handle.then((h) => h.remove()); };
  }, [check]);

  if (!update) return null;

  const later = () => {
    try { localStorage.setItem(SNOOZE_KEY, JSON.stringify({ versionCode: update.versionCode, at: Date.now() })); } catch { /* ignore */ }
    setUpdate(null);
  };

  return (
    <Sheet open onClose={update.required ? () => {} : later} size="sm">
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
        <p className="text-xs text-gray-400">
          {t('Tap Download, then open the downloaded file to install. Your data and login stay as they are.')}
        </p>
        <div className="flex flex-col gap-2">
          <button onClick={() => downloadUpdate(update.url)} className="btn-primary w-full py-3 text-base">
            <Download className="h-5 w-5" /> {t('Download update')}
          </button>
          {!update.required && (
            <button onClick={later} className="btn-ghost w-full">{t('Later')}</button>
          )}
        </div>
      </div>
    </Sheet>
  );
};

export default UpdatePrompt;
