import { Router } from 'express';
import { getUsers, getUser, createUser, updateUser, resetUserPassword } from '../controllers/user.controller.js';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';

const router = Router();

router.use(protect, authorize('users:read'));

router.get('/', getUsers);
router.get('/:id', getUser);
router.post('/', authorize('users:write'), createUser);
router.put('/:id', authorize('users:write'), updateUser);
router.put('/:id/reset-password', authorize('users:write'), resetUserPassword);

export default router;
