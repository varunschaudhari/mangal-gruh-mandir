import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fkPin, fkTime, parseGlog, readFkJson } from './fkweb.js';

// What the machine sends: 4-byte length, the JSON, then binary data
const body = (json, tail = Buffer.alloc(0)) => {
  const text = Buffer.from(JSON.stringify(json), 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(text.length + 1, 0);
  return Buffer.concat([len, text, Buffer.from([0]), tail]);
};

test('reads the JSON at the start of a body, whatever binary follows it', () => {
  const tail = Buffer.from([0x7b, 0x22, 0x7d, 0x7d, 0xff, 0x00, 0x22, 0x7b]); // { " } } … " {
  const json = readFkJson(body({ user_id: '00000012', io_time: '20261020081503', log_image: 'BIN_1' }, tail));
  assert.deepEqual(json, { user_id: '00000012', io_time: '20261020081503', log_image: 'BIN_1' });
  // Braces inside strings don't end it
  assert.equal(readFkJson(body({ user_name: 'A {b} "c"' })).user_name, 'A {b} "c"');
  // Names typed on the machine survive (UTF-8)
  assert.equal(readFkJson(body({ user_name: 'राम' })).user_name, 'राम');
  assert.equal(readFkJson(Buffer.from([1, 2, 3])), null);
  assert.equal(readFkJson(Buffer.from('{"broken": ')), null);
});

test('machine numbers lose the zero padding', () => {
  assert.equal(fkPin('00000012'), '12');
  assert.equal(fkPin('0'), '0');
  assert.equal(fkPin(7), '7');
  assert.equal(fkPin(' A12 '), 'A12');
});

test('punch times in both formats, impossible dates refused', () => {
  assert.deepEqual(fkTime('20261020081503'), new Date(2026, 9, 20, 8, 15, 3));
  assert.deepEqual(fkTime('2026-10-20 08:15:03'), new Date(2026, 9, 20, 8, 15, 3));
  assert.equal(fkTime('20261320081503'), null);
  assert.equal(fkTime('20260231081503'), null);
  assert.equal(fkTime(''), null);
  assert.equal(fkTime('yesterday'), null);
});

test('a punch: machine number, time and how they were recognised', () => {
  assert.deepEqual(parseGlog({ user_id: '00000012', io_time: '20261020081503', verify_mode: 'FACE', io_mode: 1 }),
    { pin: '12', time: new Date(2026, 9, 20, 8, 15, 3), verify: 'face' });
  assert.equal(parseGlog({ user_id: '3', io_time: '20261020081503', verify_mode: ['FP', 'CARD'] }).verify, 'finger');
  assert.equal(parseGlog({ user_id: '3', io_time: '20261020081503', verify_mode: 'FP+PASSWORD' }).verify, 'finger');
  assert.equal(parseGlog({ user_id: '3', io_time: '20261020081503', verify_type: 15 }).verify, 'card');
  assert.equal(parseGlog({ user_id: '3', io_time: '20261020081503' }).verify, '');
  assert.equal(parseGlog({ user_id: '', io_time: '20261020081503' }), null);
  assert.equal(parseGlog({ user_id: '3' }), null);
  assert.equal(parseGlog(null), null);
});
