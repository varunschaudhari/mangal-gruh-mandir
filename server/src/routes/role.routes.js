import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import { getRoles, getRole, createRole, updateRole, deleteRole } from '../controllers/role.controller.js';

const router = Router();

router.use(protect);

router.route('/')
  .get(authorize('users:read'), getRoles)
  .post(authorize('users:write'), createRole);

router.route('/:id')
  .get(authorize('users:read'), getRole)
  .put(authorize('users:write'), updateRole)
  .delete(authorize('users:delete'), deleteRole);

export default router;
