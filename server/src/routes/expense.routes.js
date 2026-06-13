import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import { uploadReceipt } from '../middleware/upload.middleware.js';
import {
  createExpense, getExpenses, getExpense,
  getExpenseSummary, approveExpense, rejectExpense, voidExpense,
  uploadExpenseReceipt, removeExpenseReceipt, exportExpensesPdf,
} from '../controllers/expense.controller.js';

const router = Router();

router.use(protect);

router.get('/summary',        authorize('payments:read'),  getExpenseSummary);
router.get('/export/pdf',     authorize('payments:read'),  exportExpensesPdf);

router.route('/')
  .get(authorize('payments:read'),   getExpenses)
  .post(authorize('payments:write'), createExpense);

router.get('/:id',              authorize('payments:read'),    getExpense);
router.patch('/:id/approve',    authorize('payments:approve'), approveExpense);
router.patch('/:id/reject',     authorize('payments:approve'), rejectExpense);
router.patch('/:id/void',       authorize('payments:approve'), voidExpense);
router.post('/:id/receipt',     authorize('payments:write'),   uploadReceipt, uploadExpenseReceipt);
router.delete('/:id/receipt',   authorize('payments:write'),   removeExpenseReceipt);

export default router;
