import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import validate from '../middleware/validate.js';
import { byId, asset } from '../validation/masters.schemas.js';
import { getAssets, getAsset, createAsset, updateAsset, deleteAsset } from '../controllers/asset.controller.js';

const router = Router();
router.use(protect);

router.route('/')
  .get(authorize('assets:read'),  getAssets)
  .post(authorize('assets:write'), validate(asset.create), createAsset);

router.route('/:id')
  .get(authorize('assets:read'),    validate(byId('Asset')), getAsset)
  .put(authorize('assets:write'),   validate(asset.update), updateAsset)
  .delete(authorize('assets:write'), validate(byId('Asset')), deleteAsset);

export default router;
