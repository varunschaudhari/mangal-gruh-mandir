import Settings from '../models/Settings.js';
import { metaErrorText } from '../services/whatsappClient.service.js';
import { applyStatuses, signatureOk, statusesIn, webhookVerifyToken } from '../services/whatsappStatus.service.js';
import { logger } from '../utils/logger.js';

// Meta's WhatsApp webhook: whether each message to a devotee was delivered / read / failed.
// Set up once in the Meta app (WhatsApp → Configuration → Webhook) with the address and verify
// token shown in Settings → WhatsApp, and the "messages" field subscribed.

// GET /api/webhooks/whatsapp — Meta checks the address once: echo its challenge if the token is ours
export const verifyWhatsAppWebhook = async (req, res) => {
  try {
    const token = String(req.query['hub.verify_token'] || '');
    if (req.query['hub.mode'] === 'subscribe' && token && token === await webhookVerifyToken()) {
      return res.type('text/plain').send(String(req.query['hub.challenge'] ?? ''));
    }
  } catch (err) {
    logger.error('WhatsApp webhook: verification failed', { error: err.message });
  }
  return res.sendStatus(403);
};

// POST /api/webhooks/whatsapp — before the JSON parser: the signature is over the raw body
export const whatsappWebhook = async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const secret = (await Settings.getOrCreate().catch(() => null))?.waAppSecret;
  if (!signatureOk(raw, req.get('x-hub-signature-256'), secret)) {
    logger.warn('WhatsApp webhook: signature did not match (or the Meta app secret is not in Settings → WhatsApp)');
    return res.sendStatus(401);
  }
  let body;
  try { body = JSON.parse(raw.toString('utf8')); } catch { return res.sendStatus(400); }
  res.sendStatus(200);   // at once: Meta resends what isn't answered quickly
  applyStatuses(statusesIn(body, metaErrorText))
    .catch((err) => logger.error('WhatsApp webhook: statuses not saved', { error: err.message }));
};
