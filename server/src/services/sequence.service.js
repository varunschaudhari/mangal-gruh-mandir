import Sequence from '../models/Sequence.js';

// Document numbers (expenses, donations, payments, purchases, stock transactions, borrow
// requests, asset and staff codes) come from one atomic counter per prefix. Reading the last
// number and adding 1 gave two desks saving at the same moment the same number, and one of
// the saves failed.

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Number after the prefix — compared as a number, so …-1000 counts as higher than …-999. */
export const tailNumber = (value, prefix) => {
  const s = String(value || '');
  if (!s.startsWith(prefix)) return 0;
  const rest = s.slice(prefix.length);
  return /^\d+$/.test(rest) ? parseInt(rest, 10) : 0;
};

/** Highest number already used for this prefix, from the documents themselves. */
async function highestUsed(prefix, sources) {
  let max = 0;
  for (const { model, field, filter } of sources) {
    const match = { [field]: { $regex: `^${escape(prefix)}` } };
    const docs = await model.find(filter ? { $and: [match, filter] } : match).select(field).lean();
    for (const d of docs) max = Math.max(max, tailNumber(d[field], prefix));
  }
  return max;
}

/**
 * The next number for `prefix`, e.g. nextNumber({ prefix: 'EXP-2026-', sources: [{ model: Expense, field: 'expenseNumber' }] })
 * → "EXP-2026-015". The first time a prefix is used its counter starts after the highest number
 * already saved, so existing numbering simply continues.
 */
export async function nextNumber({ prefix, width = 3, sources = [] }) {
  const take = () => Sequence.findOneAndUpdate({ _id: prefix }, { $inc: { seq: 1 } }, { returnDocument: 'after' }).lean();
  let doc = await take();
  if (!doc) {
    const start = await highestUsed(prefix, sources);
    try {
      await Sequence.create({ _id: prefix, seq: start });
    } catch (err) {
      if (err.code !== 11000) throw err; // someone else started it at the same moment — fine
    }
    doc = await take();
  }
  return `${prefix}${String(doc.seq).padStart(width, '0')}`;
}

/** YYYYMMDD of a date (server runs on India time). */
export const dayKey = (date = new Date()) => {
  const d = new Date(date);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};
