import { describe, it, expect } from 'vitest';
import { couponListText, couponWhatsAppUrl } from './mahaprasadShare.js';
import { cleanPhoneInput, isValidPhone } from './phone.js';

describe('coupon numbers on WhatsApp', () => {
  it('shortens a run of numbers', () => {
    expect(couponListText(['MP-20261013-007'])).toBe('MP-20261013-007');
    expect(couponListText(['MP-20261013-007', 'MP-20261013-008', 'MP-20261013-009'])).toBe('MP-20261013-007 to 009 (3)');
    expect(couponListText(['MP-20261013-007', 'MP-20261013-011'])).toBe('MP-20261013-007, MP-20261013-011');
  });

  it('opens a chat with the devotee and the message ready', () => {
    const url = couponWhatsAppUrl({ mobile: '9881180662', numbers: ['MP-20261013-012'], date: '2026-10-13T12:00:00', persons: 4 });
    expect(url.startsWith('https://wa.me/919881180662?text=')).toBe(true);
    const text = decodeURIComponent(url.split('text=')[1]);
    expect(text).toContain('Shri Mangal Mahaprasad coupon at Shri Mangal Grah Mandir');
    expect(text).toContain('MP-20261013-012 · *4 persons*');
    expect(text).not.toContain('QR');
  });

  it('carries the link to the coupon QR page when there is one', () => {
    const url = couponWhatsAppUrl({ mobile: '9881180662', numbers: ['MP-20261013-012'], date: '2026-10-13T12:00:00', link: 'https://mandir.aumora.io/m/AbCdEf123456' });
    const text = decodeURIComponent(url.split('text=')[1]);
    expect(text).toContain('MP-20261013-012 · *1 person*');   // singles show the count too
    expect(text).toContain('Your coupon QR: https://mandir.aumora.io/m/AbCdEf123456');
    expect(text).toContain('Please show it at the Shri Mangal Mahaprasad hall.');
  });

  it('greets a Free Seva devotee by name', () => {
    const text = decodeURIComponent(couponWhatsAppUrl({ mobile: '9881180662', name: '  Ramesh Patil ', numbers: ['MP-20261013-012'], date: '2026-10-13T12:00:00' }).split('text=')[1]);
    expect(text.startsWith('Namaste Ramesh Patil! Your Shri Mangal Mahaprasad coupon')).toBe(true);
    const noName = decodeURIComponent(couponWhatsAppUrl({ mobile: '9881180662', numbers: ['MP-20261013-012'], date: '2026-10-13T12:00:00' }).split('text=')[1]);
    expect(noName.startsWith('Namaste! Your Shri Mangal Mahaprasad coupon')).toBe(true);
  });
});

describe('mobile numbers', () => {
  it('cleans what was typed or pasted', () => {
    expect(cleanPhoneInput('+91 98811 80662')).toBe('9881180662');
    expect(cleanPhoneInput('09881180662')).toBe('9881180662');
    expect(isValidPhone('9881180662')).toBe(true);
    expect(isValidPhone('5881180662')).toBe(false);
  });
});
