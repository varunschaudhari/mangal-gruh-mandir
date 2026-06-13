import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import {
  issueCoupons, getDailySummary, getCoupons,
  lookupCoupon, redeemCoupon, printCoupons, getReport, getBatches,
  getMonthlyReport, getStaffReport, getWastageReport, getMahaprasadWhatsApp,
  reserveOffline, getTodayForOffline, syncOffline,
  getCashDrawer, setOpeningFloat, adjustDrawer, voidBatch,
} from '../controllers/mahaprasad.controller.js';

const router = Router();
router.use(protect);

router.post('/issue',              authorize('mahaprasad:issue'),  issueCoupons);
router.get('/summary',             authorize('mahaprasad:read'),   getDailySummary);
router.get('/coupons',             authorize('mahaprasad:read'),   getCoupons);
router.get('/lookup/:number',      authorize('mahaprasad:redeem'), lookupCoupon);
router.patch('/redeem/:number',    authorize('mahaprasad:redeem'), redeemCoupon);
router.get('/print',               authorize('mahaprasad:issue'),  printCoupons);
router.get('/report/monthly',      authorize('mahaprasad:read'),   getMonthlyReport);
router.get('/report/staff',        authorize('mahaprasad:read'),   getStaffReport);
router.get('/report/wastage',      authorize('mahaprasad:read'),   getWastageReport);
router.get('/report/whatsapp',     authorize('mahaprasad:read'),   getMahaprasadWhatsApp);
router.get('/report',              authorize('mahaprasad:read'),   getReport);
router.get('/batches',             authorize('mahaprasad:read'),   getBatches);

// Cash drawer
router.get('/cash-drawer',         authorize('mahaprasad:issue'),  getCashDrawer);
router.put('/cash-drawer/float',   authorize('mahaprasad:issue'),  setOpeningFloat);
router.patch('/cash-drawer/adjust',authorize('mahaprasad:issue'),  adjustDrawer);

router.patch('/batches/:batchId/void', authorize('mahaprasad:issue'), voidBatch);

// Offline support — static sub-routes must be before dynamic ones
router.post('/offline/reserve',    authorize('mahaprasad:issue'),  reserveOffline);
router.get('/offline/today',       authorize('mahaprasad:read'),   getTodayForOffline);
router.post('/offline/sync',       authorize('mahaprasad:issue'),  syncOffline);

export default router;
