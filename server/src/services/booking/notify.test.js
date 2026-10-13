import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../config/timezone.js';
import { receiptLanguage, whatsappReceipt } from './notify.js';

const booking = {
  devotee: { name: 'Ramesh Patil', phone: '9876543210' }, sevaName: 'Abhishek', receiptNo: 'MANGAL/2026-27/00042',
  receiptToken: 'AbCdEfGhIjKlMnOp', dateKey: '2026-10-20', performDate: new Date('2026-10-20T00:00:00+05:30'),
  batchLabel: '7:00 AM – 8:15 AM', hall: 'H1',
};
const halls = { H1: { name: 'Abhishek Hall 01', nameMr: 'अभिषेक हॉल 01' } };
const texts = (msg) => msg.components.find((c) => c.type === 'body').parameters.map((p) => p.text);

test('receipt language: the devotee\'s choice, else the default — only an approved one', () => {
  const both = { whatsappLanguages: ['mr', 'en'], whatsappLanguage: 'mr' };
  assert.equal(receiptLanguage(booking, both), 'mr');                                              // no choice → default
  assert.equal(receiptLanguage({ devotee: { language: 'en' } }, both), 'en');                       // chosen at the counter
  assert.equal(receiptLanguage({ devotee: { language: 'mr' } }, { ...both, whatsappLanguages: ['en'] }), 'en'); // Marathi not approved
  assert.equal(receiptLanguage({ devotee: { language: 'en' } }, { ...both, whatsappLanguages: ['mr'] }), 'mr');
  assert.equal(receiptLanguage(booking, {}), 'en');                                                // older setup: English only
});

test('English receipt: English values, no picture unless asked', () => {
  const msg = whatsappReceipt(booking, { halls, lang: 'en' });
  assert.deepEqual(msg.language, { code: 'en' });
  assert.equal(msg.components.length, 1);
  assert.deepEqual(texts(msg), [
    'Ramesh Patil', 'Abhishek', 'Tue, 20 Oct, 2026, 7:00 AM – 8:15 AM, Abhishek Hall 01 (H1)', 'MANGAL/2026-27/00042',
    `${process.env.PUBLIC_APP_URL || (process.env.CLIENT_URL || 'https://mandir.aumora.io').split(',')[0]}/r/AbCdEfGhIjKlMnOp`,
  ]);
});

test('Marathi receipt: Marathi seva and hall names, Marathi date, slip picture on top', () => {
  const msg = whatsappReceipt(booking, { halls, lang: 'mr', sevaNameMr: 'अभिषेक', withImage: true });
  assert.deepEqual(msg.language, { code: 'mr' });
  assert.equal(msg.components[0].type, 'header');
  assert.match(msg.components[0].parameters[0].image.link, /\/api\/public\/receipts\/AbCdEfGhIjKlMnOp\/slip\.png$/);
  const [name, seva, when] = texts(msg);
  assert.equal(name, 'Ramesh Patil');
  assert.equal(seva, 'अभिषेक');
  assert.equal(when, 'मंगळवार, २० ऑक्टोबर, २०२६, 7:00 AM – 8:15 AM, अभिषेक हॉल 01 (H1)');
  // A seva with no Marathi name keeps its name; a postal seva has no date
  const postal = whatsappReceipt({ ...booking, dateKey: undefined, hall: '' }, { lang: 'mr' });
  assert.deepEqual(texts(postal).slice(1, 3), ['Abhishek', 'आपल्या वतीने']);
});
