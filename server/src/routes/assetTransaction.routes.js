import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import validate from '../middleware/validate.js';
import * as v from '../validation/assets.schemas.js';
import {
  getTransactions, getTransaction, getTransactionCounts,
  createBorrowRequest, checkoutAsset, returnAsset, extendBorrow, cancelBorrow,
  markLost, settleFine, updateDamageStatus,
  bulkSendReminders, sendManualReminderEndpoint, getAvailability,
} from '../controllers/assetTransaction.controller.js';

const router = Router();
router.use(protect);

router.get('/availability', authorize('assets:manage'), getAvailability);
router.get('/counts',      authorize('assets:read'),   getTransactionCounts);

router.route('/')
  .get(authorize('assets:read'),    getTransactions)
  .post(authorize('assets:manage'), validate(v.createBorrowRequest), createBorrowRequest);

router.route('/:id')
  .get(authorize('assets:read'), validate(v.borrowById), getTransaction);

router.patch('/:id/checkout',       authorize('assets:manage'), validate(v.checkout), checkoutAsset);
router.patch('/:id/return',         authorize('assets:manage'), validate(v.returnAsset), returnAsset);
router.patch('/:id/extend',         authorize('assets:manage'), validate(v.extend), extendBorrow);
router.patch('/:id/cancel',         authorize('assets:manage'), validate(v.cancel), cancelBorrow);
router.patch('/:id/mark-lost',      authorize('assets:manage'), validate(v.markLost), markLost);
router.patch('/:id/settle-fine',    authorize('assets:manage'), validate(v.settleFine), settleFine);
router.patch('/:id/damage-status',  authorize('assets:manage'), validate(v.damageStatus), updateDamageStatus);
router.post('/:id/send-reminder',   authorize('assets:manage'), validate(v.borrowById), sendManualReminderEndpoint);
router.post('/bulk-remind',         authorize('assets:manage'), bulkSendReminders);

export default router;
