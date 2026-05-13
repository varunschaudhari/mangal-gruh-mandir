import { Router } from 'express';
import { getSuppliers, getSupplier, createSupplier, updateSupplier, deleteSupplier } from '../controllers/supplier.controller.js';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';

const router = Router();

router.use(protect, authorize('masters:read'));

router.get('/', getSuppliers);
router.get('/:id', getSupplier);
router.post('/', authorize('masters:write'), createSupplier);
router.put('/:id', authorize('masters:write'), updateSupplier);
router.delete('/:id', authorize('masters:delete'), deleteSupplier);

export default router;
