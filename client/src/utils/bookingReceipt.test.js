import { describe, it, expect } from 'vitest';
import { amountInWords, bookingReceiptHtml, whatsappShareUrl, fmtPujaDate } from './bookingReceipt.js';

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

describe('a Hindi booking', () => {
  const hiBooking = {
    devotee: { name: 'Ramesh Sharma', phone: '9881180662', language: 'hi', gotra: 'Kashyap' }, sevaName: 'Abhishek', sevaNameMr: 'अभिषेक',
    dateKey: '2026-10-13', batchLabel: '7:00 AM – 8:15 AM', hall: 'H1', receiptNo: 'ABH/2026-27/00001', serialNo: 4,
    amount: 2100, paymentMode: 'cash', paidAt: '2026-10-12T09:15:00+05:30', receiptUrl: 'https://mandir.aumora.io/r/abc',
  };
  const names = { H1: { name: 'Shri Mangal Sabhagruh', nameMr: 'श्री मंगल सभागृह' } };

  it('gets the WhatsApp text in Hindi, with Devanagari names', () => {
    const text = decodeURIComponent(whatsappShareUrl(hiBooking, { hallNames: names }).split('text=')[1]);
    expect(text).toContain('नमस्ते Ramesh Sharma, श्री मंगळग्रह मंदिर, अमळनेर में आपकी अभिषेक सेवा बुक हो गई है');
    expect(text).toContain('श्री मंगल सभागृह');
    expect(text).toContain('रसीद ABH/2026-27/00001 · क्रमांक 4');
  });

  it('gets the receipt in Hindi, the amount in Hindi words', async () => {
    const html = await bookingReceiptHtml({ ...hiBooking, receiptUrl: '' }, { hallNames: names }, { autoPrint: false });
    for (const label of ['अभिषेक / पूजा रसीद', 'रसीद क्र.', 'पूजा तिथि', 'गोत्र', 'नकद', 'प्राप्त राशि', 'रुपये दो हज़ार एक सौ मात्र']) expect(html).toContain(label);
    expect(html).toContain('<html lang="hi">');
    expect(html).not.toContain('Amount received');
  });

  it('a Marathi or English booking keeps the receipt as before', async () => {
    const html = await bookingReceiptHtml({ ...hiBooking, receiptUrl: '', devotee: { ...hiBooking.devotee, language: 'mr' } }, {}, { autoPrint: false });
    expect(html).toContain('Amount received');
    expect(html).toContain('Rupees Two Thousand One Hundred only');
    expect(html).not.toContain('रसीद');
    // …unless the devotee switched the receipt page to Hindi
    const page = await bookingReceiptHtml({ ...hiBooking, receiptUrl: '', devotee: { ...hiBooking.devotee, language: 'mr' } }, {}, { autoPrint: false, lang: 'hi' });
    expect(page).toContain('प्राप्त राशि');
  });
});
