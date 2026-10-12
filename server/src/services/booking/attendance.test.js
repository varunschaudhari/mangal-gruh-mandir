import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../config/timezone.js';
import { summariseAttendance } from './attendance.js';

// Sat 10, Sun 11, Mon 12 Oct 2026 (today). Batch b2 has been switched off since the 10th.
const dates = ['2026-10-10', '2026-10-11', '2026-10-12'];
const batches = [
  { _id: 'b1', start: '07:00', end: '08:15', hall: 'H1', capacity: 10 },
  { _id: 'b2', start: '09:00', end: '10:15', hall: 'H2', capacity: 5, isActive: false },
];
const row = (dateKey, batch, bookings, arrived, extra = {}) => ({
  _id: { dateKey, batch, sevaType: 's1', schedule: batch ? 'batch' : 'arrangement' },
  sevaName: batch ? 'Abhishek' : 'Bhomyag', label: batch === 'b2' ? '9:00 AM – 10:15 AM' : batch ? '7:00 AM – 8:15 AM' : '', hall: batch === 'b2' ? 'H2' : batch ? 'H1' : '',
  bookings, seats: bookings, people: bookings, arrived, arrivedPeople: arrived, ...extra,
});
const rows = [
  row('2026-10-10', 'b1', 4, 3),
  row('2026-10-10', 'b2', 2, 0),
  row('2026-10-10', null, 1, 1, { _id: { dateKey: '2026-10-10', batch: null, sevaType: 's2', schedule: 'arrangement' } }),
  row('2026-10-11', 'b1', 6, 0),   // nobody scanned on the 11th
  row('2026-10-12', 'b1', 5, 1),   // today: still going on
];
const r = summariseAttendance({ rows, dates, batches, today: '2026-10-12', from: dates[0], to: dates[2] });

test('fill rate: seats booked against seats on offer, per batch and day', () => {
  assert.deepEqual(r.fill.totals, { capacity: 35, booked: 17, fill: 48.6 });
  const b1 = r.fill.byBatch.find((b) => b.key === 'B:b1');
  const b2 = r.fill.byBatch.find((b) => b.key === 'B:b2');
  assert.deepEqual([b1.days, b1.capacity, b1.booked, b1.fill], [3, 30, 15, 50]);
  assert.deepEqual([b2.days, b2.capacity, b2.booked, b2.fill, b2.hall], [1, 5, 2, 40, 'H2']); // switched off, still counted where booked
  assert.deepEqual(r.fill.daily.map((d) => [d.date, d.capacity, d.booked]), [['2026-10-10', 15, 6], ['2026-10-11', 10, 6], ['2026-10-12', 10, 5]]);
  assert.deepEqual(r.fill.byWeekday.map((d) => d.name), ['Mon', 'Sat', 'Sun']); // Monday first
});

test('no-shows: only past days when scanning was in use', () => {
  assert.equal(r.noShow.scannedDays, 1);
  assert.equal(r.noShow.unscannedDays, 1);
  assert.deepEqual(
    [r.noShow.totals.bookings, r.noShow.totals.arrived, r.noShow.totals.noShow, r.noShow.totals.noShowRate],
    [7, 4, 3, 42.9],
  );
  assert.deepEqual(r.noShow.daily, [
    { date: '2026-10-10', scanned: true, bookings: 7, arrived: 4, noShow: 3 },
    { date: '2026-10-11', scanned: false, bookings: 6, arrived: 0, noShow: null },
  ]);
  const h2 = r.noShow.byBatch.find((b) => b.hall === 'H2');
  assert.deepEqual([h2.bookings, h2.noShow, h2.noShowRate], [2, 2, 100]);
});

test('an empty range has nothing to divide', () => {
  const empty = summariseAttendance({ rows: [], dates: [], batches, today: '2026-10-12' });
  assert.deepEqual(empty.fill.totals, { capacity: 0, booked: 0, fill: null });
  assert.equal(empty.noShow.totals.noShowRate, null);
});
