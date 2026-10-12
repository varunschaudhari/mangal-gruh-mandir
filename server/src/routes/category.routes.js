import { Router } from 'express';
import { getCategories, getCategory, createCategory, updateCategory, deleteCategory } from '../controllers/category.controller.js';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import validate from '../middleware/validate.js';
import { byId, category } from '../validation/masters.schemas.js';

const router = Router();

router.use(protect, authorize('masters:read'));

router.get('/', getCategories);
router.get('/:id', validate(byId('Category')), getCategory);
router.post('/', authorize('masters:write'), validate(category.create), createCategory);
router.put('/:id', authorize('masters:write'), validate(category.update), updateCategory);
router.delete('/:id', authorize('masters:delete'), validate(byId('Category')), deleteCategory);

export default router;
