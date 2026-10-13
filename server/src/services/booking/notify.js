import axios from 'axios';
import Booking from '../../models/Booking.js';
import BookingSettings from '../../models/BookingSettings.js';
import SevaType from '../../models/SevaType.js';
import Settings from '../../models/Settings.js';
import { logger } from '../../utils/logger.js';
import { hallNames, hallTitle } from './halls.js';

// Public web address of the app, for receipt links sent to devotees.
const appUrl = () => (process.env.PUBLIC_APP_URL || (process.env.CLIENT_URL || 'https://mandir.aumora.io').split(',')[0]).trim().replace(/\/$/, '');

export const receiptUrl = (booking) => `${appUrl()}/r/${booking.receiptToken}`;
// The counter slip as a picture (QR included) — the image at the top of the WhatsApp receipt
export const slipImageUrl = (booking) => `${appUrl()}/api/public/receipts/${booking.receiptToken}/slip.png`;

const whenText = (b, halls) => {
  if (!b.dateKey) return 'on your behalf';
  const date = new Date(b.performDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const title = hallTitle(b.hall, halls);
  return [date, b.batchLabel, b.hall && (title === b.hall ? `Hall ${b.hall}` : title)].filter(Boolean).join(', ');
};

// The same in Marathi: "मंगळवार, २० ऑक्टोबर, २०२६, 7:00 AM – 8:15 AM, अभिषेक हॉल 01 (H1)"
const whenTextMr = (b, halls) => {
  if (!b.dateKey) return 'आपल्या वतीने';
  const date = new Date(b.performDate).toLocaleDateString('mr-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const h = halls?.[b.hall];
  const hall = b.hall && (h?.nameMr ? `${h.nameMr} (${b.hall})` : h?.name ? hallTitle(b.hall, halls) : `हॉल ${b.hall}`);
  return [date, b.batchLabel, hall].filter(Boolean).join(', ');
};

/**
 * The language to send the receipt in: the devotee's (chosen at the counter), else Setup's
 * default — but only one the template is approved in, so a message never fails for that.
 */
export function receiptLanguage(booking, bs = {}) {
  const approved = bs.whatsappLanguages?.length ? bs.whatsappLanguages : ['en'];
  const wanted = booking.devotee?.language || bs.whatsappLanguage || 'mr';
  return approved.includes(wanted) ? wanted : approved[0];
}

/**
 * The template's language and filled-in parts: the slip picture (when the template has it) and
 * {{1}} name, {{2}} seva, {{3}} date · batch · hall, {{4}} receipt number, {{5}} receipt link.
 */
export function whatsappReceipt(booking, { halls = {}, lang = 'en', sevaNameMr = '', withImage = false } = {}) {
  const mr = lang === 'mr';
  const values = [
    booking.devotee.name,
    (mr && sevaNameMr) || booking.sevaName,
    mr ? whenTextMr(booking, halls) : whenText(booking, halls),
    booking.receiptNo,
    receiptUrl(booking),
  ];
  return {
    language: { code: mr ? 'mr' : 'en' },
    components: [
      ...(withImage ? [{ type: 'header', parameters: [{ type: 'image', image: { link: slipImageUrl(booking) } }] }] : []),
      { type: 'body', parameters: values.map((text) => ({ type: 'text', text: String(text) })) },
    ],
  };
}

/**
 * WhatsApp receipt via the Meta Cloud API (Settings → WhatsApp). Needs an approved template
 * (Utility) under one name in English and / or Marathi, with — when it has the picture —
 * Header: Image (the slip), and the body:
 *   en "Namaste {{1}}, your {{2}} at Shri Mangal Grah Mandir, Amalner is booked for {{3}}.
 *       Receipt {{4}}: {{5}} Please show this at the hall."
 *   mr "नमस्कार {{1}}, श्री मंगळग्रह मंदिर, अमळनेर येथे आपली {{2}} सेवा नोंदवली आहे — {{3}}.
 *       पावती {{4}}: {{5}} कृपया हे सभागृहात दाखवा."
 */
async function sendWhatsApp(booking, cfg, template, message) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${cfg.phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to: `91${booking.devotee.phone}`,
      type: 'template',
      template: { name: template, ...message },
    },
    { headers: { Authorization: `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' }, timeout: 15000 },
  );
}

// SMS via an MSG91 Flow with a DLT-approved template using ##name##, ##seva##, ##when##, ##receipt##, ##link##.
async function sendSms(booking, cfg, templateId, halls) {
  await axios.post(
    'https://api.msg91.com/api/v5/flow/',
    {
      template_id: templateId, short_url: '1', mobiles: `91${booking.devotee.phone}`,
      name: booking.devotee.name, seva: booking.sevaName, when: whenText(booking, halls),
      receipt: booking.receiptNo, link: receiptUrl(booking),
    },
    { headers: { authkey: cfg.authKey, 'Content-Type': 'application/json' }, timeout: 15000 },
  );
}

/**
 * Sends the receipt to the devotee's phone. `force` resends even if automatic sending is off.
 * Returns { whatsapp, sms } with 'sent' | 'off' | 'failed'. Never throws.
 */
export async function sendReceipt(booking, { force = false } = {}) {
  const result = { whatsapp: 'off', sms: 'off' };
  try {
    const [settings, bs, halls] = await Promise.all([Settings.getOrCreate(), BookingSettings.getOrCreate(), hallNames()]);
    const wa = {
      phoneNumberId: settings.waPhoneNumberId || process.env.WA_PHONE_NUMBER_ID,
      accessToken: settings.waAccessToken || process.env.WA_ACCESS_TOKEN,
    };
    if (settings.waEnabled && wa.phoneNumberId && wa.accessToken && (force || bs.whatsappAuto) && bs.whatsappTemplate) {
      try {
        const lang = receiptLanguage(booking, bs);
        const sevaNameMr = lang === 'mr' ? (await SevaType.findById(booking.sevaType).select('nameMr').lean())?.nameMr : '';
        await sendWhatsApp(booking, wa, bs.whatsappTemplate,
          whatsappReceipt(booking, { halls, lang, sevaNameMr, withImage: bs.whatsappImage !== false }));
        result.whatsapp = 'sent';
        await Booking.updateOne({ _id: booking._id }, { $set: { whatsappSentAt: new Date() } });
      } catch (err) {
        result.whatsapp = 'failed';
        logger.error('Booking WhatsApp failed', { receipt: booking.receiptNo, error: err.response?.data?.error?.message || err.message });
      }
    }
    const sms = { authKey: settings.msg91AuthKey || process.env.MSG91_AUTH_KEY };
    if (settings.smsEnabled && sms.authKey && (force || bs.smsAuto) && bs.smsTemplateId) {
      try {
        await sendSms(booking, sms, bs.smsTemplateId, halls);
        result.sms = 'sent';
        await Booking.updateOne({ _id: booking._id }, { $set: { smsSentAt: new Date() } });
      } catch (err) {
        result.sms = 'failed';
        logger.error('Booking SMS failed', { receipt: booking.receiptNo, error: err.response?.data?.message || err.message });
      }
    }
  } catch (err) {
    logger.error('Booking receipt sending failed', { receipt: booking.receiptNo, error: err.message });
  }
  return result;
}
