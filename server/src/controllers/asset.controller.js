import Asset from '../models/Asset.js';
import AssetTransaction from '../models/AssetTransaction.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { generateAssetCode } from '../services/assetCode.service.js';
import { generateUnitsForRange } from './assetUnit.controller.js';
import { logAction } from '../services/audit.service.js';

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
  const assetCode = await generateAssetCode();
  const asset = await Asset.create({ ...req.body, assetCode, createdBy: req.user._id });
  await generateUnitsForRange(asset, 1, asset.totalQuantity);
  logAction(req, { action: 'asset.create', entity: 'Asset', entityId: String(asset._id), entityRef: asset.name });
  res.status(201).json(new ApiResponse(201, asset, 'Asset created'));
});

export const updateAsset = asyncHandler(async (req, res) => {
  const existing = await Asset.findById(req.params.id);
  if (!existing) throw new ApiError(404, 'Asset not found');

  const asset = await Asset.findByIdAndUpdate(req.params.id, req.body, {
    new: true, runValidators: true,
  });

  // Auto-generate units for any newly added quantity
  const newQty = Number(req.body.totalQuantity);
  if (newQty && newQty > existing.totalQuantity && asset.assetCode) {
    await generateUnitsForRange(asset, existing.totalQuantity + 1, newQty);
  }

  const diffKeys = ['name', 'isActive', 'isBorrowable', 'totalQuantity', 'location', 'notes'];
  const before = {}, after = {};
  diffKeys.forEach((k) => {
    if (req.body[k] !== undefined && String(existing[k]) !== String(req.body[k])) {
      before[k] = existing[k]; after[k] = req.body[k];
    }
  });
  if (Object.keys(after).length) {
    logAction(req, { action: 'asset.update', entity: 'Asset', entityId: String(req.params.id), entityRef: existing.name, before, after });
  }
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
  logAction(req, { action: 'asset.delete', entity: 'Asset', entityId: String(asset._id), entityRef: asset.name });
  res.json(new ApiResponse(200, null, 'Asset deleted'));
});
