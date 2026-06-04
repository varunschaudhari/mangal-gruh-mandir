import AssetTransaction from '../models/AssetTransaction.js';
import Asset from '../models/Asset.js';
import User from '../models/User.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import { generateAssetReportExcel } from '../services/assetExcel.service.js';
import { generateAssetReportPDF } from '../services/assetPdf.service.js';

const POPULATE = [
  { path: 'asset',     select: 'name category finePerDay' },
  { path: 'borrower',  select: 'name' },
  { path: 'approvedBy', select: 'name' },
  { path: 'createdBy',  select: 'name' },
];

async function buildExportFilter(query) {
  const { from, to, status, search } = query;
  const match = {};

  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); match.createdAt.$lte = d; }
  }
  if (status) match.status = status;

  if (search) {
    const s = search.trim();
    const [userMatches, assetMatches] = await Promise.all([
      User.find({ name: { $regex: s, $options: 'i' } }).select('_id').lean(),
      Asset.find({ name: { $regex: s, $options: 'i' } }).select('_id').lean(),
    ]);
    const orClauses = [{ transactionNumber: { $regex: s, $options: 'i' } }];
    if (userMatches.length)  orClauses.push({ borrower: { $in: userMatches.map((u) => u._id) } });
    if (assetMatches.length) orClauses.push({ asset:    { $in: assetMatches.map((a) => a._id) } });
    match.$or = orClauses;
  }

  return match;
}

function dateRange(from, to) {
  const match = {};
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to) {
      const d = new Date(to); d.setHours(23, 59, 59, 999);
      match.createdAt.$lte = d;
    }
  }
  return match;
}

// ── Utilization Report ──────────────────────────────────────────────────────
export const getUtilizationReport = asyncHandler(async (req, res) => {
  const results = await AssetTransaction.aggregate([
    { $match: { status: { $in: ['checked_out', 'returned', 'overdue'] } } },
    {
      $group: {
        _id: '$asset',
        totalBorrows:   { $sum: 1 },
        returnedCount:  { $sum: { $cond: [{ $eq: ['$status', 'returned'] }, 1, 0] } },
        checkedOutNow:  { $sum: { $cond: [{ $eq: ['$status', 'checked_out'] }, 1, 0] } },
        overdueNow:     { $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, 1, 0] } },
        damageCount:    { $sum: { $cond: [{ $eq: ['$conditionAtReturn', 'damaged'] }, 1, 0] } },
        totalLateDays:  { $sum: '$lateDays' },
        sumDuration: {
          $sum: {
            $cond: [
              { $and: [
                { $eq: ['$status', 'returned'] },
                { $ne: ['$actualReturnDate', null] },
                { $ne: ['$checkedOutAt', null] },
              ]},
              { $divide: [{ $subtract: ['$actualReturnDate', '$checkedOutAt'] }, 86400000] },
              0,
            ],
          },
        },
      },
    },
    { $lookup: { from: 'assets', localField: '_id', foreignField: '_id', as: 'asset' } },
    { $unwind: '$asset' },
    {
      $project: {
        assetName:     '$asset.name',
        category:      '$asset.category',
        totalQuantity: '$asset.totalQuantity',
        totalBorrows:  1,
        returnedCount: 1,
        checkedOutNow: 1,
        overdueNow:    1,
        damageCount:   1,
        totalLateDays: 1,
        avgDurationDays: {
          $cond: [
            { $gt: ['$returnedCount', 0] },
            { $round: [{ $divide: ['$sumDuration', '$returnedCount'] }, 1] },
            0,
          ],
        },
      },
    },
    { $sort: { totalBorrows: -1 } },
  ]);

  res.json(new ApiResponse(200, results));
});

// ── Fine Collection Report ──────────────────────────────────────────────────
export const getFineReport = asyncHandler(async (req, res) => {
  const match = dateRange(req.query.from, req.query.to);

  const [summaryArr] = await AssetTransaction.aggregate([
    { $match: match },
    {
      $group: {
        _id:              null,
        totalFineAmount:  { $sum: { $cond: ['$fineApplied', '$fineAmount', 0] } },
        fineAppliedCount: { $sum: { $cond: ['$fineApplied', 1, 0] } },
        fineWaivedCount:  { $sum: { $cond: ['$fineWaived',  1, 0] } },
      },
    },
  ]);

  const overdueCount = await AssetTransaction.countDocuments({
    status: 'overdue', fineApplied: false, fineWaived: false,
  });

  const transactions = await AssetTransaction.find({
    ...match,
    $or: [{ fineApplied: true }, { fineWaived: true }, { lateDays: { $gt: 0 } }],
  })
    .populate('asset',    'name finePerDay')
    .populate('borrower', 'name')
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();

  res.json(new ApiResponse(200, {
    summary: {
      totalFineAmount:  summaryArr?.totalFineAmount  || 0,
      fineAppliedCount: summaryArr?.fineAppliedCount || 0,
      fineWaivedCount:  summaryArr?.fineWaivedCount  || 0,
      overdueCount,
    },
    transactions,
  }));
});

// ── Excel Export ────────────────────────────────────────────────────────────
export const exportAssetExcel = asyncHandler(async (req, res) => {
  const match = await buildExportFilter(req.query);

  const [transactions, utilizationData] = await Promise.all([
    AssetTransaction.find(match).populate(POPULATE).sort({ createdAt: -1 }).lean(),
    AssetTransaction.aggregate([
      { $match: { status: { $in: ['checked_out', 'returned', 'overdue'] } } },
      { $group: { _id: '$asset', totalBorrows: { $sum: 1 }, damageCount: { $sum: { $cond: [{ $eq: ['$conditionAtReturn', 'damaged'] }, 1, 0] } }, totalLateDays: { $sum: '$lateDays' } } },
      { $lookup: { from: 'assets', localField: '_id', foreignField: '_id', as: 'asset' } },
      { $unwind: '$asset' },
      { $project: { assetName: '$asset.name', category: '$asset.category', totalBorrows: 1, damageCount: 1, totalLateDays: 1 } },
      { $sort: { totalBorrows: -1 } },
    ]),
  ]);

  await generateAssetReportExcel(res, { transactions, utilizationData, from: req.query.from, to: req.query.to });
});

// ── PDF Export ──────────────────────────────────────────────────────────────
export const exportAssetPDF = asyncHandler(async (req, res) => {
  const match = await buildExportFilter(req.query);
  const transactions = await AssetTransaction.find(match).populate(POPULATE).sort({ createdAt: -1 }).lean();
  generateAssetReportPDF(res, { transactions, from: req.query.from, to: req.query.to });
});
