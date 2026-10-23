import crypto from 'crypto';
import Settings from '../models/Settings.js';
import WhatsAppMessage from '../models/WhatsAppMessage.js';
import { logger } from '../utils/logger.js';

// Did the devotee's WhatsApp message arrive? Each message to a devotee is recorded when it is sent
// (with Meta's message id); Meta then reports delivered / read / failed to our webhook
// (POST /api/webhooks/whatsapp), set up once in the Meta app — Settings → WhatsApp shows how.

const RANK = { sent: 1, delivered: 2, read: 3 };

/** Records a message as it leaves (or fails to). `track` = { kind, ref }. Never throws. */
export async function recordMessage(track, { waId, to, template, language, error } = {}) {
  if (!track?.kind || !track?.ref) return;
  const now = new Date();
  const digits = String(to ?? '').replace(/\D/g, '');
  try {
    await WhatsAppMessage.create({
      ...(waId ? { waId } : {}), kind: track.kind, ref: String(track.ref), to: digits.slice(-4), template, language,
      ...(error ? { status: 'failed', error, failedAt: now } : { status: 'sent', sentAt: now }),
    });
  } catch (err) {
    logger.error('WhatsApp message not recorded', { kind: track.kind, ref: track.ref, error: err.message });
  }
}

/**
 * The status changes in a webhook delivery: [{ waId, status, at, error }]. Meta sends them under
 * entry[].changes[].value.statuses[] (incoming messages from devotees come under "messages" — ignored).
 */
export function statusesIn(body, describeError = (e) => e?.title || e?.message || '') {
  const out = [];
  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      for (const s of change?.value?.statuses || []) {
        if (!s?.id || !['sent', 'delivered', 'read', 'failed'].includes(s.status)) continue;
        out.push({
          waId: String(s.id),
          status: s.status,
          at: s.timestamp ? new Date(Number(s.timestamp) * 1000) : new Date(),
          error: s.status === 'failed' ? describeError(s.errors?.[0]) : '',
        });
      }
    }
  }
  return out;
}

/**
 * The update for one status, only moving forward: sent → delivered → read (Meta may send them out
 * of order, and "read" means it was delivered too). A failure counts only before delivery.
 * Returns { filter, set } for updateOne, or null when nothing changes.
 */
export function statusUpdate({ waId, status, at, error }) {
  if (status === 'failed') {
    return { filter: { waId, status: 'sent' }, set: { status: 'failed', failedAt: at, error } };
  }
  const rank = RANK[status];
  if (!rank) return null;
  const earlier = Object.keys(RANK).filter((k) => RANK[k] < rank);
  if (!earlier.length) return null;   // "sent" is recorded when we send it
  const set = { status, [`${status}At`]: at };
  if (status === 'read') set.deliveredAt = at;   // kept only if not already set (see applyStatuses)
  return { filter: { waId, status: { $in: earlier } }, set };
}

/** Applies a webhook's status changes; returns how many messages moved on. */
export async function applyStatuses(statuses) {
  let moved = 0;
  for (const s of statuses) {
    const u = statusUpdate(s);
    if (!u) continue;
    const { deliveredAt, ...rest } = u.set;
    // "read" keeps an earlier delivery time (an update pipeline, so the values are literals)
    const update = deliveredAt
      ? [{ $set: { ...Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, { $literal: v }])), deliveredAt: { $ifNull: ['$deliveredAt', deliveredAt] } } }]
      : { $set: rest };
    const res = await WhatsAppMessage.updateOne(u.filter, update, { updatePipeline: Array.isArray(update) });
    moved += res.modifiedCount;
  }
  return moved;
}

/** The latest message for each of `refs` (a kind's batchIds / booking ids): Map ref → { status, at, error }. */
export async function latestStatuses(kind, refs) {
  const ids = [...new Set(refs.filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  const rows = await WhatsAppMessage.aggregate([
    { $match: { kind, ref: { $in: ids } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$ref', last: { $first: '$$ROOT' }, tries: { $sum: 1 } } },
  ]);
  return new Map(rows.map(({ _id, last, tries }) => [_id, {
    status: last.status,
    at: last.readAt || last.deliveredAt || last.failedAt || last.sentAt || last.createdAt,
    error: last.error || '',
    tries,
  }]));
}

// ── The webhook's settings ───────────────────────────────────────────────────

/** The verify token Meta asks for when the webhook is set up: made once, kept in Settings. */
export async function webhookVerifyToken() {
  const s = await Settings.getOrCreate();
  if (s.waWebhookToken) return s.waWebhookToken;
  const token = crypto.randomBytes(16).toString('hex');
  await Settings.updateOne({ _id: s._id, waWebhookToken: { $in: [null, ''] } }, { $set: { waWebhookToken: token } });
  return (await Settings.findById(s._id).select('waWebhookToken').lean())?.waWebhookToken || token;
}

/** Meta signs each delivery: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, raw body). */
export function signatureOk(raw, header, appSecret) {
  if (!appSecret || !header || !Buffer.isBuffer(raw)) return false;
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(raw).digest('hex')}`;
  const a = Buffer.from(String(header));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
