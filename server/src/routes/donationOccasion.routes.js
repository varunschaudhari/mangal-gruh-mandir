import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import { getOccasions, createOccasion, updateOccasion, deleteOccasion } from '../controllers/donationOccasion.controller.js';

const router = Router();
router.use(protect);

router.route('/')
  .get(authorize('donations:read'),   getOccasions)
  .post(authorize('masters:write'),   createOccasion);

router.route('/:id')
  .put(authorize('masters:write'),    updateOccasion)
  .delete(authorize('masters:delete'), deleteOccasion);

export default router;
