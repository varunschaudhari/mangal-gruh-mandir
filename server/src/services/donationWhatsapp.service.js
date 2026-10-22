import { inLanguage, sendTemplate, whatsappConfig } from './whatsappClient.service.js';
import { localeOf } from '../../../shared/devoteeLanguage.js';

const fmtDate = (d, lang) => (lang === 'en'
  ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : new Date(d).toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'long', year: 'numeric' }));

/**
 * Sends a WhatsApp thank-you message to the donor after a named donation. Never throws — a
 * donation is saved whether or not the message goes out.
 *
 * Template (named in Settings → WhatsApp, which also shows the wording to submit to Meta), in
 * English, Marathi and / or Hindi under the one name; Settings chooses which goes first:
 *   {{1}} donor name  {{2}} amount (the template has the ₹)  {{3}} occasion  {{4}} date  {{5}} receipt no.
 */
export async function sendDonationThankYou(donation) {
  const phone = donation.donor?.phone || donation.donorPhone;
  if (!phone) return 'off';
  const cfg = await whatsappConfig();
  const name = donation.donor?.name || donation.donorName;
  const amount = (donation.totalEstimatedValue || 0).toLocaleString('en-IN');
  const date = donation.date || new Date();
  const occasion = donation.occasion?.name;
  const receipt = donation.donationNumber || '';
  return sendTemplate(cfg, {
    to: phone, template: cfg.templates.donationThanks, label: 'Donation thank-you',
    ...inLanguage(cfg, 'donationThanks', {
      en: [name || 'Devotee', amount, occasion || 'General Donation', fmtDate(date, 'en'), receipt],
      mr: [name || 'भाविक', amount, occasion || 'सर्वसाधारण देणगी', fmtDate(date, 'mr'), receipt],
      hi: [name || 'भक्त', amount, occasion || 'सामान्य दान', fmtDate(date, 'hi'), receipt],
    }),
  });
}
