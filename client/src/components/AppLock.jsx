import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { Fingerprint, Lock, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import Sheet from './ui/Sheet.jsx';
import {
  isLockEnabled, setLockEnabled, lockOffered, markLockOffered, lockSupport, unlockWithDevice,
} from '../utils/appLock.js';
import { isNative } from '../utils/platform.js';
import haptics from '../utils/haptics.js';
import { useT } from '../i18n/index.jsx';

const LOCK_AFTER_MS = 60 * 1000; // lock again after a minute in the background

// Mobile app only. Covers the app until the user unlocks with fingerprint / phone PIN,
// on launch and after time away. Also offers to turn the lock on after the first sign-in.
const AppLock = () => {
  const { user, logout } = useAuth();
  const t = useT();
  const [locked, setLocked] = useState(() => Boolean(user) && isLockEnabled());
  const [offer, setOffer] = useState(null); // { label } while showing the "turn on?" sheet
  const prompting = useRef(false);
  const hiddenAt = useRef(0);

  const unlock = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    try {
      await unlockWithDevice();
      haptics.success();
      setLocked(false);
    } catch { /* cancelled — stay on the lock screen */ } finally {
      prompting.current = false;
    }
  }, []);

  // Lock when coming back after a while.
  useEffect(() => {
    if (!isNative) return undefined;
    const handle = App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) { hiddenAt.current = Date.now(); return; }
      if (user && isLockEnabled() && !prompting.current && Date.now() - hiddenAt.current > LOCK_AFTER_MS) setLocked(true);
    });
    return () => { handle.then((h) => h.remove()); };
  }, [user]);

  // Ask straight away when the lock screen appears.
  useEffect(() => { if (locked) unlock(); }, [locked, unlock]);

  // Signed out → nothing to protect.
  useEffect(() => { if (!user) setLocked(false); }, [user]);

  // First sign-in on this phone: offer the lock once.
  useEffect(() => {
    if (!isNative || !user || isLockEnabled() || lockOffered()) return;
    lockSupport().then((s) => { if (s.available) setOffer(s); else markLockOffered(); });
  }, [user]);

  const answerOffer = async (turnOn) => {
    markLockOffered();
    setOffer(null);
    if (!turnOn) return;
    try {
      await unlockWithDevice(); // confirm it works before relying on it
      setLockEnabled(true);
      haptics.success();
    } catch { /* cancelled — leave it off; it can be turned on from the profile page */ }
  };

  if (locked) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gradient-to-b from-orange-50 to-amber-100 px-8 pt-safe pb-safe text-center">
        <img src="/logo.png" alt="" className="mb-6 h-20 w-20 rounded-2xl bg-white object-contain p-2 shadow-lg" />
        <Lock className="mb-2 h-6 w-6 text-gray-500" />
        <h1 className="text-lg font-bold text-gray-900">{t('MGM Mandir is locked')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('Signed in as {name}', { name: user?.name })}</p>
        <button onClick={unlock} className="btn-primary mt-8 w-full max-w-xs py-3 text-base">
          <Fingerprint className="h-5 w-5" /> {t('Unlock')}
        </button>
        <button onClick={() => { setLocked(false); logout(); }} className="btn-ghost mt-3 text-sm text-gray-500">
          <LogOut className="h-4 w-4" /> {t('Sign out')}
        </button>
      </div>
    );
  }

  return (
    <Sheet open={Boolean(offer)} onClose={() => answerOffer(false)} size="sm">
      <div className="space-y-4 pt-2 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
          <Fingerprint className="h-7 w-7" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-gray-900">{t('Lock the app with your {method}?', { method: t(offer?.label) })}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {t("You'll stay signed in on this phone. When you open the app, it asks for your {method} so nobody else can use it.", { method: t(offer?.label) })}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={() => answerOffer(true)} className="btn-primary w-full py-3 text-base">{t('Turn on')}</button>
          <button onClick={() => answerOffer(false)} className="btn-ghost w-full">{t('Not now')}</button>
        </div>
      </div>
    </Sheet>
  );
};

export default AppLock;
