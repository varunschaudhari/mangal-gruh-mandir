import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import { getSettings, updateSettings, testWhatsApp } from '../controllers/settings.controller.js';

const router = Router();
router.use(protect);

router.get('/',                authorize('masters:read'),  getSettings);
router.put('/',                authorize('masters:write'), updateSettings);
router.post('/test-whatsapp',  authorize('masters:write'), testWhatsApp);

export default router;
