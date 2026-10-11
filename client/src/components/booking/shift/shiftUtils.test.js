import { describe, it, expect } from 'vitest';
import {
  buildCloseBody, cleanDigits, countedFrom, countedNotes, denominationLines, denominationTotal, differenceTone,
  fmtWhen, isVoidedAfterClose, parseRupees, shiftCash, signedRupees,
} from './shiftUtils.js';

describe('denominationTotal', () => {
  it('adds up notes and coins, ignoring blanks, junk and unknown notes', () => {
    expect(denominationTotal({ 500: 3, 100: 2 })).toBe(1700);
    expect(denominationTotal({ '500': '2', '20': '', '10': 'x', '1': '7' })).toBe(1007);
    expect(denominationTotal({ 2000: 1, 50: -3, 5: 2.9 })).toBe(10);
    expect(denominationTotal()).toBe(0);
  });
});

describe('countedNotes', () => {
  it('keeps only the notes counted, keyed as strings', () => {
    expect(countedNotes({ 500: '3', 200: '', 100: 0, 10: '4' })).toEqual({ 500: 3, 10: 4 });
    expect(countedNotes({})).toEqual({});
  });
});

describe('money boxes', () => {
  it('keeps digits only while typing', () => {
    expect(cleanDigits('₹1,25,000')).toBe('125000');
    expect(cleanDigits('12345678')).toBe('1234567');
  });

  it('reads rupees, null when empty', () => {
    expect(parseRupees('4,500')).toBe(4500);
    expect(parseRupees('0')).toBe(0);
    expect(parseRupees('')).toBeNull();
    expect(parseRupees(undefined)).toBeNull();
  });
});

describe('shiftCash and differenceTone', () => {
  it('expects the float plus cash bookings; negative difference = short', () => {
    expect(shiftCash(4000, 500, 4300)).toEqual({ expectedCash: 4500, difference: -200 });
    expect(shiftCash(4000, 0, 4150)).toEqual({ expectedCash: 4000, difference: 150 });
    expect(shiftCash(0, 0, 0)).toEqual({ expectedCash: 0, difference: 0 });
  });

  it('names the tone', () => {
    expect(differenceTone(0)).toBe('match');
    expect(differenceTone(-200)).toBe('short');
    expect(differenceTone(150)).toBe('excess');
    expect(differenceTone(undefined)).toBe('match');
  });

  it('shows the sign with Indian grouping', () => {
    expect(signedRupees(-125000)).toBe('−₹1,25,000');
    expect(signedRupees(150)).toBe('+₹150');
    expect(signedRupees(0)).toBe('₹0');
  });
});

describe('buildCloseBody', () => {
  const base = { openingFloat: '500', notes: '  gave extra change  ' };

  it('sends the note count when notes were counted', () => {
    expect(buildCloseBody({ ...base, mode: 'notes', counts: { 500: '8', 100: '' } }))
      .toEqual({ openingFloat: 500, notes: 'gave extra change', denominations: { 500: 8 } });
  });

  it('sends a zero count when no notes were entered (all UPI shift)', () => {
    expect(buildCloseBody({ mode: 'notes', counts: {}, openingFloat: '' }))
      .toEqual({ openingFloat: 0, notes: '', countedCash: 0 });
  });

  it('sends the typed total, or nothing while the box is empty', () => {
    expect(buildCloseBody({ ...base, mode: 'total', typed: '4,300' }))
      .toEqual({ openingFloat: 500, notes: 'gave extra change', countedCash: 4300 });
    expect(buildCloseBody({ ...base, mode: 'total', typed: '' })).toBeNull();
  });

  it('countedFrom follows the same rules', () => {
    expect(countedFrom('notes', { 200: 2 }, '999')).toBe(400);
    expect(countedFrom('total', { 200: 2 }, '999')).toBe(999);
    expect(countedFrom('total', {}, '')).toBeNull();
  });
});

describe('isVoidedAfterClose', () => {
  const shift = { closedAt: '2026-10-11T12:00:00Z' };
  it('flags only voids done after the close', () => {
    expect(isVoidedAfterClose({ status: 'voided', voidedAt: '2026-10-11T13:00:00Z' }, shift)).toBe(true);
    expect(isVoidedAfterClose({ status: 'voided', voidedAt: '2026-10-11T11:00:00Z' }, shift)).toBe(false);
    expect(isVoidedAfterClose({ status: 'confirmed' }, shift)).toBe(false);
  });
});

describe('denominationLines', () => {
  it('lists counted notes, big notes first', () => {
    expect(denominationLines({ 10: 4, 500: 2, 1: 0 })).toEqual([
      { note: 500, count: 2, total: 1000 },
      { note: 10, count: 4, total: 40 },
    ]);
  });
});

describe('fmtWhen', () => {
  const now = new Date('2026-10-11T15:00:00+05:30');
  it('shows only the time for today, the day as well otherwise', () => {
    expect(fmtWhen('2026-10-11T09:12:00+05:30', now)).toMatch(/^9:12\s?am$/i);
    expect(fmtWhen('2026-10-10T18:05:00+05:30', now)).toMatch(/Sat.*10 Oct.*6:05\s?pm/i);
    expect(fmtWhen(null, now)).toBe('');
  });
});
