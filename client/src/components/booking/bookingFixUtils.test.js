import { describe, it, expect } from 'vitest';
import {
  bookingWhere, editFormValues, editPatch, historyEntries, historyValue, paymentLock, validateEdit,
} from './bookingFixUtils.js';

const booking = {
  _id: 'b1',
  channel: 'counter',
  shift: null,
  createdBy: { _id: 'u1', name: 'Ravi' },
  devotee: { name: 'Asha Patil', phone: '9876543210', email: 'asha@example.com', gotra: 'Kashyap', familyNames: ['Ravi'], dob: '1980-05-01' },
  peopleCount: 2,
  notes: '',
  paymentMode: 'upi',
  paymentRef: 'UTR1',
};

describe('paymentLock', () => {
  it('lets whoever took the booking change the payment while the shift is open', () => {
    expect(paymentLock(booking, { userId: 'u1' })).toBeNull();
    expect(paymentLock(booking, { userId: 'u2', canVoid: true })).toBeNull();
  });

  it('explains why the payment cannot be changed', () => {
    expect(paymentLock(booking, { userId: 'u2' })).toBe('Only the person who took this booking can change how it was paid');
    expect(paymentLock({ ...booking, shift: 's1' }, { userId: 'u1' })).toMatch(/closed shift/);
    expect(paymentLock({ ...booking, channel: 'online' }, { userId: 'u1', canVoid: true })).toMatch(/online/);
  });

  it('accepts createdBy as a plain id', () => {
    expect(paymentLock({ ...booking, createdBy: 'u1' }, { userId: 'u1' })).toBeNull();
  });
});

describe('editPatch', () => {
  const initial = editFormValues(booking);

  it('fills every form field from the booking', () => {
    expect(initial.devotee).toMatchObject({ name: 'Asha Patil', phone: '9876543210', rashi: '', familyNames: ['Ravi'] });
    expect(initial).toMatchObject({ peopleCount: 2, paymentMode: 'upi', paymentRef: 'UTR1' });
  });

  it('is empty when nothing really changed (spaces and case only)', () => {
    const form = { ...initial, devotee: { ...initial.devotee, name: ' Asha  Patil ', email: 'ASHA@example.com ' } };
    expect(editPatch(initial, form, { canPay: true })).toEqual({});
  });

  it('sends only the changed fields', () => {
    const form = {
      ...initial,
      devotee: { ...initial.devotee, name: 'Asha Patel', familyNames: ['Ravi', 'Meera'] },
      peopleCount: 3,
      notes: ' Bring flowers ',
    };
    expect(editPatch(initial, form)).toEqual({
      devotee: { name: 'Asha Patel', familyNames: ['Ravi', 'Meera'] },
      peopleCount: 3,
      notes: 'Bring flowers',
    });
  });

  it('includes the payment only when allowed, and clears the reference for cash', () => {
    const form = { ...initial, paymentMode: 'cash' };
    expect(editPatch(initial, form)).toEqual({});
    expect(editPatch(initial, form, { canPay: true })).toEqual({ paymentMode: 'cash', paymentRef: '' });
  });
});

describe('validateEdit', () => {
  const initial = editFormValues(booking);
  const postal = { name: 'Prasad by post', needsPostalAddress: true, maxPeople: 4 };

  it('needs a mobile number and a name', () => {
    const form = { ...initial, devotee: { ...initial.devotee, phone: '12345', name: ' ' } };
    expect(validateEdit(form, { initial })).toEqual({
      phone: 'Enter a valid 10-digit mobile number',
      name: 'Enter the devotee name',
    });
  });

  it('asks for the postal address only when it is being changed', () => {
    expect(validateEdit(initial, { seva: postal, initial })).toEqual({});
    const form = { ...initial, devotee: { ...initial.devotee, address: 'Main Road' } };
    expect(validateEdit(form, { seva: postal, initial }).address).toBe('PIN code is needed for the postal address');
    const ok = { ...initial, devotee: { ...initial.devotee, address: 'Main Road', pincode: '425401' } };
    expect(validateEdit(ok, { seva: postal, initial })).toEqual({});
  });

  it('checks email, PIN and the people limit', () => {
    const form = { ...initial, peopleCount: 5, devotee: { ...initial.devotee, email: 'nope', pincode: '0123' } };
    expect(validateEdit(form, { seva: { name: 'Abhishek', maxPeople: 4 }, initial })).toEqual({
      address: 'Enter a valid 6-digit PIN code',
      email: 'Enter a valid email address',
      people: 'Abhishek allows at most 4 people',
    });
    expect(validateEdit(form, { seva: postal, initial }).address).toBe('Postal address is needed for this seva');
  });
});

describe('bookingWhere', () => {
  it('joins date, batch, hall and serial', () => {
    expect(bookingWhere({ dateKey: '2026-10-13', batchLabel: '7:00 AM – 8:15 AM', hall: 'H1', serialNo: 3 }))
      .toBe('Tue, 13 Oct · 7:00 AM – 8:15 AM · H1 #3');
    expect(bookingWhere({ dateKey: '2026-10-13' })).toBe('Tue, 13 Oct');
    expect(bookingWhere({})).toBe('');
  });
});

describe('history', () => {
  const history = [
    { at: '2026-10-10T05:00:00Z', by: { name: 'Ravi' }, action: 'edit', changes: { notes: ['', 'x'], 'devotee.name': ['A', 'B'] } },
    { at: '2026-10-11T05:00:00Z', by: { name: 'Meera' }, action: 'move', changes: { serialNo: [3, 7], date: ['2026-10-13', '2026-10-14'] }, reason: 'Devotee asked' },
  ];

  it('lists the newest first, fields in a steady order', () => {
    const rows = historyEntries(history);
    expect(rows.map((h) => h.action)).toEqual(['move', 'edit']);
    expect(rows[0].changes.map((c) => c.field)).toEqual(['date', 'serialNo']);
    expect(rows[1].changes).toEqual([{ field: 'devotee.name', before: 'A', after: 'B' }, { field: 'notes', before: '', after: 'x' }]);
    expect(historyEntries(undefined)).toEqual([]);
  });

  it('formats values for reading', () => {
    expect(historyValue('devotee.familyNames', ['Asha', 'Ravi'])).toBe('Asha, Ravi');
    expect(historyValue('date', '2026-10-13')).toBe('13 Oct 2026');
    expect(historyValue('paymentMode', 'upi')).toBe('UPI');
    expect(historyValue('devotee.maritalStatus', 'married')).toBe('Married');
    expect(historyValue('devotee.rashi', 'Mesha', { lang: 'mr' })).toBe('मेष');
    expect(historyValue('serialNo', 0)).toBe('0');
    expect(historyValue('notes', '')).toBe('');
    expect(historyValue('notes', null)).toBe('');
  });
});
