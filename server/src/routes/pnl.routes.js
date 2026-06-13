import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import { getPnL, getPnLTrend, exportPnLPdf } from '../controllers/pnl.controller.js';

const router = Router();
router.use(protect);
router.use(authorize('payments:read'));

router.get('/',           getPnL);
router.get('/trend',      getPnLTrend);
router.get('/export/pdf', exportPnLPdf);

export default router;
