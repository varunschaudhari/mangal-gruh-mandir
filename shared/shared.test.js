// Run by the server's `npm test` (node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAddress, isPincode } from './address.js';
import { dayCode } from './attendanceCodes.js';
import { localDateStr } from './dates.js';
import { cleanPaymentRef, paymentRefProblem } from './payment.js';
import { amountInWordsHi, couponBadge, couponText, fallbackOf, receiptText, sevaNameFor } from './devoteeLanguage.js';

test('address: parts joined, repeated names once, PIN last', () => {
  assert.equal(
    formatAddress({ address: '12, Ganesh Peth', area: 'Amalner', city: 'Amalner', district: 'Jalgaon', state: 'Maharashtra', pincode: '425401' }),
    '12, Ganesh Peth, Amalner, Dist. Jalgaon, Maharashtra – 425401',
  );
  assert.equal(formatAddress({ pincode: '425401' }), '425401');
  assert.equal(formatAddress(), '');
});

test('PIN code: 6 digits, not starting with 0', () => {
  assert.equal(isPincode('425401'), true);
  assert.equal(isPincode('012345'), false);
  assert.equal(isPincode('4254'), false);
});

test('register codes: leave cover decides PL / EL / A / UL; double shift gets +', () => {
  assert.equal(dayCode({ status: 'present' }), 'P');
  assert.equal(dayCode({ status: 'present', double: true }), 'P+');
  assert.equal(dayCode({ status: 'absent', cover: { paid: 1, extra: 0, unpaid: 0 } }), 'PL');
  assert.equal(dayCode({ status: 'absent', cover: { paid: 0, extra: 0.5, unpaid: 0.5 } }), 'EL');
  assert.equal(dayCode({ status: 'absent', cover: { paid: 0, extra: 0, unpaid: 1 } }), 'A');
  assert.equal(dayCode({ status: 'leave', cover: { paid: 0, extra: 0, unpaid: 1 } }), 'UL');
  assert.equal(dayCode({ status: 'unscheduled' }), 'U');
  assert.equal(dayCode({ status: 'upcoming', double: true }), '');
  assert.equal(dayCode(null), '');
});

test('local date: the India calendar day, not the UTC one', () => {
  // 00:30 local time on 1 Oct (in IST still 30 Sep in UTC)
  assert.equal(localDateStr(new Date(2026, 9, 1, 0, 30)), '2026-10-01');
  assert.equal(localDateStr('2026-10-12T12:00:00'), '2026-10-12');
});

test('payment reference: UPI and card need one the cashier can match, cash none', () => {
  assert.equal(paymentRefProblem('cash', ''), '');
  assert.match(paymentRefProblem('upi', ''), /UTR/);
  assert.match(paymentRefProblem('upi', ' 12 '), /UTR/);           // too short to match anything
  assert.equal(paymentRefProblem('upi', '4123 5678 9012'), '');    // a full UTR, spaces and all
  assert.equal(paymentRefProblem('upi', '9012'), '');              // its last 4 digits
  assert.match(paymentRefProblem('card', '--'), /last 4 digits/);
  assert.equal(paymentRefProblem('card', '4242'), '');
  assert.equal(paymentRefProblem('card', 'A1B2C3'), '');           // approval code
  assert.equal(cleanPaymentRef(' 4123 5678 9012 '), '412356789012');
});

test('Hindi for devotees: amount in words, receipt wording, fallback language', () => {
  assert.equal(amountInWordsHi(2100), 'दो हज़ार एक सौ');
  assert.equal(amountInWordsHi(125000), 'एक लाख पच्चीस हज़ार');
  assert.equal(amountInWordsHi(10474927), 'एक करोड़ चार लाख चौहत्तर हज़ार नौ सौ सत्ताईस');
  assert.equal(amountInWordsHi(99), 'निन्यानवे');
  assert.equal(amountInWordsHi(0), 'शून्य');
  assert.equal(receiptText('hi').receipt, 'रसीद');
  assert.equal(receiptText('mr').receipt, 'Receipt');   // Marathi bookings keep the English slip
  assert.equal(sevaNameFor('hi', 'Abhishek', 'अभिषेक'), 'अभिषेक');
  assert.equal(sevaNameFor('hi', 'Abhishek', ''), 'Abhishek');
  assert.equal(sevaNameFor('en', 'Abhishek', 'अभिषेक'), 'Abhishek');
  assert.deepEqual(['hi', 'mr', 'en'].map(fallbackOf), ['en', 'en', 'mr']);
});

test('the coupon in its language: English as it always printed, Marathi and Hindi words', () => {
  const free = { type: 'free', groupSize: 1 };
  const group = { type: 'paid', isGroup: true, groupSize: 4, amount: 120 };
  assert.deepEqual(['en', 'mr', 'hi'].map((l) => couponBadge(free, l)), ['FREE SEVA', 'मोफत सेवा', 'निःशुल्क सेवा']);
  assert.deepEqual(['en', 'hi'].map((l) => couponBadge(group, l)), ['GROUP  4x  Rs.120', 'समूह · 4 व्यक्ति · ₹120']);
  assert.equal(couponText('hi').servings(5), '5 व्यक्तियों के लिए');
  assert.equal(couponText('gu').title, 'Shri Mangal Mahaprasad Coupon');   // anything else: English
});
