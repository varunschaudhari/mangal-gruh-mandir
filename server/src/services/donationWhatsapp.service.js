import { sendTemplate, whatsappConfig } from './whatsappClient.service.js';

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Sends a WhatsApp thank-you message to the donor after a named donation. Never throws — a
 * donation is saved whether or not the message goes out.
 *
 * Template (named in Settings → WhatsApp, which also shows the wording to submit to Meta):
 *   {{1}} donor name  {{2}} amount (the template has the ₹)  {{3}} occasion  {{4}} date  {{5}} receipt no.
 */
export async function sendDonationThankYou(donation) {
  const phone = donation.donor?.phone || donation.donorPhone;
  if (!phone) return 'off';
  const cfg = await whatsappConfig();
  return sendTemplate(cfg, {
    to: phone, template: cfg.templates.donationThanks, label: 'Donation thank-you',
    body: [
      donation.donor?.name || donation.donorName || 'Devotee',
      (donation.totalEstimatedValue || 0).toLocaleString('en-IN'),
      donation.occasion?.name || 'General Donation',
      fmtDate(donation.date || new Date()),
      donation.donationNumber || '',
    ],
  });
}
