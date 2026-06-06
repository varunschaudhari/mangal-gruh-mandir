import Asset from '../models/Asset.js';
import AssetTransaction from '../models/AssetTransaction.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';

export const getAssets = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.active     !== undefined) filter.isActive     = req.query.active     === 'true';
  if (req.query.borrowable !== undefined) filter.isBorrowable = req.query.borrowable === 'true';
  const assets = await Asset.find(filter).sort({ name: 1 });
  res.json(new ApiResponse(200, assets));
});

export const getAsset = asyncHandler(async (req, res) => {
  const asset = await Asset.findById(req.params.id);
  if (!asset) throw new ApiError(404, 'Asset not found');
  res.json(new ApiResponse(200, asset));
});

export const createAsset = asyncHandler(async (req, res) => {
  const asset = await Asset.create({ ...req.body, createdBy: req.user._id });
  res.status(201).json(new ApiResponse(201, asset, 'Asset created'));
});

export const updateAsset = asyncHandler(async (req, res) => {
  const asset = await Asset.findByIdAndUpdate(req.params.id, req.body, {
    new: true, runValidators: true,
  });
  if (!asset) throw new ApiError(404, 'Asset not found');
  res.json(new ApiResponse(200, asset, 'Asset updated'));
});

export const deleteAsset = asyncHandler(async (req, res) => {
  const active = await AssetTransaction.countDocuments({
    asset: req.params.id,
    status: { $in: ['approved', 'checked_out', 'overdue'] },
  });
  if (active > 0) throw new ApiError(400, 'Cannot delete asset with active borrow transactions');
  const asset = await Asset.findByIdAndDelete(req.params.id);
  if (!asset) throw new ApiError(404, 'Asset not found');
  res.json(new ApiResponse(200, null, 'Asset deleted'));
});
