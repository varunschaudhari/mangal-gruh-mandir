import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import { getGroups, getGroup, createGroup, checkoutGroup, extendGroup, cancelGroup } from '../controllers/borrowGroup.controller.js';

const router = Router();
router.use(protect);

router.route('/')
  .get(authorize('assets:read'),   getGroups)
  .post(authorize('assets:manage'), createGroup);

router.route('/:id')
  .get(authorize('assets:read'), getGroup);

router.patch('/:id/checkout', authorize('assets:manage'), checkoutGroup);
router.patch('/:id/extend',   authorize('assets:manage'), extendGroup);
router.patch('/:id/cancel',   authorize('assets:manage'), cancelGroup);

export default router;
