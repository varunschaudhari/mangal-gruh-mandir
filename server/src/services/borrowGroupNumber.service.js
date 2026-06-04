import BorrowGroup from '../models/BorrowGroup.js';

export async function generateBorrowGroupNumber() {
  const dateStr = formatDateKey(new Date());
  const prefix  = `GRP-${dateStr}-`;

  const last = await BorrowGroup.findOne(
    { groupNumber: { $regex: `^${prefix}` } },
    { groupNumber: 1 },
    { sort: { groupNumber: -1 } }
  ).lean();

  let seq = 1;
  if (last?.groupNumber) {
    const parts = last.groupNumber.split('-');
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
