import crypto from 'crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  // Sign-in attempts per IP. CI raises it: its check scripts sign in as several test users.
  max: Number(process.env.LOGIN_RATE_LIMIT) || 10,
  message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

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
