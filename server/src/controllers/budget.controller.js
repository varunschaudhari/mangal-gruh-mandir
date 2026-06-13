import ExpenseBudget from '../models/ExpenseBudget.js';
import { EXPENSE_CATEGORIES } from '../models/Expense.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';

const fullBudgetList = (budgets, y, m) => {
  const map = {};
  budgets.forEach((b) => { map[b.category] = b.budgetAmount; });
  return EXPENSE_CATEGORIES.map((cat) => ({
    category:     cat,
    budgetAmount: map[cat] ?? 0,
    year: y, month: m,
  }));
};

// GET /budgets?year=&month=
export const getBudgets = asyncHandler(async (req, res) => {
  const y = Number(req.query.year)  || new Date().getFullYear();
  const m = Number(req.query.month) || new Date().getMonth() + 1;

  const budgets = await ExpenseBudget.find({ year: y, month: m }).lean();
  res.json(new ApiResponse(200, { year: y, month: m, budgets: fullBudgetList(budgets, y, m) }));
});

// PUT /budgets — bulk upsert { year, month, budgets: { category: amount } }
export const upsertBudgets = asyncHandler(async (req, res) => {
  const { year, month, budgets } = req.body;
  if (!year || !month)  throw new ApiError(400, 'year and month are required');
  if (!budgets || typeof budgets !== 'object') throw new ApiError(400, 'budgets object required');

  const y = Number(year);
  const m = Number(month);

  const ops = Object.entries(budgets)
    .filter(([cat]) => EXPENSE_CATEGORIES.includes(cat))
    .map(([category, budgetAmount]) => ({
      updateOne: {
        filter: { year: y, month: m, category },
        update: { $set: { budgetAmount: Number(budgetAmount) || 0 } },
        upsert: true,
      },
    }));

  if (ops.length) await ExpenseBudget.bulkWrite(ops);

  const result = await ExpenseBudget.find({ year: y, month: m }).lean();
  res.json(new ApiResponse(200, fullBudgetList(result, y, m), 'Budgets saved'));
});

// GET /budgets/copy-prev?year=&month= — returns previous month's budgets
export const copyPreviousMonth = asyncHandler(async (req, res) => {
  let y = Number(req.query.year)  || new Date().getFullYear();
  let m = Number(req.query.month) || new Date().getMonth() + 1;

  m -= 1;
  if (m === 0) { m = 12; y -= 1; }

  const budgets = await ExpenseBudget.find({ year: y, month: m }).lean();
  res.json(new ApiResponse(200, { year: y, month: m, budgets: fullBudgetList(budgets, y, m) }));
});
