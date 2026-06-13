import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import {
  createPurchaseEntry,
  getPurchaseEntries,
  getPurchaseEntry,
  updatePurchaseEntry,
  voidPurchaseEntry,
  getPendingEntries,
} from '../controllers/purchaseEntry.controller.js';

const router = Router();
router.use(protect);

// Static routes BEFORE /:id
router.get('/pending/:supplierId', authorize('payments:read'), getPendingEntries);

router.route('/')
  .get(authorize('transactions:read'), getPurchaseEntries)
  .post(authorize('transactions:create'), createPurchaseEntry);

router.get('/:id', authorize('transactions:read'), getPurchaseEntry);
router.patch('/:id', authorize('transactions:create'), updatePurchaseEntry);
router.patch('/:id/void', authorize('transactions:create'), voidPurchaseEntry);

export default router;
