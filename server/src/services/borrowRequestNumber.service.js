import BorrowGroup from '../models/BorrowGroup.js';
import AssetTransaction from '../models/AssetTransaction.js';
import { nextNumber } from './sequence.service.js';

/**
 * BR-YYYY-NNNN, shared by single borrows and borrow groups so refs are unique and sequential
 * per year. (Items inside a group are numbered BR-YYYY-NNNN/1, /2 … from the group's number.)
 */
export function generateBorrowRequestNumber() {
  return nextNumber({
    prefix: `BR-${new Date().getFullYear()}-`,
    width: 4,
    sources: [
      { model: BorrowGroup, field: 'groupNumber' },
      { model: AssetTransaction, field: 'transactionNumber', filter: { transactionNumber: { $not: /\// } } },
    ],
  });
}
