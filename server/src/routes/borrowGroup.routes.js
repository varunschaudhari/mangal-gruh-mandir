import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import validate from '../middleware/validate.js';
import * as v from '../validation/assets.schemas.js';
import { getGroups, getGroup, createGroup, checkoutGroup, extendGroup, cancelGroup } from '../controllers/borrowGroup.controller.js';

const router = Router();
router.use(protect);

router.route('/')
  .get(authorize('assets:read'),   getGroups)
  .post(authorize('assets:manage'), validate(v.createGroup), createGroup);

router.route('/:id')
  .get(authorize('assets:read'), validate(v.groupById), getGroup);

router.patch('/:id/checkout', authorize('assets:manage'), validate(v.checkoutGroup), checkoutGroup);
router.patch('/:id/extend',   authorize('assets:manage'), validate(v.extendGroup), extendGroup);
router.patch('/:id/cancel',   authorize('assets:manage'), validate(v.cancelGroup), cancelGroup);

export default router;
