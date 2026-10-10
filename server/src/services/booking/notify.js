import axios from 'axios';
import Booking from '../../models/Booking.js';
import BookingSettings from '../../models/BookingSettings.js';
import Settings from '../../models/Settings.js';
import { logger } from '../../utils/logger.js';

// Public web address of the app, for receipt links sent to devotees.
const appUrl = () => (process.env.PUBLIC_APP_URL || (process.env.CLIENT_URL || 'https://mandir.aumora.io').split(',')[0]).trim().replace(/\/$/, '');

export const receiptUrl = (booking) => `${appUrl()}/r/${booking.receiptToken}`;

const whenText = (b) => {
  if (!b.dateKey) return 'on your behalf';
  const date = new Date(b.performDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return [date, b.batchLabel, b.hall && `Hall ${b.hall}`].filter(Boolean).join(', ');
};

/**
 * WhatsApp receipt via the Meta Cloud API (Settings → WhatsApp). Needs an approved template:
 *   "Namaste {{1}}, your {{2}} at Shri Mangal Grah Mandir, Amalner is booked for {{3}}.
 *    Receipt {{4}}: {{5}}"
 */
async function sendWhatsApp(booking, cfg, template) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${cfg.phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to: `91${booking.devotee.phone}`,
      type: 'template',
      template: {
        name: template,
        language: { code: 'en' },
        components: [{
          type: 'body',
          parameters: [booking.devotee.name, booking.sevaName, whenText(booking), booking.receiptNo, receiptUrl(booking)]
            .map((text) => ({ type: 'text', text: String(text) })),
        }],
      },
    },
    { headers: { Authorization: `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' }, timeout: 15000 },
  );
}

// SMS via an MSG91 Flow with a DLT-approved template using ##name##, ##seva##, ##when##, ##receipt##, ##link##.
async function sendSms(booking, cfg, templateId) {
  await axios.post(
    'https://api.msg91.com/api/v5/flow/',
    {
      template_id: templateId, short_url: '1', mobiles: `91${booking.devotee.phone}`,
      name: booking.devotee.name, seva: booking.sevaName, when: whenText(booking),
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
    const [settings, bs] = await Promise.all([Settings.getOrCreate(), BookingSettings.getOrCreate()]);
    const wa = {
      phoneNumberId: settings.waPhoneNumberId || process.env.WA_PHONE_NUMBER_ID,
      accessToken: settings.waAccessToken || process.env.WA_ACCESS_TOKEN,
    };
    if (settings.waEnabled && wa.phoneNumberId && wa.accessToken && (force || bs.whatsappAuto) && bs.whatsappTemplate) {
      try {
        await sendWhatsApp(booking, wa, bs.whatsappTemplate);
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
        await sendSms(booking, sms, bs.smsTemplateId);
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
