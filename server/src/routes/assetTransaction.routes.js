import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import {
  getTransactions, getTransaction, getTransactionCounts,
  createBorrowRequest, checkoutAsset, returnAsset, extendBorrow, cancelBorrow,
  bulkSendReminders, sendManualReminderEndpoint, getAvailability,
} from '../controllers/assetTransaction.controller.js';

const router = Router();
router.use(protect);

router.get('/availability', authorize('assets:manage'), getAvailability);
router.get('/counts',      authorize('assets:read'),   getTransactionCounts);

router.route('/')
  .get(authorize('assets:read'),    getTransactions)
  .post(authorize('assets:manage'), createBorrowRequest);

router.route('/:id')
  .get(authorize('assets:read'), getTransaction);

router.patch('/:id/checkout',       authorize('assets:manage'), checkoutAsset);
router.patch('/:id/return',         authorize('assets:manage'), returnAsset);
router.patch('/:id/extend',         authorize('assets:manage'), extendBorrow);
router.patch('/:id/cancel',         authorize('assets:manage'), cancelBorrow);
router.post('/:id/send-reminder',   authorize('assets:manage'), sendManualReminderEndpoint);
router.post('/bulk-remind',         authorize('assets:manage'), bulkSendReminders);

export default router;
