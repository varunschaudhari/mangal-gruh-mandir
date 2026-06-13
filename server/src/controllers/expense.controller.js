import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Expense from '../models/Expense.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { generateExpenseNumber } from '../services/expenseNumber.service.js';
import { logAction } from '../services/audit.service.js';
import { generateExpenseReport } from '../services/expensePdf.service.js';
import Settings from '../models/Settings.js';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '../../uploads/expenses');

const POPULATE = [
  { path: 'createdBy',  select: 'name' },
  { path: 'approvedBy', select: 'name' },
  { path: 'rejectedBy', select: 'name' },
  { path: 'voidedBy',   select: 'name' },
];

// POST /expenses
export const createExpense = asyncHandler(async (req, res) => {
  const { category, description, amount, payee, expenseDate, paymentMode, referenceNumber, notes } = req.body;

  if (!category)    throw new ApiError(400, 'Category is required');
  if (!description) throw new ApiError(400, 'Description is required');
  if (!amount || amount <= 0) throw new ApiError(400, 'Amount must be greater than 0');
  if (!expenseDate) throw new ApiError(400, 'Expense date is required');
  if (!paymentMode) throw new ApiError(400, 'Payment mode is required');

  const expenseNumber = await generateExpenseNumber(expenseDate);

  const expense = await Expense.create({
    expenseNumber,
    category,
    description,
    amount:          Number(amount),
    payee:           payee           || undefined,
    expenseDate:     new Date(expenseDate),
    paymentMode,
    referenceNumber: referenceNumber || undefined,
    notes:           notes           || undefined,
    createdBy:       req.user._id,
  });

  logAction(req, {
    action: 'expense.create', entity: 'Expense',
    entityId: expenseNumber, entityRef: expense._id,
    meta: { category, amount, paymentMode },
  });

  const populated = await Expense.findById(expense._id).populate(POPULATE).lean();
  res.status(201).json(new ApiResponse(201, populated, 'Expense created'));
});

// GET /expenses
export const getExpenses = asyncHandler(async (req, res) => {
  const { category, status, from, to, page = 1, limit = 50 } = req.query;

  const filter = {};
  if (category) filter.category = category;
  if (status)   filter.status   = status;
  if (from || to) {
    filter.expenseDate = {};
    if (from) filter.expenseDate.$gte = new Date(from);
    if (to)   { const d = new Date(to); d.setHours(23, 59, 59, 999); filter.expenseDate.$lte = d; }
  }

  const total    = await Expense.countDocuments(filter);
  const expenses = await Expense.find(filter)
    .populate(POPULATE)
    .sort({ expenseDate: -1, createdAt: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .lean();

  res.json(new ApiResponse(200, {
    expenses,
    pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
  }));
});

// GET /expenses/summary — monthly totals by category
export const getExpenseSummary = asyncHandler(async (req, res) => {
  const { year, month } = req.query;
  const y = Number(year)  || new Date().getFullYear();
  const m = Number(month) || new Date().getMonth() + 1;

  const from = new Date(y, m - 1, 1);
  const to   = new Date(y, m, 0, 23, 59, 59, 999);

  const rows = await Expense.aggregate([
    { $match: { expenseDate: { $gte: from, $lte: to }, status: 'approved' } },
    { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    { $sort: { total: -1 } },
  ]);

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  res.json(new ApiResponse(200, { year: y, month: m, rows, grandTotal }));
});

// GET /expenses/:id
export const getExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id).populate(POPULATE).lean();
  if (!expense) throw new ApiError(404, 'Expense not found');
  res.json(new ApiResponse(200, expense));
});

// PATCH /expenses/:id/approve
export const approveExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw new ApiError(404, 'Expense not found');
  if (expense.status !== 'pending_approval') throw new ApiError(400, `Cannot approve — status is ${expense.status}`);

  expense.status     = 'approved';
  expense.approvedBy = req.user._id;
  expense.approvedAt = new Date();
  await expense.save();

  logAction(req, {
    action: 'expense.approve', entity: 'Expense',
    entityId: expense.expenseNumber, entityRef: expense._id,
    meta: { amount: expense.amount },
  });

  const populated = await Expense.findById(expense._id).populate(POPULATE).lean();
  res.json(new ApiResponse(200, populated, 'Expense approved'));
});

