import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import { getUnitsByAsset, getUnit, updateUnit, generateUnits } from '../controllers/assetUnit.controller.js';

const router = Router();

router.use(protect);

router.get('/',          authorize('assets:read'),  getUnitsByAsset);
router.get('/:id',       authorize('assets:read'),  getUnit);
router.patch('/:id',     authorize('assets:write'), updateUnit);
router.post('/generate', authorize('assets:write'), generateUnits);

export default router;
