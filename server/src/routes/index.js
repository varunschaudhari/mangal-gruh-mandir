import { Router } from 'express';
import { apiLimiter, onlineOrderLimiter } from '../middleware/rateLimiter.js';
import validate from '../middleware/validate.js';
import * as mahaprasadSchemas from '../validation/mahaprasad.schemas.js';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import departmentRoutes from './department.routes.js';
import categoryRoutes from './category.routes.js';
import unitRoutes from './unit.routes.js';
import productRoutes from './product.routes.js';
import supplierRoutes from './supplier.routes.js';
import stockTransactionRoutes from './stockTransaction.routes.js';
import stockBalanceRoutes from './stockBalance.routes.js';
import stockLedgerRoutes from './stockLedger.routes.js';
import reportRoutes from './report.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import roleRoutes from './role.routes.js';
import stockBatchRoutes from './stockBatch.routes.js';
import assetRoutes from './asset.routes.js';
import borrowGroupRoutes from './borrowGroup.routes.js';
import donationRoutes from './donation.routes.js';
import donationOccasionRoutes from './donationOccasion.routes.js';
import assetTransactionRoutes from './assetTransaction.routes.js';
import assetReportRoutes from './assetReport.routes.js';
import settingsRoutes from './settings.routes.js';
import supplierPaymentRoutes from './supplierPayment.routes.js';
import paymentTemplateRoutes from './paymentTemplate.routes.js';
import mahaprasadRoutes from './mahaprasad.routes.js';
import mahaprasadOccasionRoutes from './mahaprasadOccasion.routes.js';
import auditLogRoutes from './auditLog.routes.js';
import purchaseEntryRoutes from './purchaseEntry.routes.js';
import assetUnitRoutes from './assetUnit.routes.js';
import expenseRoutes from './expense.routes.js';
import budgetRoutes from './budget.routes.js';
import pnlRoutes from './pnl.routes.js';
import deviceRoutes from './device.routes.js';
import clientErrorRoutes from './clientError.routes.js';
import attendanceRoutes from './attendance.routes.js';
import salaryRoutes from './salary.routes.js';
import pincodeRoutes from './pincode.routes.js';
import { bookingRouter, bookingSetupRouter, bookingShiftRouter } from './booking.routes.js';
import { publicReceipt, publicSlip } from '../controllers/booking.controller.js';
import { publicCoupons, publicCouponsImage } from '../controllers/mahaprasad.controller.js';
import {
  getOnlineInfo, createOnlineOrder, getOnlineOrder, verifyOnlineOrder, onlineReceiptPdf,
} from '../controllers/mahaprasadOnline.controller.js';

const router = Router();

router.use(apiLimiter);

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/departments', departmentRoutes);
router.use('/categories', categoryRoutes);
router.use('/units', unitRoutes);
router.use('/products', productRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/transactions', stockTransactionRoutes);
router.use('/balances', stockBalanceRoutes);
router.use('/ledger', stockLedgerRoutes);
router.use('/reports', reportRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/roles', roleRoutes);
router.use('/batches', stockBatchRoutes);
router.use('/assets', assetRoutes);
router.use('/borrow-groups', borrowGroupRoutes);
router.use('/donations', donationRoutes);
router.use('/donation-occasions', donationOccasionRoutes);
router.use('/asset-transactions', assetTransactionRoutes);
router.use('/asset-reports', assetReportRoutes);
router.use('/settings', settingsRoutes);
router.use('/supplier-payments',   supplierPaymentRoutes);
router.use('/payment-templates',   paymentTemplateRoutes);
router.use('/mahaprasad',           mahaprasadRoutes);
router.use('/mahaprasad-occasions', mahaprasadOccasionRoutes);
router.use('/audit-logs',          auditLogRoutes);
router.use('/purchase-entries',    purchaseEntryRoutes);
router.use('/asset-units',         assetUnitRoutes);
router.use('/expenses',            expenseRoutes);
router.use('/budgets',             budgetRoutes);
router.use('/pnl',                 pnlRoutes);
router.use('/devices',             deviceRoutes);
router.use('/client-errors',       clientErrorRoutes);
router.use('/attendance',          attendanceRoutes);
router.use('/salary',              salaryRoutes);
router.use('/pincode',             pincodeRoutes);
router.use('/bookings',            bookingRouter);
router.use('/booking-setup',       bookingSetupRouter);
router.use('/booking-shifts',      bookingShiftRouter);
// No sign-in: the receipt link sent to devotees on WhatsApp / SMS
router.get('/public/receipts/:token', publicReceipt);
router.get('/public/receipts/:token/slip.png', publicSlip);
// …and the Mahaprasad coupon page link (the coupon QRs to show at the food counter)
router.get('/public/mahaprasad/:token', publicCoupons);
router.get('/public/mahaprasad/:token/qr.png', publicCouponsImage);
router.get('/public/mahaprasad/:token/receipt.pdf', onlineReceiptPdf);   // coupons bought online only
// …and devotees buying Mahaprasad coupons online (the /prasad page, paid through Razorpay)
router.get('/public/mahaprasad-online', getOnlineInfo);
router.post('/public/mahaprasad-online/orders', onlineOrderLimiter, validate(mahaprasadSchemas.onlineOrder), createOnlineOrder);
router.get('/public/mahaprasad-online/orders/:token', validate(mahaprasadSchemas.onlineOrderByToken), getOnlineOrder);
router.post('/public/mahaprasad-online/orders/:token/verify', validate(mahaprasadSchemas.onlineVerify), verifyOnlineOrder);

export default router;
