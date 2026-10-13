import { describe, it, expect } from 'vitest';
import {
  EMPTY_DEVOTEE, addFamilyNames, buildBookingBody, cleanPhoneInput, clearPrefilled, compactBatchLabel, dateChoices,
  devoteeFormValues, fillEmpty, isValidPhone, nextAllowedDay, newRequestId, serverText, validateBooking,
} from './counterUtils.js';
import booking from '../../../i18n/mr/booking.js';
import common from '../../../i18n/mr/common.js';
import mahaprasad from '../../../i18n/mr/mahaprasad.js';
import stock from '../../../i18n/mr/stock.js';
import dashboard from '../../../i18n/mr/dashboard.js';
import attendance from '../../../i18n/mr/attendance.js';
import salary from '../../../i18n/mr/salary.js';
import bookingRegister from '../../../i18n/mr/bookingRegister.js';
import bookingSetup from '../../../i18n/mr/bookingSetup.js';

describe('dateChoices', () => {
  it('offers today, tomorrow and the next Tuesday', () => {
    expect(dateChoices({ today: '2026-10-10', maxAdvanceDays: 90 })).toEqual([
      { key: '2026-10-10', kind: 'today' }, { key: '2026-10-11', kind: 'tomorrow' }, { key: '2026-10-13', kind: 'date' },
    ]);
    // Monday: tomorrow is Tuesday, so the third chip is the Tuesday after
    expect(dateChoices({ today: '2026-10-12', maxAdvanceDays: 90 }).map((c) => c.key)).toEqual(['2026-10-12', '2026-10-13', '2026-10-20']);
  });

  it('lists the next allowed days for a weekday-only seva', () => {
    expect(dateChoices({ today: '2026-10-10', weekdays: [2], maxAdvanceDays: 90 }).map((c) => c.key)).toEqual(['2026-10-13', '2026-10-20', '2026-10-27']);
    expect(dateChoices({ today: '2026-10-13', weekdays: [2], maxAdvanceDays: 90 })[0]).toEqual({ key: '2026-10-13', kind: 'today' });
  });

  it('stays inside the booking window', () => {
    expect(dateChoices({ today: '2026-10-10', maxAdvanceDays: 1 }).map((c) => c.key)).toEqual(['2026-10-10', '2026-10-11']);
    expect(nextAllowedDay('2026-10-10', [2], '2026-10-12')).toBeNull();
  });
});

describe('phone', () => {
  it('keeps 10 digits from typing and pasting', () => {
    expect(cleanPhoneInput('+91 98811 80662')).toBe('9881180662');
    expect(cleanPhoneInput('09881180662')).toBe('9881180662');
    expect(cleanPhoneInput('98811806621')).toBe('9881180662'); // an 11th digit is ignored
    expect(cleanPhoneInput('91234 56789')).toBe('9123456789');
  });
  it('accepts Indian mobile numbers only', () => {
    expect(isValidPhone('9881180662')).toBe(true);
    expect(isValidPhone('1234567890')).toBe(false);
    expect(isValidPhone('98811')).toBe(false);
  });
});

it('compacts batch times', () => {
  expect(compactBatchLabel('07:00', '08:15')).toBe('7:00 – 8:15 AM');
  expect(compactBatchLabel('11:30', '12:45')).toBe('11:30 AM – 12:45 PM');
  expect(compactBatchLabel('', '', '7 AM')).toBe('7 AM');
});

describe('returning devotee pre-fill', () => {
  const found = devoteeFormValues({ name: 'Prachi', gotra: 'Kashyap', familyNames: ['Asha'], extra: 'x' });

  it('fills only empty fields', () => {
    const out = fillEmpty({ ...EMPTY_DEVOTEE, name: 'Typed' }, found);
    expect(out.name).toBe('Typed');
    expect(out.gotra).toBe('Kashyap');
    expect(out.familyNames).toEqual(['Asha']);
    expect(out).not.toHaveProperty('extra');
  });

  it('clears pre-filled values the staff did not change when the number changes', () => {
    const edited = { ...fillEmpty(EMPTY_DEVOTEE, found), gotra: 'Bharadwaj' };
    const out = clearPrefilled(edited, found);
    expect(out.name).toBe('');
    expect(out.familyNames).toEqual([]);
    expect(out.gotra).toBe('Bharadwaj');
  });
});

it('adds family names without blanks or repeats', () => {
  expect(addFamilyNames(['Asha'], ' Ravi ,asha,, Meera  Patil')).toEqual(['Asha', 'Ravi', 'Meera Patil']);
});

