import Expense from '../models/Expense.js';

export async function generateExpenseNumber(expenseDate) {
  const year   = new Date(expenseDate).getFullYear();
  const prefix = `EXP-${year}-`;

  const last = await Expense.findOne(
    { expenseNumber: { $regex: `^${prefix}` } },
    { expenseNumber: 1 },
    { sort: { expenseNumber: -1 } }
  ).lean();

  let seq = 1;
  if (last?.expenseNumber) {
    const parts = last.expenseNumber.split('-');
    seq = parseInt(parts[parts.length - 1], 10) + 1;
  }

  return `${prefix}${String(seq).padStart(3, '0')}`;
}
