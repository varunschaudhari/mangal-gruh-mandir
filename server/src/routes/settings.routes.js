import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import { getSettings, updateSettings } from '../controllers/settings.controller.js';

const router = Router();
router.use(protect);

router.get('/',  authorize('masters:read'),  getSettings);
router.put('/',  authorize('masters:write'), updateSettings);

export default router;
