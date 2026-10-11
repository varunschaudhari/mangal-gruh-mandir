import { Router } from 'express';
import protect from '../middleware/auth.js';
import { lookupPincode } from '../services/pincode.service.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';

// GET /api/pincode/:pin → { found, state, district, city, areas[] } — for filling address forms.
const router = Router();
router.use(protect);

router.get('/:pin', asyncHandler(async (req, res) => {
  const result = await lookupPincode(req.params.pin);
  if (!result.found) throw new ApiError(404, 'PIN code not found');
  res.json(new ApiResponse(200, result));
}));

export default router;
