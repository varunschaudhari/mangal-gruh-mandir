import Category from '../models/Category.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';

export const getCategories = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.active !== undefined) filter.isActive = req.query.active === 'true';
  if (req.query.parent === 'null') filter.parentCategory = null;
  else if (req.query.parent) filter.parentCategory = req.query.parent;

  const cats = await Category.find(filter)
    .populate('parentCategory', 'name code')
    .sort({ sortOrder: 1, name: 1 });
  res.json(new ApiResponse(200, cats));
});

export const getCategory = asyncHandler(async (req, res) => {
  const cat = await Category.findById(req.params.id).populate('parentCategory', 'name code');
  if (!cat) throw new ApiError(404, 'Category not found');
  res.json(new ApiResponse(200, cat));
});

export const createCategory = asyncHandler(async (req, res) => {
  const cat = await Category.create(req.body);
  res.status(201).json(new ApiResponse(201, cat, 'Category created'));
});

export const updateCategory = asyncHandler(async (req, res) => {
  const cat = await Category.findByIdAndUpdate(req.params.id, req.body, {
    new: true, runValidators: true,
  }).populate('parentCategory', 'name code');
  if (!cat) throw new ApiError(404, 'Category not found');
  res.json(new ApiResponse(200, cat, 'Category updated'));
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const cat = await Category.findByIdAndDelete(req.params.id);
  if (!cat) throw new ApiError(404, 'Category not found');
  res.json(new ApiResponse(200, null, 'Category deleted'));
});
