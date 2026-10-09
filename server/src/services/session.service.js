import crypto from 'crypto';
import mongoose from 'mongoose';
import Session from '../models/Session.js';

// Sign-in sessions, one per device, so signing in on a phone doesn't sign the same person
// out of the browser (the old single User.refreshToken did exactly that).
//
//   web / desktop: fixed 7 days from sign-in (JWT_REFRESH_EXPIRES_IN), as before.
//   mobile app:    rolling — every refresh pushes expiry to now + SESSION_DAYS_APP (default 90),
//                  so people who use the app regularly never have to sign in again. The app
//                  can additionally be locked with fingerprint / phone PIN.

const DAY = 24 * 60 * 60 * 1000;

const parseDays = (value, fallback) => {
  const m = String(value || '').match(/^(\d+)\s*d$/i);
  return m ? Number(m[1]) : fallback;
};

const lifetimeMs = (client) => (client === 'app'
  ? Number(process.env.SESSION_DAYS_APP || 90) * DAY
  : parseDays(process.env.JWT_REFRESH_EXPIRES_IN, 7) * DAY);

const hash = (secret) => crypto.createHash('sha256').update(secret).digest('hex');

/** Starts a session and returns { session, refreshToken }. */
export async function createSession(userId, { client = 'web', userAgent = '' } = {}) {
  const secret = crypto.randomBytes(32).toString('base64url');
  const session = await Session.create({
    user: userId,
    secretHash: hash(secret),
    client: client === 'app' ? 'app' : 'web',
    userAgent: String(userAgent).slice(0, 300),
    expiresAt: new Date(Date.now() + lifetimeMs(client)),
  });
  return { session, refreshToken: `${session._id}.${secret}` };
}

// New-style refresh tokens are "<24-hex session id>.<secret>"; legacy ones are JWTs.
export const isSessionToken = (token) => /^[a-f0-9]{24}\.[A-Za-z0-9_-]+$/.test(token || '');

/** Valid session for a refresh token (and extends app sessions), or null. */
export async function useSession(refreshToken) {
  if (!isSessionToken(refreshToken)) return null;
  const [id, secret] = refreshToken.split('.');
  if (!mongoose.isValidObjectId(id)) return null;

  const session = await Session.findById(id);
  if (!session || session.expiresAt <= new Date()) return null;

  const a = Buffer.from(session.secretHash, 'hex');
  const b = Buffer.from(hash(secret), 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  session.lastUsedAt = new Date();
  if (session.client === 'app') session.expiresAt = new Date(Date.now() + lifetimeMs('app'));
  await session.save();
  return session;
}

export const endSession = (sessionId) => (sessionId && mongoose.isValidObjectId(sessionId)
  ? Session.deleteOne({ _id: sessionId })
  : Promise.resolve());

/** Signs the user out everywhere (optionally except one session, e.g. the current device). */
export const endAllSessions = (userId, { exceptSessionId } = {}) => Session.deleteMany({
  user: userId,
  ...(exceptSessionId && mongoose.isValidObjectId(exceptSessionId) ? { _id: { $ne: exceptSessionId } } : {}),
});
