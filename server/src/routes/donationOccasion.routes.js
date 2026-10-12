import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import validate from '../middleware/validate.js';
import { byId, occasion } from '../validation/masters.schemas.js';
import { getOccasions, createOccasion, updateOccasion, deleteOccasion } from '../controllers/donationOccasion.controller.js';

const router = Router();
router.use(protect);

router.route('/')
  .get(authorize('donations:read'),   getOccasions)
  .post(authorize('masters:write'),   validate(occasion.create), createOccasion);

router.route('/:id')
  .put(authorize('masters:write'),    validate(occasion.update), updateOccasion)
  .delete(authorize('masters:delete'), validate(byId('Occasion')), deleteOccasion);

export default router;
