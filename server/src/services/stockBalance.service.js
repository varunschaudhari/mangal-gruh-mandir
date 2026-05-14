import mongoose from 'mongoose';
import StockBatch from '../models/StockBatch.js';
import StockBalance from '../models/StockBalance.js';
import StockTransaction from '../models/StockTransaction.js';

const { Types: { ObjectId } } = mongoose;

/**
 * Recomputes balance for a product+department by summing remaining batch quantities.
 * This is now the single source of truth — batches own the quantity.
 */
export async function recomputeBalance(productId, departmentId) {
  const pid = new ObjectId(productId);
  const did = new ObjectId(departmentId);

  const result = await StockBatch.aggregate([
    { $match: { product: pid, department: did, isVoided: false } },
    { $group: { _id: null, total: { $sum: '$remainingQty' }, lastDate: { $max: '$createdAt' } } },
  ]);

  const qty = result[0]?.total ?? 0;
  const lastDate = result[0]?.lastDate ?? null;

  await StockBalance.findOneAndUpdate(
    { product: pid, department: did },
    { $set: { quantity: Math.max(0, qty), lastTransactionDate: lastDate, lastUpdated: new Date() } },
    { upsert: true, returnDocument: 'after' }
  );

  return Math.max(0, qty);
}

/**
 * Updates all balances affected by a transaction.
 */
export async function updateBalancesForTransaction(transaction) {
  const productId = transaction.product;
  const promises = [];

  if (transaction.toDepartment) promises.push(recomputeBalance(productId, transaction.toDepartment));
  if (transaction.fromDepartment) promises.push(recomputeBalance(productId, transaction.fromDepartment));

  await Promise.all(promises);
}

/**
 * Returns current balance quantity for a product+department pair.
 */
export async function getBalance(productId, departmentId) {
  const result = await StockBatch.aggregate([
    { $match: { product: new ObjectId(productId), department: new ObjectId(departmentId), isVoided: false } },
    { $group: { _id: null, total: { $sum: '$remainingQty' } } },
  ]);
  return result[0]?.total ?? 0;
}
