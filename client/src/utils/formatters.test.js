import { describe, it, expect } from 'vitest';
import { localDateStr } from './formatters.js';

describe('localDateStr', () => {
  it('runs in India time (guards the rest of this file)', () => {
    expect(new Date('2026-01-01T00:00:00Z').getTimezoneOffset()).toBe(-330);
  });

  it('keeps 00:00–05:30 IST on the same calendar day', () => {
    // 01:30 IST on 11 Oct is still 10 Oct in UTC — toISOString() used to give the 10th.
    expect(localDateStr(new Date('2026-10-10T20:00:00Z'))).toBe('2026-10-11');
  });

  it('keeps local midnight on the 1st of the month', () => {
    // "This month" ranges used to start on the last day of the previous month.
    expect(localDateStr(new Date(2026, 9, 1))).toBe('2026-10-01');
    expect(localDateStr(new Date(2027, 0, 1))).toBe('2027-01-01');
  });

  it('reads dates the server stores as UTC midnight as the same day', () => {
    expect(localDateStr('2026-03-31T00:00:00.000Z')).toBe('2026-03-31');
    expect(localDateStr('2026-03-31')).toBe('2026-03-31');
  });

  it('defaults to today', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(localDateStr()).toBe(expected);
  });
});
