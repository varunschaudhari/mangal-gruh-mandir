import { Router } from 'express';
import { getDepartments, getDepartment, createDepartment, updateDepartment, deleteDepartment } from '../controllers/department.controller.js';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';

const router = Router();

router.use(protect, authorize('masters:read'));

router.get('/', getDepartments);
router.get('/:id', getDepartment);
router.post('/', authorize('masters:write'), createDepartment);
router.put('/:id', authorize('masters:write'), updateDepartment);
router.delete('/:id', authorize('masters:delete'), deleteDepartment);

export default router;
