import { Router } from 'express';
import { login, refreshToken, logout, getMe, updateProfile, changePassword } from '../controllers/auth.controller.js';
import protect from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/login', loginLimiter, login);
router.post('/refresh', refreshToken);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.put('/change-password', protect, changePassword);

export default router;
