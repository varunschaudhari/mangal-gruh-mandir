import admin from 'firebase-admin';
import DeviceToken from '../models/DeviceToken.js';
import Role from '../models/Role.js';
import User from '../models/User.js';
import { logger } from '../utils/logger.js';

// Push notifications to the mobile apps via Firebase Cloud Messaging.
//
// Off until FIREBASE_SERVICE_ACCOUNT is set in server/.env — the service-account JSON
// from Firebase console → Project settings → Service accounts, either raw or base64-encoded.
// Every send is fire-and-forget: a push problem must never fail the request that caused it.

let messaging = null;
let initDone = false;

function getMessaging() {
  if (initDone) return messaging;
  initDone = true;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    logger.info('Push notifications off (FIREBASE_SERVICE_ACCOUNT not set)');
    return null;
  }
  try {
    const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
    messaging = admin.messaging();
    logger.info('Push notifications on');
  } catch (err) {
    logger.error('Push notifications off — FIREBASE_SERVICE_ACCOUNT is invalid', { error: err.message });
  }
  return messaging;
}

export const pushEnabled = () => Boolean(getMessaging());

// Errors that mean the token will never work again (app uninstalled, data cleared…).
const DEAD_TOKEN = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * Send a notification to every device of the given users.
 * @param {Array} userIds
 * @param {{ title: string, body: string, url?: string }} message  url = app route opened on tap
 */
export async function sendToUsers(userIds, { title, body, url }) {
  try {
    const fcm = getMessaging();
    if (!fcm || !userIds?.length) return;

    const devices = await DeviceToken.find({ user: { $in: userIds } }).select('token').lean();
    const tokens = devices.map((d) => d.token);
    if (!tokens.length) return;

    const res = await fcm.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: url ? { url } : {},
      android: {
        priority: 'high',
        notification: { channelId: 'alerts', icon: 'ic_stat_notify', color: '#EA580C' },
      },
      apns: { payload: { aps: { sound: 'default' } } },
    });

    const dead = res.responses
      .map((r, i) => (!r.success && DEAD_TOKEN.has(r.error?.code) ? tokens[i] : null))
      .filter(Boolean);
    if (dead.length) await DeviceToken.deleteMany({ token: { $in: dead } });
    logger.info('Push sent', { title, sent: res.successCount, failed: res.failureCount, removed: dead.length });
  } catch (err) {
    logger.error('Push failed', { title, error: err.message });
  }
}

// Active users whose role grants `permission` (directly or via '*'), minus `exceptUserId`.
export async function usersWithPermission(permission, { exceptUserId } = {}) {
  const roles = await Role.find({ isActive: true, permissions: { $in: [permission, '*'] } }).select('slug').lean();
  const users = await User.find({ role: { $in: roles.map((r) => r.slug) }, isActive: true }).select('_id').lean();
  return users.map((u) => u._id).filter((id) => String(id) !== String(exceptUserId || ''));
}

export async function sendToPermission(permission, message, options) {
  try {
    if (!pushEnabled()) return;
    await sendToUsers(await usersWithPermission(permission, options), message);
  } catch (err) {
    logger.error('Push failed', { title: message.title, error: err.message });
  }
}
