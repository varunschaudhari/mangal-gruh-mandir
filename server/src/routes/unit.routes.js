import { Router } from 'express';
import { getUnits, createUnit, updateUnit, deleteUnit } from '../controllers/unit.controller.js';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import validate from '../middleware/validate.js';
import { byId, unit } from '../validation/masters.schemas.js';

const router = Router();

router.use(protect, authorize('masters:read'));

router.get('/', getUnits);
router.post('/', authorize('masters:write'), validate(unit.create), createUnit);
router.put('/:id', authorize('masters:write'), validate(unit.update), updateUnit);
router.delete('/:id', authorize('masters:delete'), validate(byId('Unit')), deleteUnit);

export default router;
