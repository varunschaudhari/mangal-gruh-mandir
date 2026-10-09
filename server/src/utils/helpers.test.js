import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeRegex } from './helpers.js';

test('escapeRegex turns search text into a literal pattern', () => {
  for (const text of ['Rice (Basmati', 'a.b*c+?', 'x[1]\\y', '$5 ^top|{2}']) {
    const re = new RegExp(escapeRegex(text), 'i');
    assert.ok(re.test(`before ${text} after`), text);
  }
  assert.equal(new RegExp(escapeRegex('a.c')).test('abc'), false); // "." is not a wildcard any more
});
