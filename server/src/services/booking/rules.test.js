import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../config/timezone.js';
import {
  financialYear, formatReceiptNo, to12h, batchLabel, batchEnded, seatsFor, closedReason,
  batchesFor, normalisePhone, isDateKey, addDays, weekdayOf,
} from './rules.js';

test('financial year runs April to March', () => {
  assert.equal(financialYear(new Date(2026, 9, 9)), '2026-27');   // 9 Oct 2026
  assert.equal(financialYear(new Date(2027, 1, 10)), '2026-27');  // 10 Feb 2027
  assert.equal(financialYear(new Date(2027, 3, 1)), '2027-28');   // 1 Apr 2027
  assert.equal(financialYear(new Date(2099, 5, 1)), '2099-00');
});

test('receipt numbers are padded per year', () => {
  assert.equal(formatReceiptNo('ABH', '2026-27', 7), 'ABH/2026-27/00007');
  assert.equal(formatReceiptNo('', '2026-27', 123456), 'ABH/2026-27/123456');
});

test('batch times read as 12-hour', () => {
  assert.equal(to12h('07:00'), '7:00 AM');
  assert.equal(to12h('12:10'), '12:10 PM');
  assert.equal(to12h('00:05'), '12:05 AM');
  assert.equal(batchLabel('13:45', '15:00'), '1:45 PM – 3:00 PM');
});

test('a batch can be booked until it ends', () => {
  const now = new Date(2026, 9, 13, 9, 30);
  assert.equal(batchEnded('2026-10-13', '09:45', now), false);
  assert.equal(batchEnded('2026-10-13', '09:30', now), true);
  assert.equal(batchEnded('2026-10-12', '23:00', now), true);
  assert.equal(batchEnded('2026-10-14', '07:00', now), false);
});

test('seats count bookings or people', () => {
  assert.equal(seatsFor('bookings', 5), 1);
  assert.equal(seatsFor('people', 5), 5);
  assert.equal(seatsFor('people', 0), 1);
});

test('closed dates, past dates, weekdays and the advance limit', () => {
  const panchamrit = { _id: 'p', name: 'Panchamrit', schedule: 'slot', weekdays: [2] };
  const abhishek = { _id: 'a', name: 'Abhishek', schedule: 'batch' };
  const today = '2026-10-10'; // Saturday
  assert.equal(weekdayOf('2026-10-13'), 2);
  assert.equal(closedReason({ sevaType: abhishek, dateKey: '2026-10-09', today }), 'This date has already passed');
  assert.equal(closedReason({ sevaType: panchamrit, dateKey: '2026-10-13', today }), null);
  assert.match(closedReason({ sevaType: panchamrit, dateKey: '2026-10-14', today }), /not done on this day/);
  assert.match(closedReason({ sevaType: abhishek, dateKey: addDays(today, 91), today, maxAdvanceDays: 90 }), /90 days/);
  const closures = [{ date: '2026-10-20', reason: 'Diwali', sevaTypes: [] }, { date: '2026-10-21', sevaTypes: ['p'] }];
  assert.equal(closedReason({ sevaType: abhishek, dateKey: '2026-10-20', today, closures }), 'Closed: Diwali');
  assert.equal(closedReason({ sevaType: abhishek, dateKey: '2026-10-21', today, closures }), null);
  assert.match(closedReason({ sevaType: panchamrit, dateKey: '2026-10-21', today, closures }) || '', /closed/i);
});

test('batches for a seva and weekday, in time order', () => {
  const batches = [
    { _id: 2, start: '09:00', hall: 'H3', weekdays: [], sevaTypes: [] },
    { _id: 1, start: '09:00', hall: 'H2', weekdays: [], sevaTypes: [] },
    { _id: 3, start: '07:00', hall: 'H1', weekdays: [2], sevaTypes: [] },
    { _id: 4, start: '08:00', hall: 'H1', weekdays: [], sevaTypes: ['other'] },
    { _id: 5, start: '06:00', hall: 'H1', weekdays: [], sevaTypes: [], isActive: false },
  ];
  const seva = { _id: 'a' };
  assert.deepEqual(batchesFor(batches, seva, '2026-10-13').map((b) => b._id), [3, 1, 2]); // Tuesday
  assert.deepEqual(batchesFor(batches, seva, '2026-10-14').map((b) => b._id), [1, 2]);
});

test('phone numbers', () => {
  assert.equal(normalisePhone('+91 98811 80662'), '9881180662');
  assert.equal(normalisePhone('919881180662'), '9881180662');
  assert.equal(normalisePhone('12345'), '');
  assert.equal(normalisePhone('5881180662'), '');
});

test('date keys', () => {
  assert.equal(isDateKey('2026-10-13'), true);
  assert.equal(isDateKey('2026-13-01'), false);
  assert.equal(isDateKey('2026-02-30'), false);
  assert.equal(isDateKey('13-10-2026'), false);
});

test('shift cash: expected, short and excess', async () => {
  const { shiftCash, denominationTotal } = await import('./rules.js');
  assert.deepEqual(shiftCash({ cash: 8100 }, 500, 8600), { expectedCash: 8600, difference: 0 });
  assert.deepEqual(shiftCash({ cash: 8100 }, 0, 7900), { expectedCash: 8100, difference: -200 });
  assert.deepEqual(shiftCash({}, 0, 50), { expectedCash: 0, difference: 50 });
  assert.equal(denominationTotal({ 500: 3, 100: '2', 10: 1, 2000: 4 }), 1710); // 2000 notes aren't counted
  assert.equal(denominationTotal({ 500: -1 }), 0);
});

test('diffFields lists only what changed', async () => {
  const { diffFields } = await import('./rules.js');
  const before = { devotee: { name: 'Prachi', gotra: '', familyNames: ['A'] }, peopleCount: 2 };
  const after = { devotee: { name: 'Prachi Shinde', gotra: '', familyNames: ['A', 'B'] }, peopleCount: 2 };
  assert.deepEqual(diffFields(before, after, ['devotee.name', 'devotee.gotra', 'devotee.familyNames', 'peopleCount']), {
    'devotee.name': ['Prachi', 'Prachi Shinde'],
    'devotee.familyNames': [['A'], ['A', 'B']],
  });
});