describe('validateBooking', () => {
  const abhishek = { _id: 's1', name: 'Abhishek', schedule: 'batch', price: 810 };
  const post = { _id: 's2', name: 'Post Abhishek', schedule: 'none', needsPostalAddress: true, price: 810 };
  const avail = { open: true, batches: [{ _id: 'b1', left: 3, ended: false }, { _id: 'b2', left: 0, ended: false }] };
  const base = { seva: abhishek, phone: '9881180662', devotee: { ...EMPTY_DEVOTEE, name: 'Prachi' }, date: '2026-10-13', batchId: 'b1', availability: avail, peopleCount: 1 };

  it('passes a complete booking', () => {
    expect(validateBooking(base)).toEqual({});
  });
  it('needs a mobile number, a name and an open batch', () => {
    expect(validateBooking({ ...base, phone: '12345' }).phone).toBeTruthy();
    expect(validateBooking({ ...base, devotee: EMPTY_DEVOTEE }).name).toBeTruthy();
    expect(validateBooking({ ...base, batchId: null }).when).toBe('Choose a batch');
    expect(validateBooking({ ...base, batchId: 'b2' }).when).toBe('This batch is full — please choose another');
    expect(validateBooking({ ...base, availability: { open: false, reason: 'Closed: Diwali' } }).when).toBe('Closed: Diwali');
  });
  it('counts people as seats when capacity is in people', () => {
    expect(validateBooking({ ...base, peopleCount: 4, capacityUnit: 'people' }).when).toBe('Not enough seats left in this batch');
    expect(validateBooking({ ...base, peopleCount: 4, capacityUnit: 'bookings' })).toEqual({});
  });
  it('needs a postal address, but no date, for a seva done by post', () => {
    const e = validateBooking({ ...base, seva: post, date: '', batchId: null, availability: undefined });
    expect(e).toEqual({ address: 'Postal address is needed for this seva' });
  });
});

describe('buildBookingBody', () => {
  const devotee = { ...EMPTY_DEVOTEE, name: '  Prachi   Patil ', familyNames: ['Asha', ' '] };
  it('sends date and batch only when the seva uses them', () => {
    const batch = buildBookingBody({ seva: { _id: 's1', schedule: 'batch' }, phone: '9881180662', devotee, date: '2026-10-13', batchId: 'b1', peopleCount: 2, paymentMode: 'cash', paymentRef: 'x', notes: '' });
    expect(batch).toMatchObject({ sevaType: 's1', date: '2026-10-13', batch: 'b1', peopleCount: 2, paymentRef: '' });
    expect(batch.devotee).toMatchObject({ name: 'Prachi Patil', phone: '9881180662', familyNames: ['Asha'] });
    const byPost = buildBookingBody({ seva: { _id: 's2', schedule: 'none' }, phone: '9881180662', devotee, date: '2026-10-13', batchId: 'b1', peopleCount: 1, paymentMode: 'upi', paymentRef: ' 12345 ', notes: '' });
    expect(byPost).not.toHaveProperty('date');
    expect(byPost).not.toHaveProperty('batch');
    expect(byPost.paymentRef).toBe('12345');
  });
});

it('makes a uuid-shaped request id', () => {
  expect(newRequestId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(newRequestId()).not.toBe(newRequestId());
});

it('translates server messages, with Marathi seva names', () => {
  const t = (s, v) => (v ? `${s}|${JSON.stringify(v)}` : `T:${s}`);
  const sevaTypes = [{ name: 'Panchamrit Abhishek', nameMr: 'पंचामृत अभिषेक' }];
  expect(serverText(t, 'Panchamrit Abhishek is not done on this day', { sevaTypes, lang: 'mr' }))
    .toBe('{seva} is not done on this day|{"seva":"पंचामृत अभिषेक"}');
  expect(serverText(t, 'Bookings open only 90 days ahead')).toBe('Bookings open only {n} days ahead|{"n":"90"}');
  expect(serverText(t, 'Choose a batch')).toBe('T:Choose a batch');
  expect(serverText(t, '')).toBe('');
});

describe('Marathi booking dictionary', () => {
  it('keeps the same {placeholders} as the English text', () => {
    const names = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
    for (const [en, mr] of Object.entries(booking)) expect(names(mr), en).toBe(names(en));
  });

  it('does not repeat a key from another dictionary', () => {
    const others = { common, mahaprasad, stock, dashboard, attendance, salary, bookingRegister, bookingSetup };
    const dupes = Object.keys(booking).flatMap((k) => Object.entries(others).filter(([, d]) => k in d).map(([n]) => `${k} (${n})`));
    expect(dupes).toEqual([]);
  });
});

describe('WhatsApp message language', () => {
  const seva = { _id: 's1', schedule: 'none' };
  it('goes with the booking, empty when not chosen', () => {
    const body = (language) => buildBookingBody({ seva, phone: '9876543210', devotee: { ...EMPTY_DEVOTEE, name: 'Asha', language }, paymentMode: 'cash' });
    expect(body('en').devotee.language).toBe('en');
    expect(body('').devotee.language).toBe('');
  });
  it('comes back for a returning devotee, without overriding a choice already made', () => {
    const found = devoteeFormValues({ name: 'Asha', language: 'en' });
    expect(found.language).toBe('en');
    expect(fillEmpty({ ...EMPTY_DEVOTEE }, found).language).toBe('en');
    expect(fillEmpty({ ...EMPTY_DEVOTEE, language: 'mr' }, found).language).toBe('mr');
    expect(clearPrefilled(fillEmpty({ ...EMPTY_DEVOTEE }, found), found).language).toBe('');
  });
});
