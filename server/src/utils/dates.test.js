import '../config/timezone.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_TIMEZONE, localDateStr } from './dates.js';

test('server runs on India time by default', () => {
  assert.equal(APP_TIMEZONE, 'Asia/Kolkata');
  assert.equal(new Date('2026-01-01T00:00:00Z').getTimezoneOffset(), -330);
});

test('localDateStr keeps 00:00–05:30 IST on the same day', () => {
  // 01:30 IST on 11 Oct = 20:00 UTC on 10 Oct
  assert.equal(localDateStr(new Date('2026-10-10T20:00:00Z')), '2026-10-11');
});

test('a YYYY-MM-DD query covers that whole IST day (controllers use setHours on it)', () => {
  const start = new Date('2026-10-11'); start.setHours(0, 0, 0, 0);
  const end = new Date('2026-10-11'); end.setHours(23, 59, 59, 999);
  assert.equal(start.toISOString(), '2026-10-10T18:30:00.000Z');
  assert.equal(end.toISOString(), '2026-10-11T18:29:59.999Z');
});

test('coupon dates (noon local) keep their calendar day', () => {
  const couponDate = new Date('2026-10-11'); couponDate.setHours(12, 0, 0, 0);
  assert.equal(localDateStr(couponDate).replace(/-/g, ''), '20261011');
});