// PATCH /expenses/:id/reject
export const rejectExpense = asyncHandler(async (req, res) => {
  const { rejectionReason } = req.body;
  if (!rejectionReason?.trim()) throw new ApiError(400, 'Rejection reason is required');

  const expense = await Expense.findById(req.params.id);
  if (!expense) throw new ApiError(404, 'Expense not found');
  if (expense.status !== 'pending_approval') throw new ApiError(400, `Cannot reject — status is ${expense.status}`);

  expense.status          = 'rejected';
  expense.rejectedBy      = req.user._id;
  expense.rejectedAt      = new Date();
  expense.rejectionReason = rejectionReason.trim();
  await expense.save();

  logAction(req, {
    action: 'expense.reject', entity: 'Expense',
    entityId: expense.expenseNumber, entityRef: expense._id,
    meta: { rejectionReason },
  });

  const populated = await Expense.findById(expense._id).populate(POPULATE).lean();
  res.json(new ApiResponse(200, populated, 'Expense rejected'));
});

// PATCH /expenses/:id/void
export const voidExpense = asyncHandler(async (req, res) => {
  const { voidReason } = req.body;
  if (!voidReason?.trim()) throw new ApiError(400, 'Void reason is required');

  const expense = await Expense.findById(req.params.id);
  if (!expense) throw new ApiError(404, 'Expense not found');
  if (expense.status === 'voided')  throw new ApiError(400, 'Already voided');
  if (expense.status === 'rejected') throw new ApiError(400, 'Cannot void a rejected expense');

  expense.status    = 'voided';
  expense.voidedBy  = req.user._id;
  expense.voidedAt  = new Date();
  expense.voidReason = voidReason.trim();
  await expense.save();

  logAction(req, {
    action: 'expense.void', entity: 'Expense',
    entityId: expense.expenseNumber, entityRef: expense._id,
    meta: { voidReason },
  });

  const populated = await Expense.findById(expense._id).populate(POPULATE).lean();
  res.json(new ApiResponse(200, populated, 'Expense voided'));
});

// POST /expenses/:id/receipt  (multipart/form-data, field: receipt)
export const uploadExpenseReceipt = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw new ApiError(404, 'Expense not found');
  if (!req.file)  throw new ApiError(400, 'No file uploaded');

  // Delete old file if one existed
  if (expense.receiptPath) {
    const old = path.join(UPLOADS_DIR, expense.receiptPath);
    if (fs.existsSync(old)) fs.unlinkSync(old);
  }

  expense.receiptPath = req.file.filename;
  await expense.save();

  logAction(req, {
    action: 'expense.receipt_upload', entity: 'Expense',
    entityId: expense.expenseNumber, entityRef: expense._id,
  });
  res.json(new ApiResponse(200, { receiptPath: expense.receiptPath }, 'Receipt uploaded'));
});

// DELETE /expenses/:id/receipt
export const removeExpenseReceipt = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw new ApiError(404, 'Expense not found');
  if (!expense.receiptPath) throw new ApiError(400, 'No receipt to remove');

  const filePath = path.join(UPLOADS_DIR, expense.receiptPath);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  expense.receiptPath = undefined;
  await expense.save();

  logAction(req, {
    action: 'expense.receipt_remove', entity: 'Expense',
    entityId: expense.expenseNumber, entityRef: expense._id,
  });
  res.json(new ApiResponse(200, {}, 'Receipt removed'));
});

// GET /expenses/export/pdf
export const exportExpensesPdf = asyncHandler(async (req, res) => {
  const { category, status, from, to } = req.query;

  const filter = {};
  if (category) filter.category = category;
  if (status)   filter.status   = status;
  if (from || to) {
    filter.expenseDate = {};
    if (from) filter.expenseDate.$gte = new Date(from);
    if (to)   { const d = new Date(to); d.setHours(23, 59, 59, 999); filter.expenseDate.$lte = d; }
  }

  const expenses = await Expense.find(filter)
    .populate(POPULATE)
    .sort({ expenseDate: -1 })
    .lean();

  const settingsDoc = await Settings.findOne().lean();
  const templeName  = settingsDoc?.templeName || 'Mangal Grah Mandir, Amalner';

  generateExpenseReport(res, { expenses, from, to, templeName });
});
