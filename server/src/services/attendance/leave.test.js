import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocateLeave, extraAvailable } from './leave.js';

// days: { date: status | { status, ...extra } } → day objects as compute.js returns them
const mk = (spec) => Object.fromEntries(Object.entries(spec).map(([date, v]) => [date, {
  date, lateMinutes: 0, ...(typeof v === 'string' ? { status: v } : v),
}]));

test('absences use the month\'s paid leave first, then become unpaid', () => {
  const days = mk({ '2026-10-02': 'absent', '2026-10-05': 'absent', '2026-10-08': 'absent', '2026-10-09': 'absent', '2026-10-10': 'present' });
  const { months } = allocateLeave({ days, entitlement: 3 });
  assert.deepEqual(days['2026-10-02'].cover, { paid: 1, extra: 0, unpaid: 0 });
  assert.deepEqual(days['2026-10-09'].cover, { paid: 0, extra: 0, unpaid: 1 });
  assert.equal(days['2026-10-10'].cover, undefined);
  assert.equal(months['2026-10'].paidUsed, 3);
  assert.equal(months['2026-10'].unpaid, 1);
});

test('a half day uses half a leave', () => {
  const days = mk({ '2026-10-02': 'half_day', '2026-10-03': 'absent', '2026-10-04': 'absent', '2026-10-05': 'absent' });
  const { months } = allocateLeave({ days, entitlement: 3 });
  assert.deepEqual(days['2026-10-02'].cover, { paid: 0.5, extra: 0, unpaid: 0 });
  assert.deepEqual(days['2026-10-05'].cover, { paid: 0.5, extra: 0, unpaid: 0.5 });
  assert.equal(months['2026-10'].unpaid, 0.5);
});

test('unused paid leave lapses at the end of the month', () => {
  const days = mk({ '2026-09-10': 'present', '2026-10-02': 'absent', '2026-10-03': 'absent', '2026-10-04': 'absent', '2026-10-05': 'absent' });
  const { months } = allocateLeave({ days, entitlement: 3 });
  assert.equal(months['2026-09'].paidUsed, 0);
  assert.equal(months['2026-10'].paidUsed, 3);
  assert.equal(months['2026-10'].unpaid, 1);
});

test('extra leave from a double shift is used after paid leave, until it expires', () => {
  const credits = [{ date: '2026-09-20', expiresOn: '2026-11-19', amount: 1 }];
  const days = mk({ '2026-10-01': 'absent', '2026-10-02': 'absent', '2026-10-03': 'absent', '2026-10-04': 'absent', '2026-10-05': 'absent' });
  const res = allocateLeave({ days, entitlement: 3, credits });
  assert.deepEqual(days['2026-10-04'].cover, { paid: 0, extra: 1, unpaid: 0 });
  assert.deepEqual(days['2026-10-05'].cover, { paid: 0, extra: 0, unpaid: 1 });
  assert.equal(extraAvailable(res.credits, '2026-10-31'), 0);

  const late = mk({ '2026-11-25': 'absent', '2026-11-26': 'absent', '2026-11-27': 'absent', '2026-11-28': 'absent' });
  const expired = allocateLeave({ days: late, entitlement: 3, credits });
  assert.deepEqual(late['2026-11-28'].cover, { paid: 0, extra: 0, unpaid: 1 });
  assert.equal(extraAvailable(expired.credits, '2026-11-28'), 0);
});

test('extra leave can only be used after it was earned; soonest expiry goes first', () => {
  const credits = [
    { date: '2026-10-06', expiresOn: '2026-12-05', amount: 1 },
    { date: '2026-10-01', expiresOn: '2026-11-30', amount: 1 },
  ];
  const days = mk({ '2026-10-02': { status: 'leave', leaveType: 'extra' }, '2026-10-03': { status: 'leave', leaveType: 'extra' } });
  const res = allocateLeave({ days, entitlement: 0, credits });
  assert.deepEqual(days['2026-10-02'].cover, { paid: 0, extra: 1, unpaid: 0 });
  assert.deepEqual(days['2026-10-03'].cover, { paid: 0, extra: 0, unpaid: 1 }); // the other one is earned on the 6th
  assert.equal(res.credits.find((c) => c.date === '2026-10-01').used, 1);
  assert.equal(extraAvailable(res.credits, '2026-10-10'), 1);
});

test('planned leave: "unpaid" never uses the balance, "extra" spends extra leave before paid', () => {
  const credits = [{ date: '2026-09-01', expiresOn: '2026-10-31', amount: 1 }];
  const days = mk({
    '2026-10-02': { status: 'leave', leaveType: 'unpaid' },
    '2026-10-03': { status: 'leave', leaveType: 'extra' },
    '2026-10-04': { status: 'leave', leaveType: 'paid' },
  });
  const { months } = allocateLeave({ days, entitlement: 3, credits });
  assert.deepEqual(days['2026-10-02'].cover, { paid: 0, extra: 0, unpaid: 1 });
  assert.deepEqual(days['2026-10-03'].cover, { paid: 0, extra: 1, unpaid: 0 });
  assert.deepEqual(days['2026-10-04'].cover, { paid: 1, extra: 0, unpaid: 0 });
  assert.equal(months['2026-10'].paidUsed, 1);
});

test('late penalty: after the free late marks each late cuts half a day — only when switched on', () => {
  const spec = {};
  for (let d = 1; d <= 6; d += 1) spec[`2026-10-0${d}`] = { status: 'present', lateMinutes: 20 };
  const on = mk(spec);
  const resOn = allocateLeave({ days: on, entitlement: 3, latePenalty: { enabled: true, freeLates: 3 } });
  assert.equal(on['2026-10-03'].lateCut, undefined);
  assert.equal(on['2026-10-04'].lateNo, 4);
  assert.equal(on['2026-10-04'].lateCut, 0.5);
  assert.equal(resOn.months['2026-10'].lateCut, 1.5);

  const off = mk(spec);
  const resOff = allocateLeave({ days: off, entitlement: 3, latePenalty: { enabled: false, freeLates: 3 } });
  assert.equal(resOff.months['2026-10'].lateMarks, 6);
  assert.equal(resOff.months['2026-10'].lateCut, 0);
});
