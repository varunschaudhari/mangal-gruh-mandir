import StockBatch from '../models/StockBatch.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';

export const getExpiringBatches = asyncHandler(async (req, res) => {
  const { days = 30, department } = req.query;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + Number(days));

  const filter = {
    isVoided: false,
    remainingQty: { $gt: 0 },
    expiryDate: { $ne: null, $lte: cutoff },
  };
  if (department) filter.department = department;

  const batches = await StockBatch.find(filter)
    .populate('product', 'name code')
    .populate('department', 'name code')
    .sort({ expiryDate: 1 })
    .lean();

  res.json(new ApiResponse(200, batches));
});

export const getBatchesForProduct = asyncHandler(async (req, res) => {
  const { product, department } = req.query;
  const filter = { isVoided: false, remainingQty: { $gt: 0 } };
  if (product) filter.product = product;
  if (department) filter.department = department;

  const batches = await StockBatch.find(filter)
    .populate('product', 'name code')
    .populate('department', 'name code')
    .sort({ expiryDate: 1, createdAt: 1 })
    .lean();

  res.json(new ApiResponse(200, batches));
});
