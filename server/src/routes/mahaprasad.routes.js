import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import {
  issueCoupons, getDailySummary, getCoupons,
  lookupCoupon, redeemCoupon, printCoupons, getReport, getBatches,
  getMonthlyReport, getStaffReport, getWastageReport,
  reserveOffline, getTodayForOffline, syncOffline,
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
router.get('/report',              authorize('mahaprasad:read'),   getReport);
router.get('/batches',             authorize('mahaprasad:read'),   getBatches);

// Offline support — static sub-routes must be before dynamic ones
router.post('/offline/reserve',    authorize('mahaprasad:issue'),  reserveOffline);
router.get('/offline/today',       authorize('mahaprasad:read'),   getTodayForOffline);
router.post('/offline/sync',       authorize('mahaprasad:issue'),  syncOffline);

export default router;
