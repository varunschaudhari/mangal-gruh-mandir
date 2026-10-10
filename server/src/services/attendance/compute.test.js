import '../../config/timezone.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRange, summarise, addDays, datesBetween } from './compute.js';

const DAY = { _id: 'day', name: 'Day', start: '08:00', end: '17:00', kind: 'day' };
const NIGHT = { _id: 'night', name: 'Night', start: '20:00', end: '05:00', kind: 'night' };
const shiftsById = new Map([['day', DAY], ['night', NIGHT]]);
const settings = { graceMinutes: 15, halfDayBelowHours: 7, absentBelowHours: 4, punchMergeMinutes: 2 };
const LATER = new Date(2026, 11, 31); // "now" well after the test dates

const at = (date, hhmm) => {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi);
};

// plans: { 'YYYY-MM-DD': ['day'] | ['day','night'] | 'off' }; other dates in range are unplanned.
const run = (from, to, plans, punches, { overrides = {}, now = LATER } = {}) => computeRange({
  from, to, shiftsById, settings, now,
  plans: datesBetween(addDays(from, -1), addDays(to, 1)).map((date) => (
    plans[date] === 'off' ? { date, shifts: [], off: true } : { date, shifts: plans[date] || [], off: false })),
  times: punches,
  overrides: new Map(Object.entries(overrides)),
});

test('day shift worked in full is present, with extra time counted', () => {
  const { days } = run('2026-10-05', '2026-10-05', { '2026-10-05': ['day'] }, [at('2026-10-05', '07:55'), at('2026-10-05', '17:05')]);
  const d = days['2026-10-05'];
  assert.equal(d.status, 'present');
  assert.equal(d.workedMinutes, 550);
  assert.equal(d.extraMinutes, 10);
  assert.equal(d.lateMinutes, 0);
});

test('late only after the grace period', () => {
  const ok = run('2026-10-05', '2026-10-05', { '2026-10-05': ['day'] }, [at('2026-10-05', '08:10'), at('2026-10-05', '17:00')]);
  assert.equal(ok.days['2026-10-05'].lateMinutes, 0);
  const late = run('2026-10-05', '2026-10-05', { '2026-10-05': ['day'] }, [at('2026-10-05', '08:20'), at('2026-10-05', '17:00')]);
  assert.equal(late.days['2026-10-05'].lateMinutes, 20);
});

test('short days become half day or absent', () => {
  const half = run('2026-10-05', '2026-10-05', { '2026-10-05': ['day'] }, [at('2026-10-05', '08:00'), at('2026-10-05', '14:00')]);
  assert.equal(half.days['2026-10-05'].status, 'half_day');
  const absent = run('2026-10-05', '2026-10-05', { '2026-10-05': ['day'] }, [at('2026-10-05', '08:00'), at('2026-10-05', '11:00')]);
  assert.equal(absent.days['2026-10-05'].status, 'absent');
  assert.ok(absent.days['2026-10-05'].issues.includes('short_hours'));
});

test('a night shift that ends after midnight counts on the date it started', () => {
  const { days, unmatched } = run('2026-10-05', '2026-10-06', { '2026-10-05': ['night'] }, [at('2026-10-05', '19:58'), at('2026-10-06', '05:03')]);
  assert.equal(days['2026-10-05'].status, 'present');
  assert.equal(days['2026-10-05'].workedMinutes, 545);
  assert.equal(days['2026-10-06'].status, 'none');
  assert.equal(unmatched.length, 0);
});

test('night shift then the next morning day shift: each punch goes to the right day', () => {
  const { days } = run('2026-10-05', '2026-10-06', { '2026-10-05': ['night'], '2026-10-06': ['day'] }, [
    at('2026-10-05', '20:00'), at('2026-10-06', '05:00'), at('2026-10-06', '08:00'), at('2026-10-06', '17:00'),
  ]);
  assert.equal(days['2026-10-05'].status, 'present');
  assert.equal(days['2026-10-06'].status, 'present');
  assert.equal(days['2026-10-06'].firstIn.getHours(), 8);
});

test('day + night on the same date is a double shift', () => {
  const { days } = run('2026-10-05', '2026-10-05', { '2026-10-05': ['day', 'night'] }, [
    at('2026-10-05', '07:58'), at('2026-10-05', '17:02'), at('2026-10-05', '19:57'), at('2026-10-06', '05:01'),
  ]);
  const d = days['2026-10-05'];
  assert.equal(d.status, 'present');
  assert.equal(d.double, true);
  assert.equal(d.workedMinutes, 1088);
});

test('a planned double where only the day shift was worked is a normal present day', () => {
  const { days } = run('2026-10-05', '2026-10-05', { '2026-10-05': ['day', 'night'] }, [at('2026-10-05', '08:00'), at('2026-10-05', '17:00')]);
  assert.equal(days['2026-10-05'].status, 'present');
  assert.equal(days['2026-10-05'].double, false);
  assert.ok(days['2026-10-05'].issues.includes('double_incomplete'));
});

