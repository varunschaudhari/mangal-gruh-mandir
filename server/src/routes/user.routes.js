import { Router } from 'express';
import { getUsers, getUser, getApprovers, createUser, updateUser, resetUserPassword, getDeleteCheck, deleteUser } from '../controllers/user.controller.js';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import validate from '../middleware/validate.js';
import * as v from '../validation/admin.schemas.js';

const router = Router();

router.use(protect);

// Dedicated approvers endpoint — only needs assets:read, not users:read
router.get('/approvers', authorize('assets:read'), getApprovers);

router.use(authorize('users:read'));
router.get('/', getUsers);
router.get('/:id', validate(v.userById), getUser);
router.post('/', authorize('users:write'), validate(v.createUser), createUser);
router.put('/:id', authorize('users:write'), validate(v.updateUser), updateUser);
router.put('/:id/reset-password', authorize('users:write'), validate(v.resetPassword), resetUserPassword);
// Super admins only (checked in the controller), and only a login that has done nothing in the app
router.get('/:id/delete-check', authorize('users:write'), validate(v.userById), getDeleteCheck);
router.delete('/:id', authorize('users:write'), validate(v.userById), deleteUser);

export default router;
