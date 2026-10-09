import crypto from 'crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import ClientError from '../models/ClientError.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { logger } from '../utils/logger.js';

// Crash reports from the apps (client/src/utils/errorReporter.js), so admins can see what
// broke without users having to describe it. Self-hosted — nothing leaves this server.
const router = Router();

const clip = (v, n) => String(v ?? '').slice(0, n);

// Reports can arrive before sign-in, so auth is optional; a valid token just records who.
const userIdFrom = (req) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return undefined;
  try { return jwt.verify(header.slice(7), process.env.JWT_SECRET).id; } catch { return undefined; }
};

// Same message + the first lines of the stack = the same bug.
const fingerprintOf = (message, stack) => crypto.createHash('sha1')
  .update(`${message}\n${stack.split('\n').slice(0, 4).join('\n')}`)
  .digest('hex');

const reportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many error reports' },
});

// POST /client-errors  { message, stack, source, path, app, appVersion }
router.post('/', reportLimiter, asyncHandler(async (req, res) => {
  const message = clip(req.body?.message, 500).trim();
  if (!message) throw new ApiError(400, 'message is required');
  const stack = clip(req.body?.stack, 4000);
  const fingerprint = fingerprintOf(message, stack);
  const app = ['web', 'android', 'ios', 'electron'].includes(req.body?.app) ? req.body.app : 'web';
  const source = ['screen', 'script', 'promise'].includes(req.body?.source) ? req.body.source : 'script';
  const now = new Date();

  const doc = await ClientError.findOneAndUpdate(
    { fingerprint },
    {
      $setOnInsert: { fingerprint, message, stack, source, firstSeenAt: now },
      $set: {
        path: clip(req.body?.path, 300),
        app,
        appVersion: clip(req.body?.appVersion, 50),
        userAgent: clip(req.get('user-agent'), 300),
        lastUser: userIdFrom(req),
        lastSeenAt: now,
      },
      $inc: { count: 1 },
    },
    { upsert: true, returnDocument: 'after' },
  );
  if (doc.count === 1) logger.error('New app error', { app, path: doc.path, message });
  res.status(201).json(new ApiResponse(201, null, 'Reported'));
}));

// GET /client-errors — most recent first (admins)
router.get('/', protect, authorize('users:read'), asyncHandler(async (req, res) => {
  const errors = await ClientError.find({})
    .sort({ lastSeenAt: -1 })
    .limit(200)
    .populate('lastUser', 'name email')
    .lean();
  res.json(new ApiResponse(200, errors));
}));

// DELETE /client-errors/:id — mark as fixed (it reappears if it happens again)
router.delete('/:id', protect, authorize('users:write'), asyncHandler(async (req, res) => {
  await ClientError.findByIdAndDelete(req.params.id);
  res.json(new ApiResponse(200, null, 'Resolved'));
}));

export default router;
