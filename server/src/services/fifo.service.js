import StockBatch from '../models/StockBatch.js';
import StockTransaction from '../models/StockTransaction.js';
import ApiError from '../utils/ApiError.js';

/**
 * Creates a batch record when a STOCK_IN or OPENING_BALANCE transaction is saved.
 */
export async function createBatch(txn) {
  await StockBatch.create({
    product: txn.product,
    department: txn.toDepartment,
    originalQty: txn.quantity,
    remainingQty: txn.quantity,
    expiryDate: txn.expiryDate || null,
    manufacturingDate: txn.manufacturingDate || null,
    batchRef: txn.batchRef || null,
    sourceTransaction: txn._id,
  });
}

/**
 * FIFO deduction: consumes batches for product+department in order:
 *   1. Expiry-dated batches, earliest expiry first
 *   2. Undated batches, oldest entry first
 *
 * Returns array of { batch: ObjectId, qty: Number } consumed.
 * Throws ApiError if insufficient stock.
 */
export async function consumeBatches(productId, departmentId, qtyNeeded) {
  // Fetch expiry-dated batches first, then undated
  const [datedBatches, undatedBatches] = await Promise.all([
    StockBatch.find({
      product: productId, department: departmentId,
      isVoided: false, remainingQty: { $gt: 0 },
      expiryDate: { $ne: null },
    }).sort({ expiryDate: 1, createdAt: 1 }),
    StockBatch.find({
      product: productId, department: departmentId,
      isVoided: false, remainingQty: { $gt: 0 },
      expiryDate: null,
    }).sort({ createdAt: 1 }),
  ]);

  const batches = [...datedBatches, ...undatedBatches];
  const totalAvailable = batches.reduce((s, b) => s + b.remainingQty, 0);

  if (totalAvailable < qtyNeeded) {
    throw new ApiError(400, `Insufficient stock. Available: ${totalAvailable}`);
  }

  let remaining = qtyNeeded;
  const consumed = [];

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.remainingQty, remaining);
    batch.remainingQty = +(batch.remainingQty - take).toFixed(6);
    await batch.save();
    consumed.push({ batch: batch._id, qty: take });
    remaining = +(remaining - take).toFixed(6);
  }

  return consumed;
}

/**
 * FIFO for TRANSFER: consume from source and create a new batch in destination.
 * If multiple source batches are consumed, one destination batch per source is created.
 */
export async function transferBatches(productId, fromDeptId, toDeptId, qty, txn) {
  const consumed = await consumeBatches(productId, fromDeptId, qty);

  // Reconstruct expiry info for each consumed batch and create destination batches
  for (const c of consumed) {
    const srcBatch = await StockBatch.findById(c.batch).lean();
    await StockBatch.create({
      product: productId,
      department: toDeptId,
      originalQty: c.qty,
      remainingQty: c.qty,
      expiryDate: srcBatch?.expiryDate || null,
      manufacturingDate: srcBatch?.manufacturingDate || null,
      batchRef: srcBatch?.batchRef || null,
      sourceTransaction: txn._id,
    });
  }

  return consumed;
}

/**
 * Reverses a void:
 * - For STOCK_IN / OPENING_BALANCE: voids the batch if entirely unconsumed, else throws.
 * - For STOCK_OUT / WASTAGE / TRANSFER: restores consumed batch quantities.
 */
export async function restoreBatchesForVoid(txn) {
  const type = txn.transactionType;

  if (type === 'STOCK_IN' || type === 'OPENING_BALANCE') {
    const batch = await StockBatch.findOne({ sourceTransaction: txn._id, isVoided: false });
    if (!batch) return; // already voided or missing
    if (batch.remainingQty < batch.originalQty) {
      throw new ApiError(
        400,
        `Cannot void: ${batch.originalQty - batch.remainingQty} units of this batch have already been consumed.`
      );
    }
    batch.isVoided = true;
    batch.remainingQty = 0;
    await batch.save();
    return;
  }

  if (type === 'STOCK_OUT' || type === 'WASTAGE') {
    const consumedBatches = txn.consumedBatches || [];
    for (const c of consumedBatches) {
      await StockBatch.findByIdAndUpdate(c.batch, { $inc: { remainingQty: c.qty } });
    }
    return;
  }

  if (type === 'TRANSFER') {
    // Restore source batches
    const consumedBatches = txn.consumedBatches || [];
    for (const c of consumedBatches) {
      await StockBatch.findByIdAndUpdate(c.batch, { $inc: { remainingQty: c.qty } });
    }
    // Void destination batches created by this transfer
    await StockBatch.updateMany(
      { sourceTransaction: txn._id },
      { $set: { isVoided: true, remainingQty: 0 } }
    );
  }
}
