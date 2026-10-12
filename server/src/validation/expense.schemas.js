import { z } from 'zod';
import { EXPENSE_CATEGORIES } from '../models/Expense.js';
import { amount, date, idParams, oneOf, optionalDate, optionalNumber, optionalOneOf, optionalText, paging, text } from './common.js';

export const PAYMENT_MODES = ['cash', 'upi', 'cheque', 'bank'];
const STATUSES = ['pending_approval', 'approved', 'rejected', 'voided'];

const params = idParams('Expense id');

const filters = {
  category: optionalOneOf(EXPENSE_CATEGORIES, 'Category'),
  status: optionalOneOf(STATUSES, 'Status'),
  from: optionalDate('From date'),
  to: optionalDate('To date'),
};

export const listExpenses = { query: z.object({ ...filters, ...paging }) };
export const exportExpenses = { query: z.object(filters) };
export const expenseSummary = {
  query: z.object({
    year: optionalNumber('Year', { integer: true, min: 2000, max: 2100 }),
    month: optionalNumber('Month', { integer: true, min: 1, max: 12 }),
  }),
};

export const createExpense = {
  body: z.object({
    category: oneOf(EXPENSE_CATEGORIES, 'Category'),
    description: text('Description', { max: 500 }),
    amount: amount('Amount'),
    payee: optionalText('Payee', { max: 150 }),
    expenseDate: date('Expense date'),
    paymentMode: oneOf(PAYMENT_MODES, 'Payment mode'),
    referenceNumber: optionalText('Reference number', { max: 100 }),
    notes: optionalText('Notes', { max: 2000 }),
  }),
};

export const expenseById = { params };
export const rejectExpense = { params, body: z.object({ rejectionReason: text('Rejection reason', { max: 500 }) }) };
export const voidExpense = { params, body: z.object({ voidReason: text('Void reason', { max: 500 }) }) };
