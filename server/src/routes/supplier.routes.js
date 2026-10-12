import { Router } from 'express';
import { getSuppliers, getSupplier, createSupplier, updateSupplier, deleteSupplier } from '../controllers/supplier.controller.js';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import validate from '../middleware/validate.js';
import { byId, supplier } from '../validation/masters.schemas.js';

const router = Router();

router.use(protect, authorize('masters:read'));

router.get('/', getSuppliers);
router.get('/:id', validate(byId('Supplier')), getSupplier);
router.post('/', authorize('masters:write'), validate(supplier.create), createSupplier);
router.put('/:id', authorize('masters:write'), validate(supplier.update), updateSupplier);
router.delete('/:id', authorize('masters:delete'), validate(byId('Supplier')), deleteSupplier);

export default router;
