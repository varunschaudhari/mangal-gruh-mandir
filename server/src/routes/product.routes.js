import { Router } from 'express';
import { getProducts, getProduct, lookupProduct, createProduct, updateProduct, deleteProduct } from '../controllers/product.controller.js';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import validate from '../middleware/validate.js';
import { byId, product } from '../validation/masters.schemas.js';

const router = Router();

router.use(protect, authorize('masters:read'));

router.get('/', getProducts);
router.get('/lookup', lookupProduct);
router.get('/:id', validate(byId('Product')), getProduct);
router.post('/', authorize('masters:write'), validate(product.create), createProduct);
router.put('/:id', authorize('masters:write'), validate(product.update), updateProduct);
router.delete('/:id', authorize('masters:delete'), validate(byId('Product')), deleteProduct);

export default router;
