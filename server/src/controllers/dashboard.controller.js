import Product from '../models/Product.js';
import Department from '../models/Department.js';
import Supplier from '../models/Supplier.js';
import User from '../models/User.js';
import StockTransaction from '../models/StockTransaction.js';
import AssetTransaction from '../models/AssetTransaction.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import { APP_TIMEZONE, localDateStr } from '../utils/dates.js';
import { getStockAlertCounts } from '../services/stockAlerts.service.js';
import { getPermissionsForRole } from '../middleware/authorize.js';

// Logins without access to stock, assets or reports (e.g. temple workers with the Employee
// role) get an empty dashboard rather than the store's figures.
const EMPTY = {
  counts: { productCount: 0, deptCount: 0, supplierCount: 0, userCount: 0, lowStockItems: 0, outOfStockItems: 0, reorderItems: 0 },
  assetCounts: { checkedOut: 0, overdue: 0, dueThisWeek: 0 },
  today: { STOCK_IN: 0, STOCK_OUT: 0, WASTAGE: 0, TRANSFER: 0 },
  recentTransactions: [],
  weeklyMovement: [],
  topProducts: [],
};

export const getDashboardStats = asyncHandler(async (req, res) => {
  const perms = await getPermissionsForRole(req.user.role);
  const allowed = perms.includes('*') || ['masters:read', 'transactions:read', 'assets:read', 'reports:read'].some((p) => perms.includes(p));
  if (!allowed) return res.json(new ApiResponse(200, EMPTY));

  // ── Counts ─────────────────────────────────────────────────────────────
  const [productCount, deptCount, supplierCount, userCount] = await Promise.all([
    Product.countDocuments({ isActive: true }),
    Department.countDocuments({ isActive: true }),
    Supplier.countDocuments({ isActive: true }),
    User.countDocuments({ isActive: true }),
  ]);

  // Low stock: quantity = 0 OR (minStockLevel > 0 AND qty <= min)
  const { lowStock: lowStockItems, outOfStock: outOfStockItems, reorder: reorderItems } = await getStockAlertCounts();

  // ── Recent Transactions ────────────────────────────────────────────────
  const recentTransactions = await StockTransaction.find({ isVoided: false })
    .populate('product', 'name code')
    .populate('fromDepartment', 'name')
    .populate('toDepartment', 'name')
    .populate('unit', 'symbol')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 })
    .limit(8)
    .lean();

  // ── 7-Day Movement Chart ───────────────────────────────────────────────
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const movementAgg = await StockTransaction.aggregate([
    {
      $match: {
        isVoided: false,
        transactionDate: { $gte: sevenDaysAgo },
        transactionType: { $in: ['STOCK_IN', 'STOCK_OUT', 'WASTAGE', 'TRANSFER'] },
      },
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$transactionDate', timezone: APP_TIMEZONE } },
          type: '$transactionType',
        },
        totalQty: { $sum: '$quantity' },
      },
    },
    { $sort: { '_id.date': 1 } },
  ]);

  // Build a full 7-day array (fill missing days with 0)
  const weeklyMovement = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = localDateStr(d);
    const label = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
    const day = { date: dateStr, label, stockIn: 0, stockOut: 0, wastage: 0, transfer: 0 };

    for (const row of movementAgg) {
      if (row._id.date !== dateStr) continue;
      if (row._id.type === 'STOCK_IN')  day.stockIn  = +row.totalQty.toFixed(2);
      if (row._id.type === 'STOCK_OUT') day.stockOut = +row.totalQty.toFixed(2);
      if (row._id.type === 'WASTAGE')   day.wastage  = +row.totalQty.toFixed(2);
      if (row._id.type === 'TRANSFER')  day.transfer = +row.totalQty.toFixed(2);
    }
    weeklyMovement.push(day);
  }

  // ── Today's Summary ────────────────────────────────────────────────────
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);

  const todayAgg = await StockTransaction.aggregate([
    {
      $match: {
        isVoided: false,
        transactionDate: { $gte: todayStart, $lte: todayEnd },
        transactionType: { $in: ['STOCK_IN', 'STOCK_OUT', 'WASTAGE', 'TRANSFER'] },
      },
    },
    { $group: { _id: '$transactionType', count: { $sum: 1 }, totalQty: { $sum: '$quantity' } } },
  ]);

  const today = { STOCK_IN: 0, STOCK_OUT: 0, WASTAGE: 0, TRANSFER: 0 };
  for (const row of todayAgg) today[row._id] = row.count;

  // ── Asset Counts ──────────────────────────────────────────────────────────
  const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7); weekEnd.setHours(23, 59, 59, 999);
  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);

  const [assetCheckedOut, assetOverdue, assetDueThisWeek] = await Promise.all([
    AssetTransaction.countDocuments({ status: { $in: ['checked_out', 'overdue'] } }),
    AssetTransaction.countDocuments({ status: 'overdue' }),
    AssetTransaction.countDocuments({
      status: { $in: ['checked_out', 'approved'] },
      expectedReturnDate: { $gte: todayMidnight, $lte: weekEnd },
    }),
  ]);

  // ── Top 5 Most Active Products (last 7 days) ────────────────────────────
  const topProducts = await StockTransaction.aggregate([
    { $match: { isVoided: false, transactionDate: { $gte: sevenDaysAgo } } },
    { $group: { _id: '$product', txnCount: { $sum: 1 }, totalQty: { $sum: '$quantity' } } },
    { $sort: { txnCount: -1 } },
    { $limit: 5 },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $project: { name: '$product.name', code: '$product.code', txnCount: 1, totalQty: 1 } },
  ]);

  res.json(new ApiResponse(200, {
    counts: { productCount, deptCount, supplierCount, userCount, lowStockItems, outOfStockItems, reorderItems },
    assetCounts: { checkedOut: assetCheckedOut, overdue: assetOverdue, dueThisWeek: assetDueThisWeek },
    today,
    recentTransactions,
    weeklyMovement,
    topProducts,
  }));
});
