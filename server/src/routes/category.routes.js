import { Router } from 'express';
import { getCategories, getCategory, createCategory, updateCategory, deleteCategory } from '../controllers/category.controller.js';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';

const router = Router();

router.use(protect, authorize('masters:read'));

router.get('/', getCategories);
router.get('/:id', getCategory);
router.post('/', authorize('masters:write'), createCategory);
router.put('/:id', authorize('masters:write'), updateCategory);
router.delete('/:id', authorize('masters:delete'), deleteCategory);

export default router;
