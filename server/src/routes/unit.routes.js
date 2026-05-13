import { Router } from 'express';
import { getUnits, createUnit, updateUnit, deleteUnit } from '../controllers/unit.controller.js';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';

const router = Router();

router.use(protect, authorize('masters:read'));

router.get('/', getUnits);
router.post('/', authorize('masters:write'), createUnit);
router.put('/:id', authorize('masters:write'), updateUnit);
router.delete('/:id', authorize('masters:delete'), deleteUnit);

export default router;
