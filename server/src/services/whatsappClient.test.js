import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import Settings from '../models/Settings.js';
import {
  GRAPH_VERSION, bodyComponent, metaErrorText, sendTemplate, sendTemplateToAll, whatsappConfig, whatsappNumber,
} from './whatsappClient.service.js';
import { logger } from '../utils/logger.js';

mock.method(logger, 'warn', () => {});
mock.method(logger, 'error', () => {});

const ready = { enabled: true, phoneNumberId: '1100536663150619', accessToken: 'EAAtoken', templates: {} };

test('phone numbers as WhatsApp wants them', () => {
  assert.equal(whatsappNumber('9876543210'), '919876543210');
  assert.equal(whatsappNumber('98765 43210'), '919876543210');
  assert.equal(whatsappNumber('+91-98765-43210'), '919876543210');
  assert.equal(whatsappNumber('919876543210'), '919876543210');
  assert.equal(whatsappNumber('09876543210'), '919876543210');
  assert.equal(whatsappNumber('0091 98765 43210'), '919876543210');
  assert.equal(whatsappNumber('+1 415 555 0100'), '14155550100');          // abroad: needs the +
  assert.equal(whatsappNumber('+44 7700 900123'), '447700900123');
  assert.equal(whatsappNumber('5876543210'), null);                         // not a mobile series
  assert.equal(whatsappNumber('+91 98765'), null);
  assert.equal(whatsappNumber('02587299999'), null);                        // landline
  assert.equal(whatsappNumber(''), null);
  assert.equal(whatsappNumber(undefined), null);
});

test('template values: never empty', () => {
  assert.deepEqual(bodyComponent(['Ramesh', 5001, '', null]), {
    type: 'body',
    parameters: [{ type: 'text', text: 'Ramesh' }, { type: 'text', text: '5001' }, { type: 'text', text: '-' }, { type: 'text', text: '-' }],
  });
});

test('settings: saved names, defaults, and .env samples ignored', async (t) => {
  const env = { id: process.env.WA_PHONE_NUMBER_ID, token: process.env.WA_ACCESS_TOKEN };
  t.after(() => {
    process.env.WA_PHONE_NUMBER_ID = env.id ?? '';
    process.env.WA_ACCESS_TOKEN = env.token ?? '';
    mock.restoreAll();
    mock.method(logger, 'warn', () => {});
    mock.method(logger, 'error', () => {});
  });
  process.env.WA_PHONE_NUMBER_ID = 'your_phone_number_id_here';
  process.env.WA_ACCESS_TOKEN = 'your_permanent_access_token';

  mock.method(Settings, 'getOrCreate', async () => new Settings({ waEnabled: true, waTemplates: { stockAlert: ' my_stock ', paymentStatus: '' } }));
  let cfg = await whatsappConfig();
  assert.equal(cfg.phoneNumberId, '');                                     // placeholder ≠ set
  assert.equal(cfg.accessToken, '');
  assert.equal(cfg.templates.stockAlert, 'my_stock');
  assert.equal(cfg.templates.paymentStatus, '');                           // emptied = off
  assert.equal(cfg.templates.donationThanks, 'donation_thankyou');         // default
  assert.equal(cfg.templates.mahaprasadCoupons, '');                       // off until named
  assert.equal(await sendTemplate(cfg, { to: '9876543210', template: 'my_stock' }), 'off');

  process.env.WA_PHONE_NUMBER_ID = '123456';
  process.env.WA_ACCESS_TOKEN = 'EAAenv';
  cfg = await whatsappConfig();
  assert.equal(cfg.phoneNumberId, '123456');
  assert.equal(cfg.accessToken, 'EAAenv');
});

test('sends the template to Meta in the right shape', async (t) => {
  const post = mock.method(axios, 'post', async () => ({ data: {} }));
  t.after(() => post.mock.restore());

  assert.equal(await sendTemplate(ready, { to: '98765 43210', template: 'donation_thankyou', body: ['Ramesh', '5,001'] }), 'sent');
  const [url, payload, opts] = post.mock.calls[0].arguments;
  assert.equal(url, `https://graph.facebook.com/${GRAPH_VERSION}/1100536663150619/messages`);
  assert.equal(payload.to, '919876543210');
  assert.equal(payload.template.name, 'donation_thankyou');
  assert.deepEqual(payload.template.language, { code: 'en' });
  assert.deepEqual(payload.template.components[0].parameters.map((p) => p.text), ['Ramesh', '5,001']);
  assert.equal(opts.headers.Authorization, 'Bearer EAAtoken');

  const components = [{ type: 'header', parameters: [] }];
  await sendTemplate(ready, { to: '9876543210', template: 'booking_confirmation', language: 'mr', components });
  assert.equal(post.mock.calls[1].arguments[1].template.language.code, 'mr');
  assert.equal(post.mock.calls[1].arguments[1].template.components, components);
});

test('off, bad numbers and Meta errors never throw', async (t) => {
  const post = mock.method(axios, 'post', async () => {
    throw Object.assign(new Error('Request failed'), { response: { data: { error: { code: 132001, message: 'Template name does not exist' } } } });
  });
  t.after(() => post.mock.restore());

  assert.equal(await sendTemplate({ ...ready, enabled: false }, { to: '9876543210', template: 'x' }), 'off');
  assert.equal(await sendTemplate(ready, { to: '9876543210', template: '' }), 'off');
  assert.equal(await sendTemplate(ready, { to: '12345', template: 'x' }), 'failed');
  assert.equal(post.mock.callCount(), 0);
  assert.equal(await sendTemplate(ready, { to: '9876543210', template: 'x' }), 'failed');
  assert.equal(await sendTemplateToAll(ready, [{ phone: '9876543210', name: 'A' }, { phone: '', name: 'B' }], { template: 'x' }), 0);
});

test('Meta errors in words', () => {
  assert.match(metaErrorText({ code: 190, message: 'Error validating access token' }), /token has expired.*\(Meta error 190\)/);
  assert.match(metaErrorText({ code: 100, error_subcode: 33, message: 'Unsupported post request' }), /Phone Number ID is wrong/);
  assert.equal(metaErrorText({ code: 999, message: 'Something new' }), 'Something new (Meta error 999)');
  assert.equal(metaErrorText(undefined), '');
});
