import StockBatch from '../models/StockBatch.js';
import ApiError from '../utils/ApiError.js';

const round = (n) => +Number(n).toFixed(6);

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

// Batches still holding stock, in the order they are used: expiry-dated first (earliest expiry
// first), then undated (oldest first).
async function availableBatches(productId, departmentId) {
  const [dated, undated] = await Promise.all([
    StockBatch.find({
      product: productId, department: departmentId,
      isVoided: false, remainingQty: { $gt: 0 }, expiryDate: { $ne: null },
    }).sort({ expiryDate: 1, createdAt: 1 }).lean(),
    StockBatch.find({
      product: productId, department: departmentId,
      isVoided: false, remainingQty: { $gt: 0 }, expiryDate: null,
    }).sort({ createdAt: 1 }).lean(),
  ]);
  return [...dated, ...undated];
}

// Adds `qty` to a batch (negative to take), rounded so decimals don't drift.
const adjust = (qty) => [{ $set: { remainingQty: { $round: [{ $add: ['$remainingQty', qty] }, 6] } } }];
const PIPELINE = { updatePipeline: true };   // Mongoose 9: allow the update above

/** Puts back what consumeBatches took (a save that failed afterwards, or a void). */
export async function returnBatches(consumed = []) {
  for (const c of consumed) await StockBatch.updateOne({ _id: c.batch }, adjust(c.qty), PIPELINE);
}

/**
 * FIFO deduction: takes `qtyNeeded` from the product's batches in this department, in the
 * order above. Returns [{ batch, qty }] taken. Throws a 400 if there isn't enough.
 *
 * Each batch is reduced only if it still holds what was read, so two counters taking the
 * same stock at the same moment can't both get it: the one that loses puts back what it took
 * and tries again with fresh numbers.
 */
export async function consumeBatches(productId, departmentId, qtyNeeded) {
  const qty = Number(qtyNeeded);
  if (!(qty > 0)) throw new ApiError(400, 'Quantity must be more than 0');

  for (let attempt = 0; attempt < 5; attempt++) {
    const batches = await availableBatches(productId, departmentId);
    const totalAvailable = round(batches.reduce((s, b) => s + b.remainingQty, 0));
    if (totalAvailable < qty) throw new ApiError(400, `Insufficient stock. Available: ${totalAvailable}`);

    const consumed = [];
    let remaining = qty;
    let raced = false;
    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = round(Math.min(batch.remainingQty, remaining));
      const r = await StockBatch.updateOne(
        { _id: batch._id, isVoided: false, remainingQty: { $gte: take } },
        adjust(-take),
        PIPELINE,
      );
      if (r.modifiedCount !== 1) { raced = true; break; }
      consumed.push({ batch: batch._id, qty: take });
      remaining = round(remaining - take);
    }
    if (!raced) return consumed;
    await returnBatches(consumed);
  }
  throw new ApiError(409, 'The stock changed while saving. Please try again.');
}

/**
 * TRANSFER, second half: the stock consumeBatches took from the source becomes new batches in
 * the destination, one per source batch, keeping expiry and batch details.
 */
export async function placeTransferred(consumed, productId, toDeptId, txn) {
  for (const c of consumed) {
    const src = await StockBatch.findById(c.batch).lean();
    await StockBatch.create({
      product: productId,
      department: toDeptId,
      originalQty: c.qty,
      remainingQty: c.qty,
      expiryDate: src?.expiryDate || null,
      manufacturingDate: src?.manufacturingDate || null,
      batchRef: src?.batchRef || null,
      sourceTransaction: txn._id,
    });
  }
}

/** FIFO for TRANSFER in one step (used by the test-data seed). */
export async function transferBatches(productId, fromDeptId, toDeptId, qty, txn) {
  const consumed = await consumeBatches(productId, fromDeptId, qty);
  await placeTransferred(consumed, productId, toDeptId, txn);
  return consumed;
}

/** Units already used (taken out, moved on) from the batches a transaction created. */
export async function usedFromBatchesOf(txnIds) {
  const batches = await StockBatch.find({ sourceTransaction: { $in: [].concat(txnIds) }, isVoided: false }).lean();
  return round(batches.reduce((s, b) => s + (b.originalQty - b.remainingQty), 0));
}

/**
 * Reverses a void:
 * - STOCK_IN / OPENING_BALANCE: voids the batch if none of it has been used, else throws.
 * - STOCK_OUT / WASTAGE: puts the consumed quantities back.
 * - TRANSFER: if none of the moved stock has been used at the destination, puts it back at
 *   the source and voids the destination batches; else throws (the stock would be counted twice).
 */
export async function restoreBatchesForVoid(txn) {
  const type = txn.transactionType;

  if (type === 'STOCK_IN' || type === 'OPENING_BALANCE') {
    const batch = await StockBatch.findOne({ sourceTransaction: txn._id, isVoided: false });
    if (!batch) return; // already voided or missing
    if (batch.remainingQty < batch.originalQty) {
      throw new ApiError(
        400,
        `Cannot void: ${round(batch.originalQty - batch.remainingQty)} units of this batch have already been consumed.`
      );
    }
    batch.isVoided = true;
    batch.remainingQty = 0;
    await batch.save();
    return;
  }

  if (type === 'STOCK_OUT' || type === 'WASTAGE') {
    await returnBatches(txn.consumedBatches || []);
    return;
  }

  if (type === 'TRANSFER') {
    const used = await usedFromBatchesOf(txn._id);
    if (used > 0) {
      throw new ApiError(
        400,
        `Cannot void: ${used} units moved by this transfer have already been used or moved on. Void those entries first.`
      );
    }
    await returnBatches(txn.consumedBatches || []);
    await StockBatch.updateMany(
      { sourceTransaction: txn._id },
      { $set: { isVoided: true, remainingQty: 0 } }
    );
  }
}
