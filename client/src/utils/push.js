import { FirebaseMessaging, Importance } from '@capacitor-firebase/messaging';
import api from '../api/axios.js';
import { isNative, platform } from './platform.js';

// Push notifications (Firebase Cloud Messaging) for the mobile apps.
// Off until Firebase is set up for the app build — google-services.json (Android) /
// GoogleService-Info.plist (iOS) added and VITE_PUSH_ENABLED=true in .env.mobile (MOBILE.md).
export const pushAvailable = isNative && import.meta.env.VITE_PUSH_ENABLED === 'true';

const TOKEN_KEY = 'mgm-push-token';

const saveToken = async (token) => {
  await api.post('/devices', { token, platform });
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
};

/**
 * Ask for permission, register this phone for the signed-in user and listen for taps.
 * @param {(url: string) => void} onOpen        tapped notification → app route to open
 * @param {(n: {title?: string, body?: string, data?: any}) => void} onForeground  arrived while the app is open
 * @returns {Promise<() => void>} cleanup
 */
export async function registerPush({ onOpen, onForeground }) {
  if (!pushAvailable) return () => {};

  const { receive } = await FirebaseMessaging.requestPermissions();
  if (receive !== 'granted') return () => {};

  if (platform === 'android') {
    // Matches channelId in server/src/services/push.service.js
    await FirebaseMessaging.createChannel({
      id: 'alerts', name: 'Alerts', description: 'Approvals and stock alerts', importance: Importance.High,
    });
  }

  const { token } = await FirebaseMessaging.getToken();
  await saveToken(token);

  const handles = await Promise.all([
    FirebaseMessaging.addListener('tokenReceived', ({ token: fresh }) => { saveToken(fresh).catch(() => {}); }),
    FirebaseMessaging.addListener('notificationActionPerformed', ({ notification }) => {
      const url = notification?.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) onOpen(url);
    }),
    FirebaseMessaging.addListener('notificationReceived', ({ notification }) => onForeground?.(notification)),
  ]);
  return () => handles.forEach((h) => h.remove());
}

// Called on sign-out (while still signed in) so this phone stops getting that user's alerts.
export async function unregisterPush() {
  let token = null;
  try { token = localStorage.getItem(TOKEN_KEY); } catch { /* ignore */ }
  if (!pushAvailable || !token) return;
  try { await api.delete(`/devices/${encodeURIComponent(token)}`); } catch { /* best effort */ }
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}
