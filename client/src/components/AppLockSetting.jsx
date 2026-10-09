import { useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import toast from 'react-hot-toast';
import { isLockEnabled, setLockEnabled, lockSupport, unlockWithDevice } from '../utils/appLock.js';
import { isNative } from '../utils/platform.js';
import { useT } from '../i18n/index.jsx';

// Profile page switch for the mobile app lock (see components/AppLock.jsx).
const AppLockSetting = () => {
  const [enabled, setEnabled] = useState(isLockEnabled);
  const [support, setSupport] = useState(null);
  const t = useT();

  useEffect(() => { if (isNative) lockSupport().then(setSupport); }, []);

  if (!isNative || !support) return null;

  const toggle = async () => {
    if (enabled) {
      setLockEnabled(false);
      setEnabled(false);
      return;
    }
    try {
      await unlockWithDevice(); // make sure it works on this phone before turning it on
      setLockEnabled(true);
      setEnabled(true);
      toast.success(t('App lock on'));
    } catch { /* cancelled */ }
  };

  return (
    <div className="card mt-4 flex items-center gap-4 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
        <Fingerprint className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-900">{t('App lock')}</p>
        <p className="text-sm text-gray-500">
          {support.available
            ? t('Ask for your {method} when the app opens', { method: t(support.label) })
            : t('Set a screen lock on this phone to use this')}
        </p>
      </div>
      <button
        role="switch"
        aria-checked={enabled}
        aria-label={t('App lock')}
        disabled={!support.available}
        onClick={toggle}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${enabled ? 'bg-primary-600' : 'bg-gray-300'}`}
      >
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
};

export default AppLockSetting;
