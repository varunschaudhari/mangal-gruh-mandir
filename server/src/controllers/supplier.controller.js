import Supplier from '../models/Supplier.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';

export const getSuppliers = asyncHandler(async (req, res) => {
  const { search, active, type } = req.query;
  const filter = {};
  if (active !== undefined) filter.isActive = active === 'true';
  if (type) filter.type = type;
  if (search) filter.name = { $regex: search, $options: 'i' };

  const suppliers = await Supplier.find(filter).sort({ name: 1 });
  res.json(new ApiResponse(200, suppliers));
});

export const getSupplier = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findById(req.params.id);
  if (!supplier) throw new ApiError(404, 'Supplier not found');
  res.json(new ApiResponse(200, supplier));
});

export const createSupplier = asyncHandler(async (req, res) => {
  const supplier = await Supplier.create(req.body);
  res.status(201).json(new ApiResponse(201, supplier, 'Supplier created'));
});

export const updateSupplier = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, {
    new: true, runValidators: true,
  });
  if (!supplier) throw new ApiError(404, 'Supplier not found');
  res.json(new ApiResponse(200, supplier, 'Supplier updated'));
});

export const deleteSupplier = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findByIdAndDelete(req.params.id);
  if (!supplier) throw new ApiError(404, 'Supplier not found');
  res.json(new ApiResponse(200, null, 'Supplier deleted'));
});
