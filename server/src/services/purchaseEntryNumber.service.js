import PurchaseEntry from '../models/PurchaseEntry.js';

/**
 * Generates PUR-YYYY-NNN based on the received date (year-scoped).
 * Matches the pattern used by transactionNumber.service.js.
 */
export async function generatePurchaseEntryNumber(receivedDate) {
  const year = new Date(receivedDate).getFullYear();
  const prefix = `PUR-${year}-`;

  // Find the highest sequence number for this year
  const last = await PurchaseEntry.findOne(
    { entryNumber: { $regex: `^${prefix}` } },
    { entryNumber: 1 },
    { sort: { entryNumber: -1 } }
  ).lean();

  let seq = 1;
  if (last?.entryNumber) {
    const parts = last.entryNumber.split('-');
    seq = parseInt(parts[parts.length - 1], 10) + 1;
  }

  return `${prefix}${String(seq).padStart(3, '0')}`;
}
