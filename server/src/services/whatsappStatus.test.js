import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import axios from 'axios';
import WhatsAppMessage from '../models/WhatsAppMessage.js';
import { signatureOk, statusUpdate, statusesIn } from './whatsappStatus.service.js';
import { sendTemplate } from './whatsappClient.service.js';
import { logger } from '../utils/logger.js';

mock.method(logger, 'info', () => {});
mock.method(logger, 'warn', () => {});
mock.method(logger, 'error', () => {});

const ready = { enabled: true, phoneNumberId: '111', accessToken: 'EAAtok', templates: {}, languages: {} };

// What Meta posts to the webhook (trimmed)
const delivery = (statuses) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', statuses } }] }],
});

test('the webhook\'s statuses are read; messages from devotees are not', () => {
  const body = delivery([
    { id: 'wamid.A', status: 'delivered', timestamp: '1792166787', recipient_id: '919876543210' },
    { id: 'wamid.B', status: 'failed', timestamp: '1792166790', errors: [{ code: 131026, title: 'Message undeliverable' }] },
    { id: 'wamid.C', status: 'deleted' },   // not one of ours
  ]);
  body.entry[0].changes.push({ field: 'messages', value: { messages: [{ id: 'wamid.IN', text: { body: 'hi' } }] } });
  const out = statusesIn(body);
  assert.deepEqual(out.map((s) => [s.waId, s.status, s.error]), [['wamid.A', 'delivered', ''], ['wamid.B', 'failed', 'Message undeliverable']]);
  assert.equal(out[0].at.toISOString(), new Date(1792166787 * 1000).toISOString());
  assert.deepEqual(statusesIn({}), []);
});

test('a status only moves forward: sent → delivered → read; a failure only before delivery', () => {
  const at = new Date();
  assert.deepEqual(statusUpdate({ waId: 'w', status: 'delivered', at }).filter, { waId: 'w', status: { $in: ['sent'] } });
  assert.deepEqual(statusUpdate({ waId: 'w', status: 'read', at }).filter, { waId: 'w', status: { $in: ['sent', 'delivered'] } });
  assert.deepEqual(statusUpdate({ waId: 'w', status: 'failed', at, error: 'x' }), { filter: { waId: 'w', status: 'sent' }, set: { status: 'failed', failedAt: at, error: 'x' } });
  assert.equal(statusUpdate({ waId: 'w', status: 'sent', at }), null);   // recorded when we send it
});

test('only deliveries signed with the Meta app secret are taken', () => {
  const raw = Buffer.from(JSON.stringify(delivery([])));
  const sign = (secret) => `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
  assert.equal(signatureOk(raw, sign('app-secret'), 'app-secret'), true);
  assert.equal(signatureOk(raw, sign('other'), 'app-secret'), false);
  assert.equal(signatureOk(raw, sign('app-secret'), ''), false);   // no secret in Settings → nothing taken
  assert.equal(signatureOk(raw, undefined, 'app-secret'), false);
});

test('a devotee message is recorded with Meta\'s id; a failed one with the reason', async (t) => {
  const created = [];
  const create = mock.method(WhatsAppMessage, 'create', async (doc) => { created.push(doc); return doc; });
  let fail = false;
  const post = mock.method(axios, 'post', async () => {
    if (fail) throw Object.assign(new Error('x'), { response: { data: { error: { code: 131026 } } } });
    return { data: { messages: [{ id: 'wamid.OK' }] } };
  });
  t.after(() => { post.mock.restore(); create.mock.restore(); });

  const track = { kind: 'mahaprasad', ref: 'b-42' };
  assert.equal(await sendTemplate(ready, { to: '9876543210', template: 'mahaprasad_coupon_qr', language: 'hi', body: ['a'], track }), 'sent');
  fail = true;
  assert.equal(await sendTemplate(ready, { to: '9876543210', template: 'mahaprasad_coupon_qr', body: ['a'], track }), 'failed');
  await sendTemplate(ready, { to: '9876543210', template: 'stock_alert', body: ['a'] });   // staff alert: not tracked

  assert.equal(created.length, 2);
  assert.deepEqual([created[0].waId, created[0].status, created[0].to, created[0].language], ['wamid.OK', 'sent', '3210', 'hi']);
  assert.deepEqual([created[1].waId, created[1].status, created[1].ref], [undefined, 'failed', 'b-42']);
  assert.match(created[1].error, /may not be on WhatsApp/);
});
