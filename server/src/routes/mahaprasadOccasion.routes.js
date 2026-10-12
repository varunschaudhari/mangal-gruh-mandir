import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import validate from '../middleware/validate.js';
import { byId, occasion } from '../validation/masters.schemas.js';
import { getOccasions, createOccasion, updateOccasion, deleteOccasion } from '../controllers/mahaprasadOccasion.controller.js';

const router = Router();
router.use(protect);

router.get('/',     authorize('mahaprasad:read'),  getOccasions);
router.post('/',    authorize('masters:write'),    validate(occasion.create), createOccasion);
router.put('/:id',  authorize('masters:write'),    validate(occasion.update), updateOccasion);
router.delete('/:id', authorize('masters:delete'), validate(byId('Occasion')), deleteOccasion);

export default router;
