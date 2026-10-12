import { Router } from 'express';
import { getDepartments, getDepartment, createDepartment, updateDepartment, deleteDepartment } from '../controllers/department.controller.js';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import validate from '../middleware/validate.js';
import { byId, department } from '../validation/masters.schemas.js';

const router = Router();

router.use(protect, authorize('masters:read'));

router.get('/', getDepartments);
router.get('/:id', validate(byId('Department')), getDepartment);
router.post('/', authorize('masters:write'), validate(department.create), createDepartment);
router.put('/:id', authorize('masters:write'), validate(department.update), updateDepartment);
router.delete('/:id', authorize('masters:delete'), validate(byId('Department')), deleteDepartment);

export default router;
