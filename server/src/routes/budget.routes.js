import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import validate from '../middleware/validate.js';
import * as v from '../validation/admin.schemas.js';
import { getBudgets, upsertBudgets, copyPreviousMonth } from '../controllers/budget.controller.js';

const router = Router();
router.use(protect);

router.get('/',          authorize('payments:read'),   getBudgets);
router.put('/',          authorize('payments:approve'), validate(v.upsertBudgets), upsertBudgets);
router.get('/copy-prev', authorize('payments:read'),   copyPreviousMonth);

export default router;
