import { describe, it, expect } from 'vitest';
import { amountInWords, whatsappShareUrl, fmtPujaDate } from './bookingReceipt.js';

describe('amountInWords', () => {
  it('uses the Indian numbering system', () => {
    expect(amountInWords(810)).toBe('Eight Hundred Ten');
    expect(amountInWords(6300)).toBe('Six Thousand Three Hundred');
    expect(amountInWords(125000)).toBe('One Lakh Twenty Five Thousand');
    expect(amountInWords(10474927)).toBe('One Crore Four Lakh Seventy Four Thousand Nine Hundred Twenty Seven');
    expect(amountInWords(0)).toBe('Zero');
  });
});

describe('whatsappShareUrl', () => {
  const booking = {
    devotee: { name: 'Prachi', phone: '9881180662' }, sevaName: 'Abhishek', dateKey: '2026-10-13',
    batchLabel: '7:00 AM – 8:15 AM', hall: 'H1', receiptNo: 'ABH/2026-27/00001', serialNo: 4,
    receiptUrl: 'https://mandir.aumora.io/r/abc',
  };

  it('opens a chat with the devotee and the receipt link', () => {
    const url = whatsappShareUrl(booking);
    expect(url.startsWith('https://wa.me/919881180662?text=')).toBe(true);
    const text = decodeURIComponent(url.split('text=')[1]);
    expect(text).toContain('Hall H1');
    expect(text).toContain('Serial 4');
    expect(text).toContain('https://mandir.aumora.io/r/abc');
  });

  it('names the hall with its code once the hall has a name', () => {
    const names = { H1: { name: 'Shri Mangal Sabhagruh', nameMr: 'श्री मंगल सभागृह' } };
    const text = decodeURIComponent(whatsappShareUrl(booking, { hallNames: names }).split('text=')[1]);
    expect(text).toContain('7:00 AM – 8:15 AM, Shri Mangal Sabhagruh (H1).');
    expect(text).not.toContain('Hall H1');
    // The public receipt carries the name on the booking itself
    const own = decodeURIComponent(whatsappShareUrl({ ...booking, hallName: 'Annex' }).split('text=')[1]);
    expect(own).toContain('Annex (H1)');
  });

  it('says "on your behalf" when there is no date', () => {
    const text = decodeURIComponent(whatsappShareUrl({ ...booking, dateKey: undefined }).split('text=')[1]);
    expect(text).toContain('on your behalf');
  });
});

describe('fmtPujaDate', () => {
  it('formats the puja day without a time-zone shift', () => {
    expect(fmtPujaDate({ dateKey: '2026-10-13' })).toMatch(/Tue, 13 Oct,? 2026/);
    expect(fmtPujaDate({})).toBe('');
  });
});
