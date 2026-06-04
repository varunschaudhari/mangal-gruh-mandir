import { Router } from 'express';
import protect from '../middleware/auth.js';
import authorize from '../middleware/authorize.js';
import { getAssets, getAsset, createAsset, updateAsset, deleteAsset } from '../controllers/asset.controller.js';

const router = Router();
router.use(protect);

router.route('/')
  .get(authorize('assets:read'),  getAssets)
  .post(authorize('assets:write'), createAsset);

router.route('/:id')
  .get(authorize('assets:read'),    getAsset)
  .put(authorize('assets:write'),   updateAsset)
  .delete(authorize('assets:write'), deleteAsset);

export default router;
