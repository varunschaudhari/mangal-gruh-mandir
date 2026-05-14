import StockBalance from '../models/StockBalance.js';
import Product from '../models/Product.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';

export const getBalances = asyncHandler(async (req, res) => {
  const { department, product, lowStock } = req.query;

  const filter = {};
  if (department) filter.department = department;
  if (product) filter.product = product;

  // Staff: restrict to assigned departments
  if (req.user.role === 'staff') {
    const userDepts = req.user.departments?.map((d) => d.toString()) || [];
    if (userDepts.length > 0) {
      filter.department = { $in: userDepts };
    }
  }

  let balances = await StockBalance.find(filter)
    .populate({
      path: 'product',
      select: 'name code minStockLevel reorderPoint unit isActive',
      populate: { path: 'unit', select: 'name symbol' },
    })
    .populate('department', 'name code')
    .sort({ 'department': 1 })
    .lean();

  // Filter out inactive products
  balances = balances.filter((b) => b.product?.isActive !== false);

  // Attach alertLevel to every balance record
  balances = balances.map((b) => {
    const min    = b.product?.minStockLevel || 0;
    const reorder = b.product?.reorderPoint  || 0;
    let alertLevel = null;
    if (b.quantity === 0)                         alertLevel = 'out_of_stock';
    else if (min > 0 && b.quantity <= min)        alertLevel = 'low_stock';
    else if (reorder > 0 && b.quantity <= reorder) alertLevel = 'reorder';
    return { ...b, alertLevel };
  });

  // lowStock=true → return only items that need attention (any alert level)
  if (lowStock === 'true') {
    balances = balances.filter((b) => b.alertLevel !== null);
  }

  res.json(new ApiResponse(200, balances));
});

export const getProductBalance = asyncHandler(async (req, res) => {
  const { productId, departmentId } = req.params;

  const bal = await StockBalance.findOne({ product: productId, department: departmentId })
    .populate({ path: 'product', select: 'name code minStockLevel', populate: { path: 'unit', select: 'name symbol' } })
    .populate('department', 'name code')
    .lean();

  res.json(new ApiResponse(200, { quantity: bal?.quantity ?? 0, balance: bal }));
});
