import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import '../config/timezone.js';
import axios from 'axios';
import Settings from '../models/Settings.js';
import { inLanguage, sendTemplate } from './whatsappClient.service.js';
import { sendDonationThankYou } from './donationWhatsapp.service.js';
import { couponListText, sendCouponMessage } from './mahaprasadNotify.service.js';
import { logger } from '../utils/logger.js';

mock.method(logger, 'info', () => {});
mock.method(logger, 'error', () => {});

const ready = { enabled: true, phoneNumberId: '111', accessToken: 'EAAtok', templates: {}, languages: {} };
const part = (call, type) => call.arguments[1].template.components.find((c) => c.type === type);
const texts = (call) => part(call, 'body').parameters.map((p) => p.text);
const picture = (call) => part(call, 'header')?.parameters[0].image.link;
const settingsWith = (extra = {}) => mock.method(Settings, 'getOrCreate',
  async () => new Settings({ waEnabled: true, waPhoneNumberId: '111', waAccessToken: 'EAAtok', ...extra }));

test('the chosen language first, the other as fallback (Marathi unless set to English)', () => {
  const msg = { en: ['Ramesh'], mr: ['रमेश'], hi: ['रमेश जी'] };
  assert.deepEqual(inLanguage(ready, 'donationThanks', msg), { language: 'mr', body: ['रमेश'], fallback: { language: 'en', body: ['Ramesh'] } });
  assert.deepEqual(inLanguage({ languages: { donationThanks: 'en' } }, 'donationThanks', msg),
    { language: 'en', body: ['Ramesh'], fallback: { language: 'mr', body: ['रमेश'] } });
  // Hindi first; a Hindi reader gets English (not Marathi) when Hindi isn't approved yet
  assert.deepEqual(inLanguage({ languages: { donationThanks: 'hi' } }, 'donationThanks', msg),
    { language: 'hi', body: ['रमेश जी'], fallback: { language: 'en', body: ['Ramesh'] } });
});

test('no approved version in that language (132001) → the other language is sent', async (t) => {
  let n = 0;
  const post = mock.method(axios, 'post', async () => {
    n += 1;
    if (n === 1) throw Object.assign(new Error('x'), { response: { data: { error: { code: 132001, message: 'Template name does not exist in the translation' } } } });
    return { data: {} };
  });
  t.after(() => post.mock.restore());
  const out = await sendTemplate(ready, { to: '9876543210', template: 'donation_thankyou', language: 'mr', body: ['रमेश'], fallback: { language: 'en', body: ['Ramesh'] } });
  assert.equal(out, 'sent');
  assert.equal(post.mock.calls[1].arguments[1].template.language.code, 'en');
  assert.deepEqual(texts(post.mock.calls[1]), ['Ramesh']);
});

test('other errors are not retried in the other language', async (t) => {
  const post = mock.method(axios, 'post', async () => { throw Object.assign(new Error('x'), { response: { data: { error: { code: 190 } } } }); });
  t.after(() => post.mock.restore());
  assert.equal(await sendTemplate(ready, { to: '9876543210', template: 'x', language: 'mr', fallback: { language: 'en' } }), 'failed');
  assert.equal(post.mock.callCount(), 1);
});

test('donation thank-you in Marathi', async (t) => {
  const s = settingsWith();
  const post = mock.method(axios, 'post', async () => ({ data: {} }));
  t.after(() => { post.mock.restore(); s.mock.restore(); });
  const donation = { donor: { name: 'Ramesh Patil', phone: '9876543210' }, totalEstimatedValue: 5001, date: new Date('2026-10-16T10:00:00+05:30'), donationNumber: 'DON-20261016-0001' };
  assert.equal(await sendDonationThankYou(donation), 'sent');
  const [, payload] = post.mock.calls[0].arguments;
  assert.equal(payload.template.name, 'donation_thankyou');
  assert.equal(payload.template.language.code, 'mr');
  assert.deepEqual(texts(post.mock.calls[0]), ['Ramesh Patil', '5,001', 'सर्वसाधारण देणगी', '१६ ऑक्टोबर, २०२६', 'DON-20261016-0001']);
});

test('donation thank-you in Hindi when chosen', async (t) => {
  const s = settingsWith({ waLanguages: { donationThanks: 'hi' } });
  const post = mock.method(axios, 'post', async () => ({ data: {} }));
  t.after(() => { post.mock.restore(); s.mock.restore(); });
  await sendDonationThankYou({ donorPhone: '9876543210', totalEstimatedValue: 1100, date: new Date('2026-10-16T10:00:00+05:30'), donationNumber: 'DON-1' });
  assert.equal(post.mock.calls[0].arguments[1].template.language.code, 'hi');
  const [donor, amount, occasion, date, receipt] = texts(post.mock.calls[0]);
  assert.deepEqual([donor, amount, occasion, receipt], ['भक्त', '1,100', 'सामान्य दान', 'DON-1']);
  assert.match(date, /^16 अक्(?:त|ट)ूबर 2026$/);   // ICU spells October either way
});

