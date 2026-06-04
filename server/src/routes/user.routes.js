import { Router } from 'express';
import { getUsers, getUser, getApprovers, createUser, updateUser, resetUserPassword } from '../controllers/user.controller.js';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';

const router = Router();

router.use(protect);

// Dedicated approvers endpoint — only needs assets:read, not users:read
router.get('/approvers', authorize('assets:read'), getApprovers);

router.use(authorize('users:read'));
router.get('/', getUsers);
router.get('/:id', getUser);
router.post('/', authorize('users:write'), createUser);
router.put('/:id', authorize('users:write'), updateUser);
router.put('/:id/reset-password', authorize('users:write'), resetUserPassword);

export default router;
