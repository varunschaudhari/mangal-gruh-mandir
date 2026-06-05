import axios from 'axios';
import Settings from '../models/Settings.js';

const WA_DONATION_TEMPLATE = process.env.WA_DONATION_TEMPLATE_NAME || 'donation_thankyou';

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Sends a WhatsApp thank-you message to the donor after a named donation.
 *
 * Template parameters (create this template in Meta Business Manager):
 *   Body: "Dear {{1}}, thank you for your generous donation of ₹{{2}} to {{3}}
 *          on {{4}}. Receipt: {{5}}. 🙏 Jai Jai Mangal Grah Mandir!"
 *
 *   {{1}} = Donor name
 *   {{2}} = Total amount
 *   {{3}} = Occasion (or "General Donation")
 *   {{4}} = Date
 *   {{5}} = Receipt number
 */
export async function sendDonationThankYou(donation) {
  try {
    const settings = await Settings.getOrCreate();
    const phoneNumberId = settings.waPhoneNumberId || process.env.WA_PHONE_NUMBER_ID;
    const accessToken   = settings.waAccessToken   || process.env.WA_ACCESS_TOKEN;

    if (!settings.waEnabled || !phoneNumberId || !accessToken) {
      console.log('[DonationWA] WhatsApp not configured — skipping thank-you');
      return;
    }

    const phone = donation.donor?.phone || donation.donorPhone;
    if (!phone) {
      console.log('[DonationWA] No phone number for donor — skipping');
      return;
    }

    const donorName  = donation.donor?.name || donation.donorName || 'Devotee';
    const totalAmt   = (donation.totalEstimatedValue || 0).toLocaleString('en-IN');
    const occasion   = donation.occasion?.name || 'General Donation';
    const date       = fmtDate(donation.date || new Date());
    const receiptNo  = donation.donationNumber || '';

    await axios.post(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: WA_DONATION_TEMPLATE,
          language: { code: 'en' },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: donorName },
              { type: 'text', text: `₹${totalAmt}` },
              { type: 'text', text: occasion },
              { type: 'text', text: date },
              { type: 'text', text: receiptNo },
            ],
          }],
        },
      },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );

    console.log(`[DonationWA] Thank-you sent to ${donorName} (${phone}) — ${receiptNo}`);
  } catch (err) {
    // Never block donation creation — just log the error
    const metaErr = err.response?.data?.error;
    console.error('[DonationWA] Failed to send thank-you:', metaErr?.message || err.message);
  }
}
