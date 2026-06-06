import mongoose from 'mongoose';
import StockTransaction from '../models/StockTransaction.js';
import StockBalance from '../models/StockBalance.js';
import StockBatch from '../models/StockBatch.js';
import SupplierPayment from '../models/SupplierPayment.js';
import Product from '../models/Product.js';

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

// ── Festival Cost ─────────────────────────────────────────────────────────────
export async function getFestivalCostData(from, to) {
  const dateFilter = {};
  if (from) { const s = new Date(from); s.setHours(0, 0, 0, 0); dateFilter.$gte = s; }
  if (to)   { const e = new Date(to);   e.setHours(23, 59, 59, 999); dateFilter.$lte = e; }
  const hasDates = Object.keys(dateFilter).length > 0;

  const outTxns = await StockTransaction.find({
    transactionType: 'STOCK_OUT',
    isVoided: false,
    ...(hasDates ? { transactionDate: dateFilter } : {}),
  })
    .populate({ path: 'product', select: 'name code unit', populate: { path: 'unit', select: 'symbol name' } })
    .lean();

  // Group by product
  const productMap = {};
  for (const t of outTxns) {
    const pid = t.product?._id?.toString();
    if (!pid) continue;
    if (!productMap[pid]) productMap[pid] = { product: t.product, totalQty: 0, txnCount: 0 };
    productMap[pid].totalQty += t.quantity;
    productMap[pid].txnCount++;
  }

  // Get last purchase rate per product
  const productOids = Object.keys(productMap).map((id) => new mongoose.Types.ObjectId(id));
  let lastRates = [];
  if (productOids.length > 0) {
    lastRates = await StockTransaction.aggregate([
      { $match: { product: { $in: productOids }, transactionType: 'STOCK_IN', isVoided: false, rate: { $gt: 0 } } },
      { $sort: { transactionDate: -1, createdAt: -1 } },
      { $group: { _id: '$product', lastRate: { $first: '$rate' } } },
    ]);
  }
  const rateMap = {};
  lastRates.forEach((r) => { rateMap[r._id.toString()] = r.lastRate; });

  const consumptionRows = Object.entries(productMap).map(([pid, row]) => ({
    ...row,
    lastRate:       rateMap[pid] || 0,
    estimatedValue: +((rateMap[pid] || 0) * row.totalQty).toFixed(2),
  })).sort((a, b) => b.estimatedValue - a.estimatedValue);

  const totalConsumption  = +consumptionRows.reduce((s, r) => s + r.estimatedValue, 0).toFixed(2);

  const payments = await SupplierPayment.find({
    status: 'approved',
    ...(hasDates ? { paymentDate: dateFilter } : {}),
  })
    .populate('supplier', 'name')
    .populate('approvedBy', 'name')
    .select('paymentNumber supplier paymentDate paymentMode totalAmount referenceNumber approvedBy')
    .lean();

  const totalPayments = +payments.reduce((s, p) => s + p.totalAmount, 0).toFixed(2);

  return { consumptionRows, totalConsumption, payments, totalPayments, from, to };
}

// ── Consumption Trend ─────────────────────────────────────────────────────────
export async function getConsumptionTrendData(departmentId) {
  const now = new Date();
  const months = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      year:  d.getFullYear(),
      month: d.getMonth() + 1,
      label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      start: new Date(d.getFullYear(), d.getMonth(), 1),
      end:   new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999),
    });
  }

  const match = {
    transactionType: 'STOCK_OUT',
    isVoided: false,
    transactionDate: { $gte: months[0].start, $lte: months[2].end },
  };
  if (departmentId) match.fromDepartment = departmentId;

  const agg = await StockTransaction.aggregate([
    { $match: match },
    { $group: {
      _id: {
        product: '$product',
        year:    { $year: '$transactionDate' },
        month:   { $month: '$transactionDate' },
      },
      totalQty: { $sum: '$quantity' },
    }},
  ]);

  if (!agg.length) return { rows: [], monthLabels: months.map((m) => m.label) };
  const uniqueProductIds = [...new Set(agg.map((r) => r._id.product.toString()))].map((id) => new mongoose.Types.ObjectId(id));
  const products = await Product.find({ _id: { $in: uniqueProductIds } })
    .populate('unit', 'symbol name')
    .select('name code unit')
    .lean();
  const prodMap = {};
  products.forEach((p) => { prodMap[p._id.toString()] = p; });

  const productMap = {};
  for (const row of agg) {
    const pid = row._id.product.toString();
    if (!productMap[pid]) {
      const p = prodMap[pid];
      if (!p) continue;
      productMap[pid] = {
        _id:    pid,
        name:   p.name,
        code:   p.code,
        unit:   p.unit?.symbol || '',
        months: months.map((m) => ({ label: m.label, qty: 0 })),
        total:  0,
      };
    }
    const mIdx = months.findIndex((m) => m.year === row._id.year && m.month === row._id.month);
    if (mIdx >= 0) {
      productMap[pid].months[mIdx].qty += row.totalQty;
      productMap[pid].total            += row.totalQty;
    }
  }

  const rows       = Object.values(productMap).sort((a, b) => b.total - a.total);
  const monthLabels = months.map((m) => m.label);
  return { rows, monthLabels };
}

// ── Reorder Suggestions ───────────────────────────────────────────────────────
export async function getReorderSuggestionData(departmentId) {
  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

  const agg = await StockTransaction.aggregate([
    { $match: { transactionType: 'STOCK_OUT', isVoided: false, transactionDate: { $gte: threeMonthsAgo } } },
    { $group: { _id: '$product', totalQty3M: { $sum: '$quantity' } } },
  ]);
  const avgMap = {};
  agg.forEach((r) => { avgMap[r._id.toString()] = +(r.totalQty3M / 3).toFixed(3); });

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

  return balances.map((b) => {
    const min     = b.product?.minStockLevel || 0;
    const reorder = b.product?.reorderPoint  || 0;
    let alertLevel = null;
    if (b.quantity === 0)                         alertLevel = 'out_of_stock';
    else if (min > 0 && b.quantity <= min)        alertLevel = 'low_stock';
    else if (reorder > 0 && b.quantity <= reorder) alertLevel = 'reorder';
    if (!alertLevel) return null;

    const pid        = b.product?._id?.toString();
    const avgMonthly = avgMap[pid] || 0;
    const target     = Math.max(min * 2, reorder * 2, avgMonthly * 2, avgMonthly + reorder);
    const suggestedQty = Math.max(0, +(target - b.quantity).toFixed(3));

    return { ...b, alertLevel, avgMonthlyConsumption: avgMonthly, suggestedQty };
  }).filter(Boolean).sort((a, b) => {
    const order = { out_of_stock: 0, low_stock: 1, reorder: 2 };
    return (order[a.alertLevel] - order[b.alertLevel]) || b.suggestedQty - a.suggestedQty;
  });
}
