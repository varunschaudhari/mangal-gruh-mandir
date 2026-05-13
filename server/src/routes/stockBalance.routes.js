import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import { getBalances, getProductBalance } from '../controllers/stockBalance.controller.js';

const router = Router();

router.use(protect);

router.get('/', authorize('masters:read'), getBalances);
router.get('/:productId/:departmentId', authorize('masters:read'), getProductBalance);

export default router;
