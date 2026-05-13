import StockTransaction from '../models/StockTransaction.js';

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
