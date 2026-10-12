import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import { uploadReceipt } from '../middleware/upload.middleware.js';
import validate from '../middleware/validate.js';
import * as v from '../validation/expense.schemas.js';
import {
  createExpense, getExpenses, getExpense,
  getExpenseSummary, approveExpense, rejectExpense, voidExpense,
  uploadExpenseReceipt, removeExpenseReceipt, exportExpensesPdf,
} from '../controllers/expense.controller.js';

const router = Router();

router.use(protect);

router.get('/summary',        authorize('payments:read'),  validate(v.expenseSummary), getExpenseSummary);
router.get('/export/pdf',     authorize('payments:read'),  validate(v.exportExpenses), exportExpensesPdf);

router.route('/')
  .get(authorize('payments:read'),   validate(v.listExpenses),  getExpenses)
  .post(authorize('payments:write'), validate(v.createExpense), createExpense);

router.get('/:id',              authorize('payments:read'),    validate(v.expenseById),   getExpense);
router.patch('/:id/approve',    authorize('payments:approve'), validate(v.expenseById),   approveExpense);
router.patch('/:id/reject',     authorize('payments:approve'), validate(v.rejectExpense), rejectExpense);
router.patch('/:id/void',       authorize('payments:approve'), validate(v.voidExpense),   voidExpense);
router.post('/:id/receipt',     authorize('payments:write'),   validate(v.expenseById),   uploadReceipt, uploadExpenseReceipt);
router.delete('/:id/receipt',   authorize('payments:write'),   validate(v.expenseById),   removeExpenseReceipt);

export default router;
