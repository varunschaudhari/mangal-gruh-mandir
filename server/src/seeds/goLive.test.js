import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'fs';
import { CLEAR, KEEP, MODELS_DIR, PART } from './goLive.js';

// A model added later must be put in one of the go-live lists, so it is never silently
// skipped (left full of test data) or wiped by accident.
test('every model is either kept, emptied or kept in part at go-live', () => {
  const models = readdirSync(MODELS_DIR)
    .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js') && f !== 'singleton.js')
    .map((f) => f.replace(/\.js$/, ''));
  const listed = [...KEEP, ...CLEAR, ...PART];
  assert.deepEqual(models.filter((m) => !listed.includes(m)), [], 'models missing from goLive.js');
  assert.deepEqual(listed.filter((m) => !models.includes(m)), [], 'goLive.js names a model that does not exist');
  assert.equal(new Set(listed).size, listed.length, 'a model is in two lists');
});

test('the setup the temple entered is kept, the activity is not', () => {
  for (const m of ['Settings', 'Role', 'SevaType', 'BookingBatch', 'DonationOccasion', 'MahaprasadOccasion', 'AttendanceSettings']) assert.ok(KEEP.includes(m), m);
  for (const m of ['Donation', 'Booking', 'MahaprasadCoupon', 'StockTransaction', 'Product', 'Supplier', 'Sequence', 'DailyCounter', 'AuditLog']) assert.ok(CLEAR.includes(m), m);
  assert.ok(PART.includes('User'));
});
