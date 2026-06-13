import Asset from '../models/Asset.js';
import AssetUnit from '../models/AssetUnit.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { generateAssetCode } from '../services/assetCode.service.js';
import { logAction } from '../services/audit.service.js';

// ── Helper: pad unit number ───────────────────────────────────────────────────
function padUnit(num, total) {
  return String(num).padStart(total > 99 ? 3 : 2, '0');
}

// ── Shared: generate units from startNum to endNum for an asset ───────────────
export async function generateUnitsForRange(asset, startNum, endNum) {
  const total = asset.totalQuantity;
  const docs  = [];
  for (let i = startNum; i <= endNum; i++) {
    docs.push({
      asset:      asset._id,
      unitCode:   `${asset.assetCode}-${padUnit(i, total)}`,
      unitNumber: i,
    });
  }
  if (docs.length) await AssetUnit.insertMany(docs, { ordered: false });
  return docs.length;
}

// ── GET /api/asset-units?asset=:assetId ──────────────────────────────────────
export const getUnitsByAsset = asyncHandler(async (req, res) => {
  if (!req.query.asset) throw new ApiError(400, 'asset query param is required');

  let units = await AssetUnit.find({ asset: req.query.asset }).sort({ unitNumber: 1 }).lean();

  // Lazy-generate units for assets that predate the AssetUnit feature
  if (units.length === 0) {
    const asset = await Asset.findById(req.query.asset);
    if (asset && asset.totalQuantity > 0) {
      if (!asset.assetCode) {
        asset.assetCode = await generateAssetCode();
        await asset.save();
      }
      try {
        await generateUnitsForRange(asset, 1, asset.totalQuantity);
      } catch { /* ignore duplicate key errors — units may already exist */ }
      units = await AssetUnit.find({ asset: req.query.asset }).sort({ unitNumber: 1 }).lean();
    }
  }

  res.json(new ApiResponse(200, units));
});

// ── GET /api/asset-units/:id ─────────────────────────────────────────────────
export const getUnit = asyncHandler(async (req, res) => {
  const unit = await AssetUnit.findById(req.params.id).populate('asset', 'name assetCode');
  if (!unit) throw new ApiError(404, 'Unit not found');
  res.json(new ApiResponse(200, unit));
});

// ── PATCH /api/asset-units/:id ───────────────────────────────────────────────
export const updateUnit = asyncHandler(async (req, res) => {
  const { condition, conditionNotes, isActive } = req.body;
  const update = { updatedBy: req.user._id };
  if (condition      !== undefined) update.condition      = condition;
  if (conditionNotes !== undefined) update.conditionNotes = conditionNotes;
  if (isActive       !== undefined) update.isActive       = isActive;

  const unit = await AssetUnit.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!unit) throw new ApiError(404, 'Unit not found');
  logAction(req, {
    action: 'asset.unit_update', entity: 'AssetUnit',
    entityId: unit.unitCode, entityRef: unit._id,
    meta: { condition, isActive },
  });
  res.json(new ApiResponse(200, unit, 'Unit updated'));
});

// ── POST /api/asset-units/generate  (body: assetId, startNum?, endNum?) ──────
// Generates missing units — safe to call multiple times (skips existing)
export const generateUnits = asyncHandler(async (req, res) => {
  const { assetId, startNum, endNum } = req.body;
  const asset = await Asset.findById(assetId);
  if (!asset) throw new ApiError(404, 'Asset not found');

  // Auto-assign an asset code if this is an older asset that was created before codes existed
  if (!asset.assetCode) {
    asset.assetCode = await generateAssetCode();
    await asset.save();
  }

  const from = startNum ? Number(startNum) : 1;
  const to   = endNum   ? Number(endNum)   : asset.totalQuantity;

  if (from < 1 || to > asset.totalQuantity || from > to)
    throw new ApiError(400, `Range must be between 1 and ${asset.totalQuantity}`);

  const created = await generateUnitsForRange(asset, from, to);
  res.json(new ApiResponse(200, { created }, `${created} unit(s) generated`));
});
