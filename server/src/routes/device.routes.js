import { Router } from 'express';
import protect from '../middleware/auth.js';
import DeviceToken from '../models/DeviceToken.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';

// Mobile app push-notification registration (see services/push.service.js).
const router = Router();
router.use(protect);

// POST /devices  { token, platform } — called by the app after sign-in
router.post('/', asyncHandler(async (req, res) => {
  const { token, platform } = req.body;
  if (!token || typeof token !== 'string') throw new ApiError(400, 'token is required');
  if (!['android', 'ios'].includes(platform)) throw new ApiError(400, 'platform must be android or ios');

  await DeviceToken.findOneAndUpdate(
    { token },
    { user: req.user._id, platform, lastSeenAt: new Date() },
    { upsert: true },
  );
  res.json(new ApiResponse(200, null, 'Device registered'));
}));

// DELETE /devices/:token — called on sign-out so the phone stops getting this user's alerts
router.delete('/:token', asyncHandler(async (req, res) => {
  await DeviceToken.deleteOne({ token: req.params.token, user: req.user._id });
  res.json(new ApiResponse(200, null, 'Device removed'));
}));

export default router;
