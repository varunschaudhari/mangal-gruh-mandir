import crypto from 'crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// Sign-in protection against password guessing. Only WRONG passwords count (a correct sign-in
// never does), and per account on each connection: all the temple's counters share one internet
// connection, so one person's typos must not lock everyone else out.
const loginKey = (req) => `${ipKeyGenerator(req.ip)}|${String(req.body?.email || '').trim().toLowerCase()}`;

const accountLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.LOGIN_RATE_LIMIT) || 10, // wrong passwords per account per connection
  keyGenerator: loginKey,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many wrong passwords for this account. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Someone trying many different accounts from one connection.
const connectionLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // wrong passwords per connection, all accounts together
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many wrong passwords from this connection. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const loginLimiter = [connectionLoginLimiter, accountLoginLimiter];

// Signed-in requests are counted per session, not per IP: all the temple's counters share
// one internet connection, and on a busy Tuesday they'd otherwise share one limit.
const sessionOrIpKey = (req) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ') && auth.length > 20) {
    return `t:${crypto.createHash('sha256').update(auth.slice(7)).digest('hex').slice(0, 32)}`;
  }
  return ipKeyGenerator(req.ip);
};

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  keyGenerator: sessionOrIpKey,
  message: { success: false, message: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// The biometric machine endpoint (/iclock, no sign-in): a machine polls every ~10 s and sends
// punches in batches, so a few requests a minute is normal. Anything far above that from one
// address is someone else — refused before the request body is even read.
export const deviceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.DEVICE_RATE_LIMIT) || 120,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  handler: (req, res) => res.status(429).type('text/plain').send('Too many requests'),
  standardHeaders: false,
  legacyHeaders: false,
});
