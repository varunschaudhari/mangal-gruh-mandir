import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import { getExpiringBatches, getBatchesForProduct } from '../controllers/stockBatch.controller.js';

const router = Router();

router.use(protect);

router.get('/expiring', authorize('reports:read'), getExpiringBatches);
router.get('/', authorize('transactions:read'), getBatchesForProduct);

export default router;
