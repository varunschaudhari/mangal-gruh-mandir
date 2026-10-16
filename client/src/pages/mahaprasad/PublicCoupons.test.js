import { describe, expect, it } from 'vitest';
import { couponState } from './PublicCoupons.jsx';

// What the devotee's coupon page shows over each QR — the same expiry rule as the server
describe('coupon page: state of a coupon', () => {
  const now = new Date('2026-10-16T15:00:00');
  const issued = (date) => ({ status: 'issued', date });

  it('served and cancelled coupons say so', () => {
    expect(couponState({ status: 'redeemed', date: '2026-10-16T12:00:00' }, 1, now)).toBe('served');
    expect(couponState({ status: 'voided', date: '2026-10-16T12:00:00' }, 1, now)).toBe('cancelled');
  });

  it('valid for the number of days set, counting the coupon\'s own day', () => {
    expect(couponState(issued('2026-10-16T12:00:00'), 1, now)).toBe('valid');
    expect(couponState(issued('2026-10-15T12:00:00'), 1, now)).toBe('expired');
    expect(couponState(issued('2026-10-15T12:00:00'), 2, now)).toBe('valid');
    expect(couponState(issued('2026-10-14T12:00:00'), 2, now)).toBe('expired');
  });

  it('no expiry when the validity is 0, and a coupon for a later day is valid', () => {
    expect(couponState(issued('2026-09-01T12:00:00'), 0, now)).toBe('valid');
    expect(couponState(issued('2026-10-18T12:00:00'), 1, now)).toBe('valid');
  });
});
