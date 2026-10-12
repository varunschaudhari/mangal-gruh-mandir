import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import validate from '../middleware/validate.js';
import * as v from '../validation/assets.schemas.js';
import { getUnitsByAsset, getUnit, lookupUnit, updateUnit, generateUnits } from '../controllers/assetUnit.controller.js';

const router = Router();

router.use(protect);

router.get('/',          authorize('assets:read'),  getUnitsByAsset);
router.get('/lookup',    authorize('assets:read'),  lookupUnit);
router.get('/:id',       authorize('assets:read'),  validate(v.unitById), getUnit);
router.patch('/:id',     authorize('assets:write'), validate(v.updateUnit), updateUnit);
router.post('/generate', authorize('assets:write'), validate(v.generateUnits), generateUnits);

export default router;
