import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import '../config/timezone.js';
import { dayProblem, onlineRules, parseDay, priceFor, saleDays } from './mahaprasadOnlineRules.js';
import { paymentSignatureOk, razorpayMode, webhookSignatureOk } from './razorpay.service.js';

const PRICES = { monday: 51, tuesday: 101, wednesday: 51, thursday: 51, friday: 51, saturday: 51, sunday: 0 };
const rules = (over = {}) => onlineRules({ mahaprasadOnlineEnabled: true, mahaprasadDayPricing: PRICES, ...over });
// Tuesday 13 Oct 2026, 10:30 IST
const NOW = new Date(2026, 9, 13, 10, 30);

test('settings become rules, with defaults and limits', () => {
  const r = onlineRules({});
  assert.equal(r.enabled, false);
  assert.equal(r.daysAhead, 7);
  assert.equal(r.maxPlates, 10);
  assert.equal(r.cutoff, '');
  assert.equal(onlineRules({ mahaprasadOnlineDaysAhead: 0 }).daysAhead, 0);
  assert.equal(onlineRules({ mahaprasadOnlineDaysAhead: 500 }).daysAhead, 60);
  assert.equal(onlineRules({ mahaprasadOnlineMaxPlates: 0 }).maxPlates, 1);
  assert.equal(onlineRules({ mahaprasadOnlineCutoff: '11:30' }).cutoff, '11:30');
  assert.equal(onlineRules({ mahaprasadOnlineCutoff: '25:00' }).cutoff, '');
});

test('only real dates are read', () => {
  assert.equal(parseDay('2026-10-13').getHours(), 12);
  assert.equal(parseDay('2026-02-30'), null);
  assert.equal(parseDay('13-10-2026'), null);
  assert.equal(parseDay(undefined), null);
});

test('the price is the weekday’s', () => {
  assert.equal(priceFor(rules(), parseDay('2026-10-13')), 101);   // Tuesday
  assert.equal(priceFor(rules(), parseDay('2026-10-14')), 51);
  assert.equal(priceFor(rules(), parseDay('2026-10-18')), 0);     // Sunday: not priced
});

test('which days can be bought', () => {
  assert.equal(dayProblem('2026-10-13', rules(), NOW), '');
  assert.equal(dayProblem('2026-10-12', rules(), NOW), 'past');
  assert.equal(dayProblem('2026-10-20', rules(), NOW), '');          // today + 7
  assert.equal(dayProblem('2026-10-21', rules(), NOW), 'too_far');
  assert.equal(dayProblem('2026-10-18', rules(), NOW), 'no_price');
  assert.equal(dayProblem('nope', rules(), NOW), 'bad_date');
  assert.equal(dayProblem('2026-10-14', rules({ mahaprasadOnlineDaysAhead: 0 }), NOW), 'too_far');
});

test('today closes at the cutoff; later days stay open', () => {
  const r = rules({ mahaprasadOnlineCutoff: '10:30' });
  assert.equal(dayProblem('2026-10-13', r, NOW), 'closed_today');
  assert.equal(dayProblem('2026-10-13', r, new Date(2026, 9, 13, 10, 29)), '');
  assert.equal(dayProblem('2026-10-14', r, NOW), '');
});

test('the page lists today to today + days ahead', () => {
  const days = saleDays(rules({ mahaprasadOnlineDaysAhead: 6 }), NOW);
  assert.equal(days.length, 7);
  assert.deepEqual(days[0], { date: '2026-10-13', price: 101, problem: '' });
  assert.deepEqual(days[5], { date: '2026-10-18', price: 0, problem: 'no_price' });
});

test('the checkout’s answer is checked against the key secret', () => {
  const secret = 'test_secret';
  const signature = crypto.createHmac('sha256', secret).update('order_1|pay_1').digest('hex');
  assert.equal(paymentSignatureOk({ orderId: 'order_1', paymentId: 'pay_1', signature }, secret), true);
  assert.equal(paymentSignatureOk({ orderId: 'order_1', paymentId: 'pay_2', signature }, secret), false);
  assert.equal(paymentSignatureOk({ orderId: 'order_1', paymentId: 'pay_1', signature: 'x' }, secret), false);
  assert.equal(paymentSignatureOk({ orderId: 'order_1', paymentId: 'pay_1', signature }, ''), false);
});

test('a webhook is checked against the webhook secret over the raw body', () => {
  const secret = 'hook_secret';
  const body = Buffer.from('{"event":"payment.captured"}');
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
  assert.equal(webhookSignatureOk(body, signature, secret), true);
  assert.equal(webhookSignatureOk(Buffer.from('{"event":"payment.failed"}'), signature, secret), false);
  assert.equal(webhookSignatureOk(body, signature, ''), false);
});

test('test and live keys are told apart', () => {
  assert.equal(razorpayMode('rzp_test_abc'), 'test');
  assert.equal(razorpayMode('rzp_live_a4OF355BNIbtHt'), 'live');
  assert.equal(razorpayMode(''), '');
});
