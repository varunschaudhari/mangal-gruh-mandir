import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { isNative } from './platform.js';

// Native haptics in the Capacitor apps; navigator.vibrate fallback in Android browsers.
// iOS Safari has no vibration API, so the web fallback silently no-ops there.
const run = (nativeFn, webPattern) => {
  try {
    if (isNative) nativeFn().catch(() => {});
    else if (webPattern) navigator.vibrate?.(webPattern);
  } catch { /* haptics are best-effort */ }
};

const haptics = {
  tap:     () => run(() => Haptics.impact({ style: ImpactStyle.Light })),
  select:  () => run(() => Haptics.selectionChanged()),
  success: (webPattern = 80)          => run(() => Haptics.notification({ type: NotificationType.Success }), webPattern),
  warning: (webPattern = [55, 55, 55]) => run(() => Haptics.notification({ type: NotificationType.Warning }), webPattern),
  error:   (webPattern = 200)         => run(() => Haptics.notification({ type: NotificationType.Error }), webPattern),
};

export default haptics;
