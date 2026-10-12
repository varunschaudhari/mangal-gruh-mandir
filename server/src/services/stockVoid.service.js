import StockTransaction from '../models/StockTransaction.js';
import ApiError from '../utils/ApiError.js';
import { restoreBatchesForVoid, usedFromBatchesOf } from './fifo.service.js';
import { updateBalancesForTransaction } from './stockBalance.service.js';

/**
 * Voids the stock-ins made by a purchase entry or an in-kind donation — all of them or none.
 * Refused when any of that stock has already been used (taken out or moved on): voiding only
 * some items would leave the record half-voided.
 */
export async function voidStockIns(txnIds, { userId, reason, what }) {
  const txns = await StockTransaction.find({ _id: { $in: txnIds.filter(Boolean) }, isVoided: false });
  if (!txns.length) return;

  const used = await usedFromBatchesOf(txns.map((t) => t._id));
  if (used > 0) {
    throw new ApiError(400, `Cannot void: ${used} unit(s) from this ${what} have already been used. Void those stock-outs or transfers first.`);
  }

  for (const txn of txns) {
    await restoreBatchesForVoid(txn);
    txn.isVoided = true;
    txn.voidedBy = userId;
    txn.voidedAt = new Date();
    txn.voidReason = reason;
    await txn.save();
    await updateBalancesForTransaction(txn);
  }
}
