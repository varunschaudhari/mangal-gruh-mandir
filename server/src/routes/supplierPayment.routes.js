import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import {
  getPayments, getPayment, getPaymentCounts, getPaymentDashboardSummary,
  createPayment, approvePayment, rejectPayment, resubmitPayment, bulkApprovePayments,
  voidPayment, exportPayments, getSupplierAging, getPaymentVoucher,
  getSupplierInvoices, getSupplierLedger, getSupplierOutstanding,
  getInvoiceRegister, getUpcomingDues, getSupplierAdvances,
} from '../controllers/supplierPayment.controller.js';

const router = Router();
router.use(protect);

// Sub-resource lookups (must come before /:id to avoid route conflicts)
router.get('/counts',            authorize('payments:read'), getPaymentCounts);
router.get('/dashboard-summary', authorize('payments:read'), getPaymentDashboardSummary);
router.get('/export',                   authorize('payments:read'),    exportPayments);
router.get('/aging',                    authorize('payments:read'),    getSupplierAging);
router.get('/upcoming-dues',            authorize('payments:read'),    getUpcomingDues);
router.get('/invoice-register',         authorize('payments:read'),    getInvoiceRegister);
router.get('/invoices/:supplierId',     authorize('payments:read'),    getSupplierInvoices);
router.get('/ledger/:supplierId',       authorize('payments:read'),    getSupplierLedger);
router.get('/outstanding/:supplierId',  authorize('payments:read'),    getSupplierOutstanding);
router.get('/advances/:supplierId',     authorize('payments:read'),    getSupplierAdvances);
router.post('/bulk-approve',            authorize('payments:approve'), bulkApprovePayments);

router.route('/')
  .get(authorize('payments:read'),   getPayments)
  .post(authorize('payments:write'), createPayment);

router.route('/:id')
  .get(authorize('payments:read'), getPayment);

router.patch('/:id/approve',    authorize('payments:approve'), approvePayment);
router.patch('/:id/reject',     authorize('payments:approve'), rejectPayment);
router.patch('/:id/resubmit',   authorize('payments:write'),   resubmitPayment);
router.patch('/:id/void',       authorize('payments:approve'), voidPayment);
router.get('/:id/voucher',      authorize('payments:read'),    getPaymentVoucher);

export default router;
