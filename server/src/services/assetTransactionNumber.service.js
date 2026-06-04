import AssetTransaction from '../models/AssetTransaction.js';

export async function generateAssetTransactionNumber() {
  const dateStr = formatDateKey(new Date());
  const prefix  = `AST-${dateStr}-`;

  const last = await AssetTransaction.findOne(
    { transactionNumber: { $regex: `^${prefix}` } },
    { transactionNumber: 1 },
    { sort: { transactionNumber: -1 } }
  ).lean();

  let seq = 1;
  if (last?.transactionNumber) {
    const parts = last.transactionNumber.split('-');
    seq = parseInt(parts[parts.length - 1], 10) + 1;
  }

  return `${prefix}${String(seq).padStart(3, '0')}`;
}

function formatDateKey(date) {
  const d   = new Date(date);
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
