import StockTransaction from '../models/StockTransaction.js';
import Product from '../models/Product.js';
import Department from '../models/Department.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';

export const getLedger = asyncHandler(async (req, res) => {
  const { product: productId, department: departmentId, startDate, endDate } = req.query;

  if (!productId) throw new ApiError(400, 'product is required');
  if (!departmentId) throw new ApiError(400, 'department is required');

  const [product, department] = await Promise.all([
    Product.findById(productId).populate('unit', 'name symbol').lean(),
    Department.findById(departmentId).lean(),
  ]);
  if (!product) throw new ApiError(404, 'Product not found');
  if (!department) throw new ApiError(404, 'Department not found');

  const deptStr = departmentId.toString();

  // Opening balance: sum all non-voided txns before startDate
  let openingBalance = 0;
  if (startDate) {
    const priorTxns = await StockTransaction.find({
      product: productId,
      isVoided: false,
      $or: [{ fromDepartment: departmentId }, { toDepartment: departmentId }],
      transactionDate: { $lt: new Date(startDate) },
    }).lean();

    for (const t of priorTxns) {
      if (t.toDepartment?.toString() === deptStr) openingBalance += t.quantity;
      if (t.fromDepartment?.toString() === deptStr) openingBalance -= t.quantity;
    }
    openingBalance = Math.max(0, openingBalance);
  }

  // Build filter for transactions in the requested period
  const filter = {
    product: productId,
    isVoided: false,
    $or: [{ fromDepartment: departmentId }, { toDepartment: departmentId }],
  };

  if (startDate || endDate) {
    filter.transactionDate = {};
    if (startDate) filter.transactionDate.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.transactionDate.$lte = end;
    }
  }

  const txns = await StockTransaction.find(filter)
    .populate('fromDepartment', 'name code')
    .populate('toDepartment', 'name code')
    .populate('unit', 'name symbol')
    .populate('supplier', 'name')
    .populate('createdBy', 'name')
    .sort({ transactionDate: 1, createdAt: 1 })
    .lean();

  // Build ledger rows with running balance
  let runningBalance = openingBalance;
  const rows = txns.map((t) => {
    const isIn = t.toDepartment?._id?.toString() === deptStr || t.toDepartment?.toString() === deptStr;
    const isOut = t.fromDepartment?._id?.toString() === deptStr || t.fromDepartment?.toString() === deptStr;

    let inQty = 0;
    let outQty = 0;
    if (isIn) { inQty = t.quantity; runningBalance += t.quantity; }
    if (isOut) { outQty = t.quantity; runningBalance -= t.quantity; }

    return {
      ...t,
      inQty,
      outQty,
      balance: Math.max(0, runningBalance),
    };
  });

  res.json(new ApiResponse(200, {
    product,
    department,
    openingBalance,
    transactions: rows,
    closingBalance: Math.max(0, runningBalance),
  }));
});
