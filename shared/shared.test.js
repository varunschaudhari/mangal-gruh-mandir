// Run by the server's `npm test` (node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAddress, isPincode } from './address.js';
import { dayCode } from './attendanceCodes.js';
import { localDateStr } from './dates.js';

test('address: parts joined, repeated names once, PIN last', () => {
  assert.equal(
    formatAddress({ address: '12, Ganesh Peth', area: 'Amalner', city: 'Amalner', district: 'Jalgaon', state: 'Maharashtra', pincode: '425401' }),
    '12, Ganesh Peth, Amalner, Dist. Jalgaon, Maharashtra – 425401',
  );
  assert.equal(formatAddress({ pincode: '425401' }), '425401');
  assert.equal(formatAddress(), '');
});

test('PIN code: 6 digits, not starting with 0', () => {
  assert.equal(isPincode('425401'), true);
  assert.equal(isPincode('012345'), false);
  assert.equal(isPincode('4254'), false);
});

test('register codes: leave cover decides PL / EL / A / UL; double shift gets +', () => {
  assert.equal(dayCode({ status: 'present' }), 'P');
  assert.equal(dayCode({ status: 'present', double: true }), 'P+');
  assert.equal(dayCode({ status: 'absent', cover: { paid: 1, extra: 0, unpaid: 0 } }), 'PL');
  assert.equal(dayCode({ status: 'absent', cover: { paid: 0, extra: 0.5, unpaid: 0.5 } }), 'EL');
  assert.equal(dayCode({ status: 'absent', cover: { paid: 0, extra: 0, unpaid: 1 } }), 'A');
  assert.equal(dayCode({ status: 'leave', cover: { paid: 0, extra: 0, unpaid: 1 } }), 'UL');
  assert.equal(dayCode({ status: 'unscheduled' }), 'U');
  assert.equal(dayCode({ status: 'upcoming', double: true }), '');
  assert.equal(dayCode(null), '');
});

test('local date: the India calendar day, not the UTC one', () => {
  // 00:30 local time on 1 Oct (in IST still 30 Sep in UTC)
  assert.equal(localDateStr(new Date(2026, 9, 1, 0, 30)), '2026-10-01');
  assert.equal(localDateStr('2026-10-12T12:00:00'), '2026-10-12');
});
