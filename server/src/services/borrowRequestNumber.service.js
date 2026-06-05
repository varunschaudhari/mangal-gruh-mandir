import BorrowGroup from '../models/BorrowGroup.js';
import AssetTransaction from '../models/AssetTransaction.js';

/**
 * Generates the next BR-YYYY-NNNN number, shared across single borrows
 * and borrow groups so refs are always unique and sequential per year.
 */
export async function generateBorrowRequestNumber() {
  const year   = new Date().getFullYear();
  const prefix = `BR-${year}-`;

  // Query both collections: group numbers and top-level single-borrow txn numbers
  const [lastGroup, lastTxn] = await Promise.all([
    BorrowGroup.findOne(
      { groupNumber: { $regex: `^${prefix}` } },
      { groupNumber: 1 },
      { sort: { groupNumber: -1 } }
    ).lean(),
    AssetTransaction.findOne(
      { transactionNumber: { $regex: `^${prefix}`, $not: /\// } },
      { transactionNumber: 1 },
      { sort: { transactionNumber: -1 } }
    ).lean(),
  ]);

  const extractSeq = (s) => {
    if (!s) return 0;
    const parts = s.split('-');
    return parseInt(parts[parts.length - 1], 10) || 0;
  };

  const maxSeq = Math.max(
    extractSeq(lastGroup?.groupNumber),
    extractSeq(lastTxn?.transactionNumber),
  );

  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}
