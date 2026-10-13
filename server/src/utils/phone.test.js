import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskMobile, normaliseMobile } from './phone.js';
import { couponListText } from '../services/mahaprasadNotify.service.js';

test('mobile numbers as devotees give them', () => {
  assert.equal(normaliseMobile('+91 98811 80662'), '9881180662');
  assert.equal(normaliseMobile('919881180662'), '9881180662');
  assert.equal(normaliseMobile('09881180662'), '9881180662');
  assert.equal(normaliseMobile('98811-80662'), '9881180662');
  assert.equal(normaliseMobile('5881180662'), '');   // not a mobile series
  assert.equal(normaliseMobile('98811806'), '');
  assert.equal(normaliseMobile(undefined), '');
  assert.equal(maskMobile('9881180662'), 'XXXXXX0662');
});

test('coupon numbers in a message', () => {
  assert.equal(couponListText(['MP-20261013-007']), 'MP-20261013-007');
  assert.equal(couponListText(['MP-20261013-007', 'MP-20261013-008', 'MP-20261013-009']), 'MP-20261013-007 to 009 (3)');
  assert.equal(couponListText(['MP-20261013-007', 'MP-20261013-011']), 'MP-20261013-007, MP-20261013-011');
  const many = Array.from({ length: 8 }, (_, i) => `MP-20261013-0${10 + i * 2}`);
  assert.match(couponListText(many), /\+2 more$/);
  assert.equal(couponListText([]), '');
});
