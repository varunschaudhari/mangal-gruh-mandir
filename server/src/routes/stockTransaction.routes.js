import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import {
  createTransaction,
  getTransactions,
  getTransaction,
  voidTransaction,
} from '../controllers/stockTransaction.controller.js';

const router = Router();

router.use(protect);

router.route('/')
  .get(authorize('transactions:read'), getTransactions)
  .post(authorize('transactions:create'), createTransaction);

router.route('/:id')
  .get(authorize('transactions:read'), getTransaction);

router.patch('/:id/void', authorize('transactions:delete'), voidTransaction);

export default router;
