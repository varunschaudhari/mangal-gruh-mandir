import AssetTransaction from '../models/AssetTransaction.js';
import BorrowGroup from '../models/BorrowGroup.js';

/**
 * Recalculates and saves the group status based on its individual transactions.
 * Call this after any individual transaction changes (checkout, return, cancel).
 */
export async function recomputeGroupStatus(groupId) {
  if (!groupId) return;

  const txns        = await AssetTransaction.find({ group: groupId }).lean();
  const active      = txns.filter((t) => t.status !== 'cancelled');

  let newStatus;

  if (active.length === 0) {
    newStatus = 'cancelled';
  } else if (active.every((t) => t.status === 'returned')) {
    newStatus = 'returned';
  } else if (active.some((t) => t.status === 'overdue')) {
    newStatus = 'overdue';
  } else if (active.some((t) => t.status === 'returned')) {
    newStatus = 'partially_returned';
  } else if (active.some((t) => t.status === 'checked_out')) {
    newStatus = 'checked_out';
  } else {
    newStatus = 'approved';
  }

  await BorrowGroup.findByIdAndUpdate(groupId, { $set: { status: newStatus } });
  return newStatus;
}
