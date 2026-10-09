import Product from '../models/Product.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { generateProductCode, escapeRegex } from '../utils/helpers.js';
import { logAction } from '../services/audit.service.js';

export const getProducts = asyncHandler(async (req, res) => {
  const { search, category, active, pujaItem } = req.query;
  const filter = {};

  if (active !== undefined) filter.isActive = active === 'true';
  if (category) filter.category = category;
  if (pujaItem !== undefined) filter.isPujaItem = pujaItem === 'true';
  if (search) {
    // Escape the text: "Rice (Basmati" is a search term, not a broken regular expression.
    const pattern = escapeRegex(search);
    filter.$or = [
      { name: { $regex: pattern, $options: 'i' } },
      { code: { $regex: pattern, $options: 'i' } },
      { aliases: { $elemMatch: { $regex: pattern, $options: 'i' } } },
      { barcode: search.trim() },
    ];
  }

  const products = await Product.find(filter)
    .populate('category', 'name code')
    .populate('unit', 'name symbol')
    .sort({ name: 1 });
  res.json(new ApiResponse(200, products));
});

// GET /products/lookup?code=… — exact match on product code or barcode (used when scanning)
export const lookupProduct = asyncHandler(async (req, res) => {
  const code = String(req.query.code || '').trim();
  if (!code) throw new ApiError(400, 'code is required');
  const product = await Product.findOne({ $or: [{ code: code.toUpperCase() }, { barcode: code }] })
    .populate('category', 'name code')
    .populate('unit', 'name symbol');
  if (!product) throw new ApiError(404, `No product with code or barcode "${code}"`);
  res.json(new ApiResponse(200, product));
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
  logAction(req, { action: 'product.create', entity: 'Product', entityId: String(product._id), entityRef: product.name });
  const populated = await Product.findById(product._id)
    .populate('category', 'name code')
    .populate('unit', 'name symbol');
  res.status(201).json(new ApiResponse(201, populated, 'Product created'));
});

export const updateProduct = asyncHandler(async (req, res) => {
  delete req.body.code; // code is immutable after creation
  const existing = await Product.findById(req.params.id).lean();
  if (!existing) throw new ApiError(404, 'Product not found');
  const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
    returnDocument: 'after', runValidators: true,
  })
    .populate('category', 'name code')
    .populate('unit', 'name symbol');
  const diffKeys = ['name', 'isActive', 'rate', 'reorderPoint', 'minStockLevel', 'alertEnabled'];
  const before = {}, after = {};
  diffKeys.forEach((k) => {
    if (req.body[k] !== undefined && String(existing[k]) !== String(req.body[k])) {
      before[k] = existing[k]; after[k] = req.body[k];
    }
  });
  if (Object.keys(after).length) {
    logAction(req, { action: 'product.update', entity: 'Product', entityId: String(req.params.id), entityRef: existing.name, before, after });
  }
  res.json(new ApiResponse(200, product, 'Product updated'));
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found');
  logAction(req, { action: 'product.delete', entity: 'Product', entityId: String(product._id), entityRef: product.name });
  res.json(new ApiResponse(200, null, 'Product deleted'));
});
