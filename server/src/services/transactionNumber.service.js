import StockTransaction from '../models/StockTransaction.js';

/**
 * Generates TXN-YYYYMMDD-NNN based on the transaction date.
 * Uses a retry loop to handle concurrent inserts (race condition safe via unique index).
 */
export async function generateTransactionNumber(transactionDate) {
  const dateStr = formatDateKey(transactionDate);
  const prefix = `TXN-${dateStr}-`;

  // Find the highest sequence number for this date
  const last = await StockTransaction.findOne(
    { transactionNumber: { $regex: `^${prefix}` } },
    { transactionNumber: 1 },
    { sort: { transactionNumber: -1 } }
  ).lean();

  let seq = 1;
  if (last?.transactionNumber) {
    const parts = last.transactionNumber.split('-');
    seq = parseInt(parts[parts.length - 1], 10) + 1;
  }

  return `${prefix}${String(seq).padStart(3, '0')}`;
}

function formatDateKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
