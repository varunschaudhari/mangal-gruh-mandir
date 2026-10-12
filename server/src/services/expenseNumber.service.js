import Expense from '../models/Expense.js';
import { nextNumber } from './sequence.service.js';

/** EXP-YYYY-NNN, numbered per year of the expense date. */
export function generateExpenseNumber(expenseDate) {
  const year = new Date(expenseDate).getFullYear();
  return nextNumber({ prefix: `EXP-${year}-`, sources: [{ model: Expense, field: 'expenseNumber' }] });
}
