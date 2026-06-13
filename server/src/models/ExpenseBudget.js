import mongoose from 'mongoose';
import { EXPENSE_CATEGORIES } from './Expense.js';

const expenseBudgetSchema = new mongoose.Schema({
  year:         { type: Number, required: true },
  month:        { type: Number, required: true, min: 1, max: 12 },
  category:     { type: String, required: true, enum: EXPENSE_CATEGORIES },
  budgetAmount: { type: Number, required: true, min: 0, default: 0 },
}, { timestamps: true });

expenseBudgetSchema.index({ year: 1, month: 1, category: 1 }, { unique: true });

export default mongoose.model('ExpenseBudget', expenseBudgetSchema);
