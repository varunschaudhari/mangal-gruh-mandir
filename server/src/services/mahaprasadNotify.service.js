import axios from 'axios';
import Settings from '../models/Settings.js';
import { logger } from '../utils/logger.js';

// Sends the Mahaprasad coupon numbers to the devotee's mobile after an issue at the counter.
// Automatic only once an approved message is set up (otherwise the counter's "Send on WhatsApp"
// button opens WhatsApp with the message ready):
//   WhatsApp — Settings → WhatsApp turned on, and WA_MAHAPRASAD_TEMPLATE = the name of a
//              Meta-approved template with the body
//              "Namaste! Your Mahaprasad coupon(s) at Shri Mangal Grah Mandir, Amalner for {{1}}:
//               {{2}} ({{3}}). Please show this at the Mahaprasad hall."
//   SMS      — Settings → SMS turned on, and MSG91_MAHAPRASAD_TEMPLATE_ID = an MSG91 Flow with a
//              DLT-approved template using ##date##, ##coupons##, ##persons##.

/**
 * The coupon numbers in a short form: one number as it is; a run from the same day as
 * "MP-20261013-001 to 010 (10)"; otherwise the first few and "+n more".
 */
export function couponListText(numbers = []) {
  if (!numbers.length) return '';
  if (numbers.length === 1) return numbers[0];
  const parts = numbers.map((n) => /^(.*-)(\d+)$/.exec(n));
  const samePrefix = parts.every((p) => p && p[1] === parts[0][1]);
  const consecutive = samePrefix && parts.every((p, i) => i === 0 || Number(p[2]) === Number(parts[i - 1][2]) + 1);
  if (consecutive) return `${numbers[0]} to ${parts.at(-1)[2]} (${numbers.length})`;
  const shown = numbers.slice(0, 6).join(', ');
  return numbers.length > 6 ? `${shown} +${numbers.length - 6} more` : shown;
}

const dateText = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const personsText = (n) => (n === 1 ? '1 person' : `${n} persons`);

/** Returns { whatsapp, sms } with 'sent' | 'off' | 'failed'. Never throws. */
export async function sendCouponMessage({ mobile, numbers, date, persons }) {
  const result = { whatsapp: 'off', sms: 'off' };
  if (!mobile || !numbers?.length) return result;
  const coupons = couponListText(numbers);
  const when = dateText(date);
  const people = personsText(persons || numbers.length);
  try {
    const settings = await Settings.getOrCreate();

    const waTemplate = process.env.WA_MAHAPRASAD_TEMPLATE;
    const wa = { phoneNumberId: settings.waPhoneNumberId || process.env.WA_PHONE_NUMBER_ID, accessToken: settings.waAccessToken || process.env.WA_ACCESS_TOKEN };
    if (settings.waEnabled && waTemplate && wa.phoneNumberId && wa.accessToken) {
      try {
        await axios.post(`https://graph.facebook.com/v19.0/${wa.phoneNumberId}/messages`, {
          messaging_product: 'whatsapp',
          to: `91${mobile}`,
          type: 'template',
          template: {
            name: waTemplate,
            language: { code: 'en' },
            components: [{ type: 'body', parameters: [when, coupons, people].map((text) => ({ type: 'text', text })) }],
          },
        }, { headers: { Authorization: `Bearer ${wa.accessToken}`, 'Content-Type': 'application/json' }, timeout: 15000 });
        result.whatsapp = 'sent';
      } catch (err) {
        result.whatsapp = 'failed';
        logger.error('Mahaprasad WhatsApp failed', { coupons, error: err.response?.data?.error?.message || err.message });
      }
    }

    const smsTemplate = process.env.MSG91_MAHAPRASAD_TEMPLATE_ID;
    const authKey = settings.msg91AuthKey || process.env.MSG91_AUTH_KEY;
    if (settings.smsEnabled && smsTemplate && authKey) {
      try {
        await axios.post('https://api.msg91.com/api/v5/flow/', {
          template_id: smsTemplate, mobiles: `91${mobile}`, date: when, coupons, persons: people,
        }, { headers: { authkey: authKey, 'Content-Type': 'application/json' }, timeout: 15000 });
        result.sms = 'sent';
      } catch (err) {
        result.sms = 'failed';
        logger.error('Mahaprasad SMS failed', { coupons, error: err.response?.data?.message || err.message });
      }
    }
  } catch (err) {
    logger.error('Mahaprasad coupon message failed', { coupons, error: err.message });
  }
  return result;
}
