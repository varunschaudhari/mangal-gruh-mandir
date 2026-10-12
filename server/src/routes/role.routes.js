import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import validate from '../middleware/validate.js';
import * as v from '../validation/admin.schemas.js';
import { getRoles, getRole, createRole, updateRole, deleteRole } from '../controllers/role.controller.js';

const router = Router();

router.use(protect);

router.route('/')
  .get(authorize('users:read'), getRoles)
  .post(authorize('users:write'), validate(v.createRole), createRole);

router.route('/:id')
  .get(authorize('users:read'), validate(v.roleById), getRole)
  .put(authorize('users:write'), validate(v.updateRole), updateRole)
  .delete(authorize('users:delete'), validate(v.roleById), deleteRole);

export default router;
