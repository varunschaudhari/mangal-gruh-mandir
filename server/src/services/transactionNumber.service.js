import StockTransaction from '../models/StockTransaction.js';
import { dayKey, nextNumber } from './sequence.service.js';

/** TXN-YYYYMMDD-NNN, numbered per transaction date. */
export function generateTransactionNumber(transactionDate) {
  return nextNumber({ prefix: `TXN-${dayKey(transactionDate)}-`, sources: [{ model: StockTransaction, field: 'transactionNumber' }] });
}
