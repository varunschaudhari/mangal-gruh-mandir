import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import validate from '../middleware/validate.js';
import * as v from '../validation/stock.schemas.js';
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
router.get('/pending/:supplierId', authorize('payments:read'), validate(v.pendingEntries), getPendingEntries);

router.route('/')
  .get(authorize('transactions:read'), validate(v.listPurchaseEntries), getPurchaseEntries)
  .post(authorize('transactions:create'), validate(v.createPurchaseEntry), createPurchaseEntry);

router.get('/:id', authorize('transactions:read'), validate(v.purchaseEntryById), getPurchaseEntry);
router.patch('/:id', authorize('transactions:create'), validate(v.updatePurchaseEntry), updatePurchaseEntry);
router.patch('/:id/void', authorize('transactions:create'), validate(v.voidPurchaseEntry), voidPurchaseEntry);

export default router;
