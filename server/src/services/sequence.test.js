import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, tailNumber } from './sequence.service.js';

test('numbers after the prefix are compared as numbers, so …-1000 is higher than …-999', () => {
  assert.equal(tailNumber('EXP-2026-999', 'EXP-2026-'), 999);
  assert.equal(tailNumber('EXP-2026-1000', 'EXP-2026-'), 1000);
  assert.ok(tailNumber('EXP-2026-1000', 'EXP-2026-') > tailNumber('EXP-2026-999', 'EXP-2026-'));
});

test('values that are not "prefix + number" count as 0', () => {
  assert.equal(tailNumber('BR-2026-0007/2', 'BR-2026-'), 0);   // an item inside a borrow group
  assert.equal(tailNumber('EXP-2025-010', 'EXP-2026-'), 0);
  assert.equal(tailNumber(undefined, 'STF-'), 0);
  assert.equal(tailNumber('BR-2026-0042', 'BR-2026-'), 42);
});

test('day key is YYYYMMDD', () => {
  assert.equal(dayKey(new Date(2026, 9, 5, 23, 30)), '20261005');
});
