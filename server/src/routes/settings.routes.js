import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import validate from '../middleware/validate.js';
import * as v from '../validation/admin.schemas.js';
import { getSettings, updateSettings, testWhatsApp } from '../controllers/settings.controller.js';
import { temple } from '../services/temple.service.js';
import ApiResponse from '../utils/ApiResponse.js';

const router = Router();

// Name and contact details for the app's header, sign-in page, receipts and slips. Public: it is
// printed on every receipt anyway, and the sign-in page shows it before anyone signs in.
router.get('/temple', (req, res) => res.json(new ApiResponse(200, temple())));

router.use(protect);

router.get('/',                authorize('masters:read'),  getSettings);
router.put('/',                authorize('masters:write'), validate(v.updateSettings), updateSettings);
router.post('/test-whatsapp',  authorize('masters:write'), validate(v.testWhatsApp), testWhatsApp);

export default router;
