import Expense, { EXPENSE_CATEGORIES, CATEGORY_LABELS } from '../models/Expense.js';
import Donation from '../models/Donation.js';
import ExpenseBudget from '../models/ExpenseBudget.js';
import Settings from '../models/Settings.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { generatePnLReport } from '../services/pnlPdf.service.js';

export const buildPnLData = async (y, m) => {
  const from = new Date(y, m - 1, 1);
  const to   = new Date(y, m, 0, 23, 59, 59, 999);

  const [expenseRows, pendingAgg, budgets, donationAgg] = await Promise.all([
    Expense.aggregate([
      { $match: { expenseDate: { $gte: from, $lte: to }, status: 'approved' } },
      { $group: { _id: '$category', actual: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Expense.aggregate([
      { $match: { expenseDate: { $gte: from, $lte: to }, status: 'pending_approval' } },
      { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$amount' } } },
    ]),
    ExpenseBudget.find({ year: y, month: m }).lean(),
    Donation.aggregate([
      { $match: { date: { $gte: from, $lte: to } } },
      { $group: {
        _id:       null,
        cashTotal: { $sum: '$cashAmount' },
        kindTotal: { $sum: '$totalEstimatedValue' },
        count:     { $sum: 1 },
      }},
    ]),
  ]);

  const budgetMap = {};
  budgets.forEach((b) => { budgetMap[b.category] = b.budgetAmount; });

  const actualMap = {};
  expenseRows.forEach((r) => { actualMap[r._id] = { actual: r.actual, count: r.count }; });

  const byCategory = EXPENSE_CATEGORIES.map((cat) => ({
    category: cat,
    label:    CATEGORY_LABELS[cat],
    actual:   actualMap[cat]?.actual || 0,
    count:    actualMap[cat]?.count  || 0,
    budget:   budgetMap[cat]         || 0,
  }));

  const income      = donationAgg[0] || {};
  const incomeCash  = income.cashTotal || 0;
  const incomeKind  = income.kindTotal || 0;
  const incomeTotal = incomeCash + incomeKind;
  const expenseTotal = byCategory.reduce((s, r) => s + r.actual, 0);
  const budgetTotal  = byCategory.reduce((s, r) => s + r.budget, 0);
  const pending      = pendingAgg[0] || { count: 0, amount: 0 };

  return {
    year: y, month: m,
    income: {
      cash:          incomeCash,
      kind:          incomeKind,
      total:         incomeTotal,
      donationCount: income.count || 0,
    },
    expenses: {
      byCategory,
      total:         expenseTotal,
      budgetTotal,
      pendingCount:  pending.count  || 0,
      pendingAmount: pending.amount || 0,
    },
    net: incomeTotal - expenseTotal,
  };
};

// GET /pnl?year=&month=
export const getPnL = asyncHandler(async (req, res) => {
  const y = Number(req.query.year)  || new Date().getFullYear();
  const m = Number(req.query.month) || new Date().getMonth() + 1;

  const data = await buildPnLData(y, m);
  res.json(new ApiResponse(200, data));
});

// GET /pnl/trend?year= — all months up to current in that year
export const getPnLTrend = asyncHandler(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const now  = new Date();
  const lastMonth = now.getFullYear() === year ? now.getMonth() + 1 : 12;

  const results = await Promise.all(
    Array.from({ length: lastMonth }, (_, i) => buildPnLData(year, i + 1))
  );

  const trend = results.map((d) => ({
    month:    d.month,
    income:   d.income.total,
    expenses: d.expenses.total,
    net:      d.net,
  }));

  res.json(new ApiResponse(200, { year, trend }));
});

// GET /pnl/export/pdf?year=&month=
export const exportPnLPdf = asyncHandler(async (req, res) => {
  const y = Number(req.query.year)  || new Date().getFullYear();
  const m = Number(req.query.month) || new Date().getMonth() + 1;

  const [data, settingsDoc] = await Promise.all([
    buildPnLData(y, m),
    Settings.findOne().lean(),
  ]);

  const templeName = settingsDoc?.templeName || 'Mangal Grah Mandir, Amalner';
  generatePnLReport(res, { data, templeName });
});
