import StockTransaction from '../models/StockTransaction.js';
import StockBalance from '../models/StockBalance.js';
import StockBatch from '../models/StockBatch.js';

/**
 * Fetches all non-voided transactions for a date (optionally filtered by department)
 * and returns them with a pre-computed summary.
 */
export async function getDailyReportData(date, departmentId) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const filter = {
    transactionDate: { $gte: start, $lte: end },
    isVoided: false,
  };

  if (departmentId) {
    filter.$or = [{ fromDepartment: departmentId }, { toDepartment: departmentId }];
  }

  const transactions = await StockTransaction.find(filter)
    .populate('product', 'name code')
    .populate('fromDepartment', 'name code')
    .populate('toDepartment', 'name code')
    .populate('unit', 'name symbol')
    .populate('supplier', 'name')
    .populate('createdBy', 'name')
    .sort({ transactionType: 1, transactionDate: 1, createdAt: 1 })
    .lean();

  const summary = {
    STOCK_IN:  { count: 0, totalQty: 0 },
    STOCK_OUT: { count: 0, totalQty: 0 },
    TRANSFER:  { count: 0, totalQty: 0 },
    WASTAGE:   { count: 0, totalQty: 0 },
  };

  for (const t of transactions) {
    if (summary[t.transactionType]) {
      summary[t.transactionType].count++;
      summary[t.transactionType].totalQty = +(summary[t.transactionType].totalQty + t.quantity).toFixed(3);
    }
  }

  return { transactions, summary };
}

export async function getLowStockData(departmentId) {
  const filter = {};
  if (departmentId) filter.department = departmentId;

  let balances = await StockBalance.find(filter)
    .populate({
      path: 'product',
      select: 'name code minStockLevel reorderPoint unit isActive',
      populate: { path: 'unit', select: 'name symbol' },
    })
    .populate('department', 'name')
    .lean();

  balances = balances.filter((b) => b.product?.isActive !== false);

  balances = balances.map((b) => {
    const min = b.product?.minStockLevel || 0;
    const reorder = b.product?.reorderPoint || 0;
    let alertLevel = null;
    if (b.quantity === 0) alertLevel = 'out_of_stock';
    else if (min > 0 && b.quantity <= min) alertLevel = 'low_stock';
    else if (reorder > 0 && b.quantity <= reorder) alertLevel = 'reorder';
    return { ...b, alertLevel };
  }).filter((b) => b.alertLevel !== null);

  return balances;
}

export async function getExpiringBatchData(days, departmentId) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + (days || 30));

  const filter = { expiryDate: { $lte: cutoff }, remainingQty: { $gt: 0 }, isVoided: false };
  if (departmentId) filter.department = departmentId;

  const batches = await StockBatch.find(filter)
    .populate({ path: 'product', select: 'name code unit', populate: { path: 'unit', select: 'name symbol' } })
    .populate('department', 'name')
    .sort({ expiryDate: 1 })
    .lean();

  return batches;
}

export async function getValuationData(departmentId) {
  const filter = { quantity: { $gt: 0 } };
  if (departmentId) filter.department = departmentId;

  let balances = await StockBalance.find(filter)
    .populate({ path: 'product', select: 'name code unit isActive', populate: { path: 'unit', select: 'name symbol' } })
    .populate('department', 'name')
    .lean();

  balances = balances.filter((b) => b.product?.isActive !== false);

  const productIds = balances.map((b) => b.product?._id).filter(Boolean);

  const lastRates = await StockTransaction.aggregate([
    { $match: { product: { $in: productIds }, transactionType: 'STOCK_IN', isVoided: false, rate: { $gt: 0 } } },
    { $sort: { transactionDate: -1, createdAt: -1 } },
    { $group: { _id: '$product', lastRate: { $first: '$rate' } } },
  ]);

  const rateMap = {};
  lastRates.forEach((r) => { rateMap[r._id.toString()] = r.lastRate; });

  let grandTotal = 0;
  const rows = balances.map((b) => {
    const lastRate = rateMap[b.product?._id?.toString()] || 0;
    const totalValue = +(b.quantity * lastRate).toFixed(2);
    grandTotal += totalValue;
    return { ...b, lastRate, totalValue };
  }).sort((a, b) => b.totalValue - a.totalValue);

  return { rows, grandTotal: +grandTotal.toFixed(2) };
}

export async function getSupplierReportData(startDate, endDate, supplierId) {
  const match = {
    transactionType: 'STOCK_IN',
    stockInType: 'PURCHASE',
    isVoided: false,
    supplier: { $exists: true, $ne: null },
  };

  if (startDate || endDate) {
    match.transactionDate = {};
    if (startDate) { const s = new Date(startDate); s.setHours(0, 0, 0, 0); match.transactionDate.$gte = s; }
    if (endDate)   { const e = new Date(endDate);   e.setHours(23, 59, 59, 999); match.transactionDate.$lte = e; }
  }
  if (supplierId) match.supplier = supplierId;

  const txns = await StockTransaction.find(match)
    .populate('product', 'name code')
    .populate('toDepartment', 'name')
    .populate('supplier', 'name phone')
    .populate('unit', 'name symbol')
    .sort({ transactionDate: -1 })
    .lean();

  const supplierMap = {};
  for (const t of txns) {
    const sid = t.supplier?._id?.toString();
    if (!sid) continue;
    if (!supplierMap[sid]) {
      supplierMap[sid] = { supplier: t.supplier, count: 0, totalValue: 0, transactions: [] };
    }
    supplierMap[sid].count++;
    supplierMap[sid].totalValue = +(supplierMap[sid].totalValue + (t.totalValue || 0)).toFixed(2);
    supplierMap[sid].transactions.push(t);
  }

  const suppliers = Object.values(supplierMap).sort((a, b) => b.totalValue - a.totalValue);
  const grandTotal = +suppliers.reduce((s, sup) => s + sup.totalValue, 0).toFixed(2);

  return { suppliers, grandTotal, txns };
}