test('donation thank-you in English when chosen', async (t) => {
  const s = settingsWith({ waLanguages: { donationThanks: 'en' } });
  const post = mock.method(axios, 'post', async () => ({ data: {} }));
  t.after(() => { post.mock.restore(); s.mock.restore(); });
  await sendDonationThankYou({ donorPhone: '9876543210', totalEstimatedValue: 501, occasion: { name: 'Diwali' }, date: new Date('2026-10-16T10:00:00+05:30') });
  assert.equal(post.mock.calls[0].arguments[1].template.language.code, 'en');
  assert.deepEqual(texts(post.mock.calls[0]), ['Devotee', '501', 'Diwali', '16 Oct 2026', '-']);
});

test('Mahaprasad coupons in Marathi, with the QR picture on top and the QR link', async (t) => {
  const s = settingsWith({ waTemplates: { mahaprasadCoupons: 'mahaprasad_coupon_qr' } });
  const post = mock.method(axios, 'post', async () => ({ data: {} }));
  t.after(() => { post.mock.restore(); s.mock.restore(); });
  const out = await sendCouponMessage({
    mobile: '9876543210', numbers: ['MP-20261013-007', 'MP-20261013-008', 'MP-20261013-009'],
    date: new Date('2026-10-13T10:00:00+05:30'), persons: 3, link: 'https://mandir.aumora.io/m/AbCd',
    image: 'https://mandir.aumora.io/api/public/mahaprasad/AbCd/qr.png',
  });
  assert.equal(out.whatsapp, 'sent');
  assert.equal(post.mock.calls[0].arguments[1].template.language.code, 'mr');
  assert.equal(picture(post.mock.calls[0]), 'https://mandir.aumora.io/api/public/mahaprasad/AbCd/qr.png');
  assert.equal(post.mock.calls[0].arguments[1].template.components[0].type, 'header');   // Meta wants the header first
  assert.deepEqual(texts(post.mock.calls[0]), ['मंगळवार, १३ ऑक्टोबर, २०२६', 'MP-20261013-007 ते 009 (3)', '3 व्यक्ती', 'https://mandir.aumora.io/m/AbCd']);
});

test('Mahaprasad coupons in Hindi when chosen; English if Hindi isn\'t approved yet', async (t) => {
  const s = settingsWith({ waTemplates: { mahaprasadCoupons: 'mahaprasad_coupon_qr' }, waLanguages: { mahaprasadCoupons: 'hi' } });
  let n = 0;
  const post = mock.method(axios, 'post', async () => {
    n += 1;
    if (n === 2) throw Object.assign(new Error('x'), { response: { data: { error: { code: 132001 } } } });
    return { data: {} };
  });
  t.after(() => { post.mock.restore(); s.mock.restore(); });
  const sale = {
    mobile: '9876543210', numbers: ['MP-20261013-007', 'MP-20261013-008'],
    date: new Date('2026-10-13T10:00:00+05:30'), persons: 2, link: 'https://mandir.aumora.io/m/AbCd',
  };
  await sendCouponMessage(sale);
  assert.equal(post.mock.calls[0].arguments[1].template.language.code, 'hi');
  const [when, ...rest] = texts(post.mock.calls[0]);
  assert.match(when, /^मंगलवार, 13 अक्(?:त|ट)ूबर 2026$/);
  assert.deepEqual(rest, ['MP-20261013-007 से 008 (2)', '2 व्यक्ति', 'https://mandir.aumora.io/m/AbCd']);
  await sendCouponMessage(sale);   // Hindi refused (132001) → English
  assert.deepEqual(post.mock.calls.slice(1).map((c) => c.arguments[1].template.language.code), ['hi', 'en']);
});

test('the English fallback keeps the picture', async (t) => {
  let n = 0;
  const post = mock.method(axios, 'post', async () => {
    n += 1;
    if (n === 1) throw Object.assign(new Error('x'), { response: { data: { error: { code: 132001 } } } });
    return { data: {} };
  });
  t.after(() => post.mock.restore());
  await sendTemplate(ready, { to: '9876543210', template: 'mahaprasad_coupon_qr', language: 'mr', body: ['x'], image: 'https://x/qr.png', fallback: { language: 'en', body: ['y'] } });
  assert.equal(post.mock.calls[1].arguments[1].template.language.code, 'en');
  assert.equal(picture(post.mock.calls[1]), 'https://x/qr.png');
  assert.deepEqual(texts(post.mock.calls[1]), ['y']);
});

test('no picture unless one is given', async (t) => {
  const post = mock.method(axios, 'post', async () => ({ data: {} }));
  t.after(() => post.mock.restore());
  await sendTemplate(ready, { to: '9876543210', template: 'donation_thankyou', body: ['a'] });
  assert.equal(picture(post.mock.calls[0]), undefined);
  assert.equal(post.mock.calls[0].arguments[1].template.components.length, 1);
});

test('coupon list in Marathi', () => {
  const many = Array.from({ length: 8 }, (_, i) => `MP-20261013-0${10 + i * 2}`);
  assert.match(couponListText(many, 'mr'), /\+2 आणखी$/);
  assert.equal(couponListText(['MP-20261013-007', 'MP-20261013-008'], 'mr'), 'MP-20261013-007 ते 008 (2)');
  assert.equal(couponListText(['MP-20261013-007', 'MP-20261013-008']), 'MP-20261013-007 to 008 (2)');   // English unchanged
  assert.equal(couponListText(['MP-20261013-007', 'MP-20261013-008'], 'hi'), 'MP-20261013-007 से 008 (2)');
  assert.match(couponListText(many, 'hi'), /\+2 और$/);
});
