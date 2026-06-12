import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import { getOccasions, createOccasion, updateOccasion, deleteOccasion } from '../controllers/mahaprasadOccasion.controller.js';

const router = Router();
router.use(protect);

router.get('/',     authorize('mahaprasad:read'),  getOccasions);
router.post('/',    authorize('masters:write'),    createOccasion);
router.put('/:id',  authorize('masters:write'),    updateOccasion);
router.delete('/:id', authorize('masters:delete'), deleteOccasion);

export default router;