test('a single punch is a missed punch once the shift is over, "working" during it', () => {
  const past = run('2026-10-05', '2026-10-05', { '2026-10-05': ['day'] }, [at('2026-10-05', '08:00')]);
  assert.equal(past.days['2026-10-05'].status, 'missing_punch');
  const during = run('2026-10-05', '2026-10-05', { '2026-10-05': ['day'] }, [at('2026-10-05', '08:00')], { now: at('2026-10-05', '12:00') });
  assert.equal(during.days['2026-10-05'].status, 'working');
});

test('no punches: upcoming, not in yet, then absent', () => {
  const plans = { '2026-10-05': ['day'] };
  assert.equal(run('2026-10-05', '2026-10-05', plans, [], { now: at('2026-10-05', '06:00') }).days['2026-10-05'].status, 'upcoming');
  assert.equal(run('2026-10-05', '2026-10-05', plans, [], { now: at('2026-10-05', '09:00') }).days['2026-10-05'].status, 'not_in');
  assert.equal(run('2026-10-05', '2026-10-05', plans, []).days['2026-10-05'].status, 'absent');
});

test('weekly off, and working on a weekly off', () => {
  assert.equal(run('2026-10-05', '2026-10-05', { '2026-10-05': 'off' }, []).days['2026-10-05'].status, 'off');
  const worked = run('2026-10-05', '2026-10-05', { '2026-10-05': 'off' }, [at('2026-10-05', '09:00'), at('2026-10-05', '18:00')]);
  assert.equal(worked.days['2026-10-05'].status, 'worked_off');
});

test('supervisor override and late waiver', () => {
  const override = { '2026-10-05': { status: 'on_duty', note: 'Sent to bank', waiveLate: false } };
  const od = run('2026-10-05', '2026-10-05', { '2026-10-05': ['day'] }, [], { overrides: override });
  assert.equal(od.days['2026-10-05'].status, 'on_duty');
  assert.equal(od.days['2026-10-05'].computedStatus, 'absent');

  const waived = run('2026-10-05', '2026-10-05', { '2026-10-05': ['day'] }, [at('2026-10-05', '09:00'), at('2026-10-05', '17:30')],
    { overrides: { '2026-10-05': { waiveLate: true, note: 'Bus late' } } });
  assert.equal(waived.days['2026-10-05'].lateMinutes, 0);
  assert.equal(waived.days['2026-10-05'].lateWaived, true);
});

test('repeated taps on the machine count once', () => {
  const { days } = run('2026-10-05', '2026-10-05', { '2026-10-05': ['day'] }, [
    at('2026-10-05', '08:00'), at('2026-10-05', '08:01'), at('2026-10-05', '17:00'),
  ]);
  assert.equal(days['2026-10-05'].status, 'present');
  assert.equal(days['2026-10-05'].punches.length, 2);
});

test('a holiday is a paid day off; days before joining are not counted', () => {
  const plans = [
    { date: '2026-10-04', shifts: [], off: false, employed: false },
    { date: '2026-10-05', shifts: [], off: true, holiday: 'Dasara' },
    { date: '2026-10-06', shifts: ['day'], off: false },
    { date: '2026-10-07', shifts: [], off: false },
  ];
  const { days } = computeRange({ from: '2026-10-05', to: '2026-10-06', plans, times: [at('2026-10-04', '08:00')], shiftsById, settings, now: LATER });
  assert.equal(days['2026-10-05'].status, 'holiday');
  assert.equal(days['2026-10-05'].holiday, 'Dasara');
  assert.equal(days['2026-10-06'].status, 'absent');

  const before = computeRange({ from: '2026-10-04', to: '2026-10-04', plans, times: [], shiftsById, settings, now: LATER });
  assert.equal(before.days['2026-10-04'].status, 'not_employed');
});

test('planned leave replaces the day, and a late mark on a leave day does not count', () => {
  const overrides = { '2026-10-05': { status: 'leave', leaveType: 'extra', note: 'Family function' } };
  const { days } = run('2026-10-05', '2026-10-05', { '2026-10-05': ['day'] }, [at('2026-10-05', '09:30'), at('2026-10-05', '12:00')], { overrides });
  assert.equal(days['2026-10-05'].status, 'leave');
  assert.equal(days['2026-10-05'].leaveType, 'extra');
  assert.equal(days['2026-10-05'].lateMinutes, 0);
});

test('summary totals for the register', () => {
  const { days } = run('2026-10-05', '2026-10-07', { '2026-10-05': ['day'], '2026-10-06': ['day'], '2026-10-07': 'off' }, [
    at('2026-10-05', '08:30'), at('2026-10-05', '17:00'),
    at('2026-10-06', '08:00'), at('2026-10-06', '13:00'),
  ]);
  const t = summarise(days);
  assert.equal(t.present, 1);
  assert.equal(t.halfDays, 1);
  assert.equal(t.off, 1);
  assert.equal(t.late, 1);
  assert.equal(t.presentValue, 1.5);
});
