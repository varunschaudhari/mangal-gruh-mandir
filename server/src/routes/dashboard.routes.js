import { Router } from 'express';
import protect from '../middleware/auth.js';
import { getDashboardStats } from '../controllers/dashboard.controller.js';

const router = Router();

router.get('/', protect, getDashboardStats);

export default router;
