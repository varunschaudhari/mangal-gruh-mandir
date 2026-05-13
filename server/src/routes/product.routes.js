import { Router } from 'express';
import { getProducts, getProduct, createProduct, updateProduct, deleteProduct } from '../controllers/product.controller.js';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';

const router = Router();

router.use(protect, authorize('masters:read'));

router.get('/', getProducts);
router.get('/:id', getProduct);
router.post('/', authorize('masters:write'), createProduct);
router.put('/:id', authorize('masters:write'), updateProduct);
router.delete('/:id', authorize('masters:delete'), deleteProduct);

export default router;
