import axios from 'axios';
import Settings from '../models/Settings.js';
import { logger } from '../utils/logger.js';
import { bilingual, sendTemplate, whatsappConfig } from './whatsappClient.service.js';

// Sends the Mahaprasad coupon numbers, and the link to their QR page (/m/<token>), to the devotee's
// mobile after an issue at the counter. Automatic only once an approved message is set up
// (otherwise the counter's "Send on WhatsApp" button opens WhatsApp with the message ready):
//   WhatsApp — Settings → WhatsApp turned on, and the Mahaprasad template named there: a
//              Meta-approved Utility template, in English and / or Marathi under the one name
//              (Settings → WhatsApp shows both wordings and which language goes first), English body
//              "Namaste! Your Mahaprasad coupon(s) at Shri Mangal Grah Mandir, Amalner for {{1}}:
//               {{2}} ({{3}}). Your coupon QR: {{4}} Please show it at the Mahaprasad hall."
//              ({{1}} date, {{2}} coupon numbers, {{3}} persons, {{4}} link — DEPLOY.md §13)
//   SMS      — Settings → SMS turned on, and MSG91_MAHAPRASAD_TEMPLATE_ID = an MSG91 Flow with a
//              DLT-approved template using ##date##, ##coupons##, ##persons##, ##link##.

/**
 * The coupon numbers in a short form: one number as it is; a run from the same day as
 * "MP-20261013-001 to 010 (10)"; otherwise the first few and "+n more".
 */
export function couponListText(numbers = [], lang = 'en') {
  if (!numbers.length) return '';
  if (numbers.length === 1) return numbers[0];
  const mr = lang === 'mr';
  const parts = numbers.map((n) => /^(.*-)(\d+)$/.exec(n));
  const samePrefix = parts.every((p) => p && p[1] === parts[0][1]);
  const consecutive = samePrefix && parts.every((p, i) => i === 0 || Number(p[2]) === Number(parts[i - 1][2]) + 1);
  if (consecutive) return `${numbers[0]} ${mr ? 'ते' : 'to'} ${parts.at(-1)[2]} (${numbers.length})`;
  const shown = numbers.slice(0, 6).join(', ');
  return numbers.length > 6 ? `${shown} +${numbers.length - 6} ${mr ? 'आणखी' : 'more'}` : shown;
}

const dateText = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const personsText = (n) => (n === 1 ? '1 person' : `${n} persons`);
const dateTextMr = (d) => new Date(d).toLocaleDateString('mr-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Returns { whatsapp, sms } with 'sent' | 'off' | 'failed'. Never throws. */
export async function sendCouponMessage({ mobile, numbers, date, persons, link = '' }) {
  const result = { whatsapp: 'off', sms: 'off' };
  if (!mobile || !numbers?.length) return result;
  const coupons = couponListText(numbers);
  const when = dateText(date);
  const people = personsText(persons || numbers.length);
  try {
    const settings = await Settings.getOrCreate();

    const wa = await whatsappConfig();
    const count = persons || numbers.length;
    result.whatsapp = await sendTemplate(wa, {
      to: mobile, template: wa.templates.mahaprasadCoupons, label: 'Mahaprasad coupons',
      ...bilingual(wa, 'mahaprasadCoupons', {
        en: [when, coupons, people, link],
        mr: [dateTextMr(date), couponListText(numbers, 'mr'), `${count} व्यक्ती`, link],
      }),
    });

    const smsTemplate = process.env.MSG91_MAHAPRASAD_TEMPLATE_ID;
    const authKey = settings.msg91AuthKey || process.env.MSG91_AUTH_KEY;
    if (settings.smsEnabled && smsTemplate && authKey) {
      try {
        await axios.post('https://api.msg91.com/api/v5/flow/', {
          template_id: smsTemplate, mobiles: `91${mobile}`, date: when, coupons, persons: people, link,
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
