import Product from '../models/Product.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { generateProductCode } from '../utils/helpers.js';

export const getProducts = asyncHandler(async (req, res) => {
  const { search, category, active, pujaItem } = req.query;
  const filter = {};

  if (active !== undefined) filter.isActive = active === 'true';
  if (category) filter.category = category;
  if (pujaItem !== undefined) filter.isPujaItem = pujaItem === 'true';
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { code: { $regex: search, $options: 'i' } },
      { aliases: { $elemMatch: { $regex: search, $options: 'i' } } },
    ];
  }

  const products = await Product.find(filter)
    .populate('category', 'name code')
    .populate('unit', 'name symbol')
    .sort({ name: 1 });
  res.json(new ApiResponse(200, products));
});

export const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)
    .populate('category', 'name code')
    .populate('unit', 'name symbol');
  if (!product) throw new ApiError(404, 'Product not found');
  res.json(new ApiResponse(200, product));
});

export const createProduct = asyncHandler(async (req, res) => {
  if (!req.body.code) req.body.code = await generateProductCode();

  const product = await Product.create({ ...req.body, createdBy: req.user._id });
  const populated = await Product.findById(product._id)
    .populate('category', 'name code')
    .populate('unit', 'name symbol');
  res.status(201).json(new ApiResponse(201, populated, 'Product created'));
});

export const updateProduct = asyncHandler(async (req, res) => {
  delete req.body.code; // code is immutable after creation
  const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
    returnDocument: 'after', runValidators: true,
  })
    .populate('category', 'name code')
    .populate('unit', 'name symbol');
  if (!product) throw new ApiError(404, 'Product not found');
  res.json(new ApiResponse(200, product, 'Product updated'));
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found');
  res.json(new ApiResponse(200, null, 'Product deleted'));
});
