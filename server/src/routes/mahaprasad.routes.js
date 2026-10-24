import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize, { authorizeAny } from '../middleware/authorize.js';
import validate from '../middleware/validate.js';
import * as v from '../validation/mahaprasad.schemas.js';
import {
  issueCoupons, getDailySummary, getCoupons,
  lookupCoupon, redeemCoupon, printCoupons, getReport, getBatches,
  getMonthlyReport, getStaffReport, getWastageReport, getVoidedReport, getMahaprasadWhatsApp,
  reserveOffline, getTodayForOffline, getRedeemCopy, syncOffline,
  getCashDrawer, setOpeningFloat, adjustDrawer, voidBatch, resendBatch,
} from '../controllers/mahaprasad.controller.js';
import { listOnlineOrders, onlinePosterPdf } from '../controllers/mahaprasadOnline.controller.js';
import { getDashboard, setTarget } from '../controllers/mahaprasadDashboard.controller.js';
import * as dash from '../validation/mahaprasadDashboard.schemas.js';

const router = Router();
router.use(protect);

router.post('/issue',              authorize('mahaprasad:issue'),  validate(v.issueCoupons), issueCoupons);
router.get('/summary',             authorize('mahaprasad:read'),   getDailySummary);
router.get('/coupons',             authorize('mahaprasad:read'),   getCoupons);
router.get('/lookup/:number',      authorize('mahaprasad:redeem'), validate(v.couponByNumber), lookupCoupon);
router.patch('/redeem/:number',    authorize('mahaprasad:redeem'), validate(v.couponByNumber), redeemCoupon);
router.get('/print',               authorize('mahaprasad:issue'),  printCoupons);
router.get('/report/monthly',      authorize('mahaprasad:read'),   getMonthlyReport);
router.get('/report/staff',        authorize('mahaprasad:read'),   getStaffReport);
router.get('/report/wastage',      authorize('mahaprasad:read'),   getWastageReport);
router.get('/report/voided',       authorize('mahaprasad:read'),   getVoidedReport);
router.get('/report/whatsapp',     authorize('mahaprasad:read'),   getMahaprasadWhatsApp);
router.get('/report',              authorize('mahaprasad:read'),   getReport);
router.get('/batches',             authorize('mahaprasad:read'),   getBatches);
// Coupons bought by devotees on the public page (Razorpay)
router.get('/online-orders',       authorize('mahaprasad:read'),   validate(v.onlineOrderList), listOnlineOrders);
router.get('/online-poster.pdf',   authorize('mahaprasad:read'),   onlinePosterPdf);   // QR to the public page, to print
// Dashboard and TV screen: prasad given against the day's total; admins (who can change
// Settings) set the totals
router.get('/dashboard',           authorize('mahaprasad:read'),   validate(dash.getDashboard), getDashboard);
router.put('/dashboard/target',    authorize('masters:write'),     validate(dash.setTarget), setTarget);

// Cash drawer
router.get('/cash-drawer',         authorize('mahaprasad:issue'),  getCashDrawer);
router.put('/cash-drawer/float',   authorize('mahaprasad:issue'),  validate(v.setOpeningFloat), setOpeningFloat);
router.patch('/cash-drawer/adjust',authorize('mahaprasad:issue'),  validate(v.adjustDrawer), adjustDrawer);

router.patch('/batches/:batchId/void', authorize('mahaprasad:issue'), validate(v.voidBatch), voidBatch);
router.post('/batches/:batchId/send', authorize('mahaprasad:issue'), validate(v.batchById), resendBatch);

// Offline support — static sub-routes must be before dynamic ones
router.post('/offline/reserve',    authorize('mahaprasad:issue'),  validate(v.reserveOffline), reserveOffline);
router.get('/offline/today',       authorize('mahaprasad:read'),   getTodayForOffline);
router.get('/offline/redeem-copy', authorize('mahaprasad:redeem'), getRedeemCopy);
// The food counter sends its offline redemptions; only the issue counter can send offline sales
router.post('/offline/sync',       authorizeAny('mahaprasad:issue', 'mahaprasad:redeem'), validate(v.syncOffline), syncOffline);

export default router;
