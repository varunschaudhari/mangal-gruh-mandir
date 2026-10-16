import axios from 'axios';
import Settings, { WA_LANGUAGE_DEFAULTS, WA_TEMPLATE_DEFAULTS } from '../models/Settings.js';
import { logger } from '../utils/logger.js';
import { normaliseMobile } from '../utils/phone.js';

// Every WhatsApp message the app sends goes through here (Meta WhatsApp Cloud API): one place for
// the settings, the API version, the phone-number format and the error handling.
//
// Settings → WhatsApp holds the switch, the Phone Number ID, the access token and the name of each
// approved template (the booking receipt's is in Bookings → Setup). server/.env can still supply
// the number ID and token for older installations — but not its sample placeholder values.

/** Meta Graph API version: v25.0 came out in Feb 2026; Meta retires each about two years after release. */
export const GRAPH_VERSION = process.env.WA_GRAPH_VERSION || 'v25.0';

const fromEnv = (key) => {
  const v = String(process.env[key] || '').trim();
  return v && !/^your_/i.test(v) ? v : '';   // .env.example's "your_…" samples count as not set
};

/** The WhatsApp settings: { enabled, phoneNumberId, accessToken, templates, languages }. */
export async function whatsappConfig() {
  const s = await Settings.getOrCreate();
  const saved = s.waTemplates || {};
  const savedLanguages = s.waLanguages || {};
  return {
    enabled: Boolean(s.waEnabled),
    phoneNumberId: String(s.waPhoneNumberId || fromEnv('WA_PHONE_NUMBER_ID')).trim(),
    accessToken: String(s.waAccessToken || fromEnv('WA_ACCESS_TOKEN')).trim(),
    templates: Object.fromEntries(Object.entries(WA_TEMPLATE_DEFAULTS).map(([k, def]) => [k, String(saved[k] ?? def).trim()])),
    languages: Object.fromEntries(Object.entries(WA_LANGUAGE_DEFAULTS).map(([k, def]) => [k, ['mr', 'en'].includes(savedLanguages[k]) ? savedLanguages[k] : def])),
  };
}

/**
 * A message with an English and a Marathi version: the language chosen in Settings → WhatsApp
 * first, and the other as the fallback (for when Meta has only one of them approved).
 */
export function bilingual(cfg, key, { en, mr }) {
  const first = cfg?.languages?.[key] === 'en' ? 'en' : 'mr';
  const body = { en, mr };
  const other = first === 'mr' ? 'en' : 'mr';
  return { language: first, body: body[first], fallback: { language: other, body: body[other] } };
}

/** Can messages be sent at all (switched on, number ID and token there)? */
export const whatsappReady = (cfg) => Boolean(cfg?.enabled && cfg.phoneNumberId && cfg.accessToken);

/**
 * A phone number as WhatsApp wants it: digits with the country code. Indian mobiles may be typed
 * any usual way ("98765 43210", "+91-98765-43210", "098765 43210"); other countries need "+" or
 * "00" in front. Returns null for anything that isn't a mobile number.
 */
export function whatsappNumber(raw) {
  const text = String(raw ?? '').trim();
  const intl = /^(\+|00)/.test(text) ? text.replace(/\D/g, '').replace(/^00/, '') : '';
  if (intl && !intl.startsWith('91')) return /^[1-9]\d{7,14}$/.test(intl) ? intl : null;
  const mobile = normaliseMobile(intl || text);
  return mobile ? `91${mobile}` : null;
}

/** Template body values → the "components" Meta expects (an empty value is sent as "-"). */
export const bodyComponent = (values) => ({
  type: 'body',
  parameters: values.map((v) => ({ type: 'text', text: String(v ?? '').trim() || '-' })),
});

/** A picture (its https address) for a template with an Image header. */
export const imageHeader = (link) => ({ type: 'header', parameters: [{ type: 'image', image: { link } }] });

