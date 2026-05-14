import Unit from '../models/Unit.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';

export const getUnits = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.active !== undefined) filter.isActive = req.query.active === 'true';
  const units = await Unit.find(filter).sort({ name: 1 });
  res.json(new ApiResponse(200, units));
});

export const createUnit = asyncHandler(async (req, res) => {
  const unit = await Unit.create(req.body);
  res.status(201).json(new ApiResponse(201, unit, 'Unit created'));
});

export const updateUnit = asyncHandler(async (req, res) => {
  const unit = await Unit.findByIdAndUpdate(req.params.id, req.body, {
    returnDocument: 'after', runValidators: true,
  });
  if (!unit) throw new ApiError(404, 'Unit not found');
  res.json(new ApiResponse(200, unit, 'Unit updated'));
});

export const deleteUnit = asyncHandler(async (req, res) => {
  const unit = await Unit.findByIdAndDelete(req.params.id);
  if (!unit) throw new ApiError(404, 'Unit not found');
  res.json(new ApiResponse(200, null, 'Unit deleted'));
});
