import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import validate from '../middleware/validate.js';
import * as v from '../validation/stock.schemas.js';
import {
  createTransaction,
  createBatchTransactions,
  getTransactions,
  getTransaction,
  voidTransaction,
  checkInvoiceDuplicate,
} from '../controllers/stockTransaction.controller.js';

const router = Router();

router.use(protect);

router.get('/check-invoice', authorize('transactions:read'), validate(v.checkInvoice), checkInvoiceDuplicate);
router.post('/batch', authorize('transactions:create'), validate(v.createBatchTransactions), createBatchTransactions);

router.route('/')
  .get(authorize('transactions:read'), validate(v.listTransactions), getTransactions)
  .post(authorize('transactions:create'), validate(v.createTransaction), createTransaction);

router.route('/:id')
  .get(authorize('transactions:read'), validate(v.transactionById), getTransaction);

router.patch('/:id/void', authorize('transactions:delete'), validate(v.voidTransaction), voidTransaction);

export default router;
