import PurchaseEntry from '../models/PurchaseEntry.js';
import { nextNumber } from './sequence.service.js';

/** PUR-YYYY-NNN, numbered per year of the received date. */
export function generatePurchaseEntryNumber(receivedDate) {
  const year = new Date(receivedDate).getFullYear();
  return nextNumber({ prefix: `PUR-${year}-`, sources: [{ model: PurchaseEntry, field: 'entryNumber' }] });
}
