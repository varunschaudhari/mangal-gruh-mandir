import { test } from 'node:test';
import assert from 'node:assert/strict';
import validate from '../middleware/validate.js';
import * as expense from './expense.schemas.js';

// Runs the middleware like Express would and returns what it produced.
function run(schemas, req) {
  let error;
  validate(schemas)(req, {}, (err) => { error = err; });
  return { req, error };
}

const goodExpense = () => ({
  category: 'electricity', description: '  Bill for October  ', amount: '1250.50',
  expenseDate: '2026-10-12', paymentMode: 'upi', payee: '', notes: null, extra: 'ignored',
});

test('a valid body reaches the controller cleaned: trimmed, numbers converted, blanks and unknown fields dropped', () => {
  const { req, error } = run(expense.createExpense, { body: goodExpense() });
  assert.equal(error, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(req.body)), {
    category: 'electricity', description: 'Bill for October', amount: 1250.5, expenseDate: '2026-10-12', paymentMode: 'upi',
  });
  assert.equal(req.body.payee, undefined);
  assert.equal('extra' in req.body, false);
});

test('every problem is reported at once, as a 400 with readable messages', () => {
  const { error } = run(expense.createExpense, { body: { category: 'party', amount: 0, description: '   ' } });
  assert.equal(error.statusCode, 400);
  const fields = error.errors.map((e) => e.field).sort();
  assert.deepEqual(fields, ['amount', 'category', 'description', 'expenseDate', 'paymentMode']);
  assert.match(error.message, /Amount must be more than 0/);
  assert.match(error.message, /Description is required/);
  assert.match(error.message, /Expense date is required/);
  assert.match(error.message, /Category must be one of: electricity/);
});

test('text that is not a number or a date is refused', () => {
  const { error } = run(expense.createExpense, { body: { ...goodExpense(), amount: 'abc', expenseDate: '31/31/2026' } });
  assert.match(error.message, /Amount must be a number/);
  assert.match(error.message, /Expense date is not a valid date/);
});

test('ids in the URL are checked', () => {
  assert.equal(run(expense.expenseById, { params: { id: '65f0c0ffee0000000000abcd' } }).error, undefined);
  assert.match(run(expense.expenseById, { params: { id: 'nope' } }).error.message, /Expense id is not valid/);
});

test('query strings: blanks ignored, numbers converted, limits enforced', () => {
  const ok = run(expense.listExpenses, { query: { category: '', status: 'approved', limit: '200' } });
  assert.equal(ok.error, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(ok.req.query)), { status: 'approved', limit: 200 });
  assert.match(run(expense.expenseSummary, { query: { month: '13' } }).error.message, /Month can be at most 12/);
});

test('a reason is required to reject or void', () => {
  const params = { id: '65f0c0ffee0000000000abcd' };
  assert.match(run(expense.voidExpense, { params, body: { voidReason: '  ' } }).error.message, /Void reason is required/);
  assert.match(run(expense.rejectExpense, { params, body: {} }).error.message, /Rejection reason is required/);
});
