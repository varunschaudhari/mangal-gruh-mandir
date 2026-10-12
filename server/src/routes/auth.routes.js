import { Router } from 'express';
import { login, refreshToken, logout, getMe, updateProfile, changePassword } from '../controllers/auth.controller.js';
import protect from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rateLimiter.js';
import validate from '../middleware/validate.js';
import * as v from '../validation/admin.schemas.js';

const router = Router();

router.post('/login', loginLimiter, validate(v.login), login);
router.post('/refresh', refreshToken);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.put('/profile', protect, validate(v.updateProfile), updateProfile);
router.put('/change-password', protect, validate(v.changePassword), changePassword);

export default router;
