import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import '../config/timezone.js';
import axios from 'axios';
import Settings from '../models/Settings.js';
import { bilingual, sendTemplate } from './whatsappClient.service.js';
import { sendDonationThankYou } from './donationWhatsapp.service.js';
import { couponListText, sendCouponMessage } from './mahaprasadNotify.service.js';
import { logger } from '../utils/logger.js';

mock.method(logger, 'info', () => {});
mock.method(logger, 'error', () => {});

const ready = { enabled: true, phoneNumberId: '111', accessToken: 'EAAtok', templates: {}, languages: {} };
const texts = (call) => call.arguments[1].template.components[0].parameters.map((p) => p.text);
const settingsWith = (extra = {}) => mock.method(Settings, 'getOrCreate',
  async () => new Settings({ waEnabled: true, waPhoneNumberId: '111', waAccessToken: 'EAAtok', ...extra }));

test('the chosen language first, the other as fallback (Marathi unless set to English)', () => {
  const msg = { en: ['Ramesh'], mr: ['रमेश'] };
  assert.deepEqual(bilingual(ready, 'donationThanks', msg), { language: 'mr', body: ['रमेश'], fallback: { language: 'en', body: ['Ramesh'] } });
  assert.deepEqual(bilingual({ languages: { donationThanks: 'en' } }, 'donationThanks', msg),
    { language: 'en', body: ['Ramesh'], fallback: { language: 'mr', body: ['रमेश'] } });
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

test('donation thank-you in English when chosen', async (t) => {
  const s = settingsWith({ waLanguages: { donationThanks: 'en' } });
  const post = mock.method(axios, 'post', async () => ({ data: {} }));
  t.after(() => { post.mock.restore(); s.mock.restore(); });
  await sendDonationThankYou({ donorPhone: '9876543210', totalEstimatedValue: 501, occasion: { name: 'Diwali' }, date: new Date('2026-10-16T10:00:00+05:30') });
  assert.equal(post.mock.calls[0].arguments[1].template.language.code, 'en');
  assert.deepEqual(texts(post.mock.calls[0]), ['Devotee', '501', 'Diwali', '16 Oct 2026', '-']);
});

test('Mahaprasad coupons in Marathi, with the QR link', async (t) => {
  const s = settingsWith({ waTemplates: { mahaprasadCoupons: 'mahaprasad_coupon_qr' } });
  const post = mock.method(axios, 'post', async () => ({ data: {} }));
  t.after(() => { post.mock.restore(); s.mock.restore(); });
  const out = await sendCouponMessage({
    mobile: '9876543210', numbers: ['MP-20261013-007', 'MP-20261013-008', 'MP-20261013-009'],
    date: new Date('2026-10-13T10:00:00+05:30'), persons: 3, link: 'https://mandir.aumora.io/m/AbCd',
  });
  assert.equal(out.whatsapp, 'sent');
  assert.equal(post.mock.calls[0].arguments[1].template.language.code, 'mr');
  assert.deepEqual(texts(post.mock.calls[0]), ['मंगळवार, १३ ऑक्टोबर, २०२६', 'MP-20261013-007 ते 009 (3)', '3 व्यक्ती', 'https://mandir.aumora.io/m/AbCd']);
});

test('coupon list in Marathi', () => {
  const many = Array.from({ length: 8 }, (_, i) => `MP-20261013-0${10 + i * 2}`);
  assert.match(couponListText(many, 'mr'), /\+2 आणखी$/);
  assert.equal(couponListText(['MP-20261013-007', 'MP-20261013-008'], 'mr'), 'MP-20261013-007 ते 008 (2)');
  assert.equal(couponListText(['MP-20261013-007', 'MP-20261013-008']), 'MP-20261013-007 to 008 (2)');   // English unchanged
});
