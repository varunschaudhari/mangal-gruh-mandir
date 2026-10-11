import { describe, it, expect } from 'vitest';
import { formatAddress, isPincode } from './address.js';

describe('formatAddress', () => {
  it('joins the parts, writes repeated names once and ends with the PIN', () => {
    expect(formatAddress({ address: '12, Ganesh Peth', area: 'Amalner', city: 'Amalner', district: 'Jalgaon', state: 'Maharashtra', pincode: '425401' }))
      .toBe('12, Ganesh Peth, Amalner, Dist. Jalgaon, Maharashtra – 425401');
    expect(formatAddress({ address: 'Old free text address' })).toBe('Old free text address');
    expect(formatAddress({ pincode: '425401' })).toBe('425401');
    expect(formatAddress()).toBe('');
  });
});

describe('isPincode', () => {
  it('accepts 6 digits not starting with 0', () => {
    expect(isPincode('425401')).toBe(true);
    expect(isPincode('012345')).toBe(false);
    expect(isPincode('4254')).toBe(false);
  });
});
