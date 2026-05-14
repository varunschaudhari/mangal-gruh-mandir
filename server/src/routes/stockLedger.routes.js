import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import { getLedger } from '../controllers/stockLedger.controller.js';

const router = Router();

router.use(protect);
router.get('/', authorize('transactions:read'), getLedger);

export default router;
