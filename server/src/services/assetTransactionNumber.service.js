import AssetTransaction from '../models/AssetTransaction.js';
import { dayKey, nextNumber } from './sequence.service.js';

/** AST-YYYYMMDD-NNN (used by the asset test-data seed). */
export function generateAssetTransactionNumber() {
  return nextNumber({ prefix: `AST-${dayKey()}-`, sources: [{ model: AssetTransaction, field: 'transactionNumber' }] });
}
