import MahaprasadOccasion from '../models/MahaprasadOccasion.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';

export const getOccasions = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.active !== undefined) filter.isActive = req.query.active === 'true';
  const occasions = await MahaprasadOccasion.find(filter).sort({ sortOrder: 1, name: 1 });
  res.json(new ApiResponse(200, occasions));
});

export const createOccasion = asyncHandler(async (req, res) => {
  const occasion = await MahaprasadOccasion.create({ ...req.body, createdBy: req.user._id });
  res.status(201).json(new ApiResponse(201, occasion, 'Occasion created'));
});

export const updateOccasion = asyncHandler(async (req, res) => {
  const occasion = await MahaprasadOccasion.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!occasion) throw new ApiError(404, 'Occasion not found');
  res.json(new ApiResponse(200, occasion, 'Occasion updated'));
});

export const deleteOccasion = asyncHandler(async (req, res) => {
  const occasion = await MahaprasadOccasion.findByIdAndDelete(req.params.id);
  if (!occasion) throw new ApiError(404, 'Occasion not found');
  res.json(new ApiResponse(200, null, 'Occasion deleted'));
});