// What the usual Meta errors mean, in words the office can act on.
const META_HINTS = {
  190: 'The access token has expired or is wrong. Paste a permanent System User token in Settings → WhatsApp.',
  10: 'The access token has no permission for this WhatsApp number. Give the System User the WhatsApp account and whatsapp_business_messaging.',
  200: 'The access token has no permission for this WhatsApp number. Give the System User the WhatsApp account and whatsapp_business_messaging.',
  133010: 'This WhatsApp number is not registered with the Cloud API yet. Finish its registration in WhatsApp Manager.',
  131030: 'Meta’s test number can only send to the numbers in its allowed list (WhatsApp → API Setup).',
  131026: 'This number could not receive the message: it may not be on WhatsApp.',
  131031: 'The WhatsApp business account is locked. Check WhatsApp Manager.',
  131042: 'Payment problem on the WhatsApp account. Add a payment method in Meta Business Suite → Billing.',
  132001: 'No approved template with this name in this language. Check the name (and English / Marathi) in WhatsApp Manager.',
  132000: 'The template has a different number of {{…}} values than the app sends. Use the wording shown in Settings → WhatsApp.',
  132012: 'The template’s parts don’t match what the app sends (e.g. it has, or lacks, an image header).',
  132015: 'This template is paused by Meta for low quality. Check WhatsApp Manager.',
  130429: 'Too many messages at once. Meta will accept more shortly.',
  131056: 'Too many messages to this number in a short time.',
};

/** A Meta error as a sentence: what to fix, plus Meta's code. */
export function metaErrorText(e) {
  if (!e) return '';
  if (e.code === 100 && e.error_subcode === 33) return 'The Phone Number ID is wrong, or the token can’t use it. Copy it again from WhatsApp → API Setup. (Meta error 100)';
  const hint = META_HINTS[e.code];
  const detail = e.error_data?.details || e.message || '';
  return hint ? `${hint} (Meta error ${e.code})` : `${detail}${e.code ? ` (Meta error ${e.code})` : ''}`;
}

const masked = (raw) => {
  const d = String(raw ?? '').replace(/\D/g, '');
  return d ? `…${d.slice(-4)}` : '(none)';
};

/**
 * Sends one approved template. `body` = the {{1}}, {{2}}… values; `image` = the address of a
 * picture for a template with an Image header (fetched by Meta); or pass full `components`.
 * `fallback` ({ language, body | components }) is sent instead when Meta has no approved version
 * in `language` — with the same `image`. Returns 'sent', 'off' (not set up / template not named)
 * or 'failed' (logged). Never throws.
 */
export async function sendTemplate(cfg, { to, template, language = 'en', body = [], image, components, label = 'WhatsApp', fallback }) {
  if (!whatsappReady(cfg) || !template) return 'off';
  const number = whatsappNumber(to);
  if (!number) {
    logger.warn(`${label}: not sent — not a mobile number`, { to: masked(to) });
    return 'failed';
  }
  try {
    await axios.post(
      `https://graph.facebook.com/${GRAPH_VERSION}/${cfg.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: number,
        type: 'template',
        template: {
          name: template,
          language: { code: language },
          components: components || [...(image ? [imageHeader(image)] : []), bodyComponent(body)],
        },
      },
      { headers: { Authorization: `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' }, timeout: 15000 },
    );
    return 'sent';
  } catch (err) {
    const e = err.response?.data?.error;
    if (e?.code === 132001 && fallback) {
      logger.info(`${label}: no approved "${language}" version of ${template}, sending "${fallback.language}"`);
      return sendTemplate(cfg, { to, template, label, image, ...fallback });
    }
    logger.error(`${label}: WhatsApp message failed`, {
      to: masked(number), template, language, error: e ? metaErrorText(e) : err.message,
    });
    return 'failed';
  }
}

/** Sends the same template to several people; returns how many went out. */
export async function sendTemplateToAll(cfg, people, message) {
  const results = await Promise.all(people.map((p) => sendTemplate(cfg, { ...message, to: p.phone, label: `${message.label || 'WhatsApp'} → ${p.name}` })));
  return results.filter((r) => r === 'sent').length;
}
