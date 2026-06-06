import axios from 'axios';
import User from '../models/User.js';
import Settings from '../models/Settings.js';

const WA_PAYMENT_SUBMITTED_TEMPLATE = process.env.WA_PAYMENT_SUBMITTED_TEMPLATE || 'payment_approval_request';
const WA_PAYMENT_STATUS_TEMPLATE    = process.env.WA_PAYMENT_STATUS_TEMPLATE    || 'payment_status_update';

function fmtCurrency(n) {
  return new Intl.NumberFormat('en-IN').format(n);
}

async function getWaConfig() {
  const s = await Settings.getOrCreate();
  return {
    phoneNumberId: s.waPhoneNumberId || process.env.WA_PHONE_NUMBER_ID,
    accessToken:   s.waAccessToken   || process.env.WA_ACCESS_TOKEN,
    enabled:       s.waEnabled,
  };
}

async function sendWhatsApp(phone, templateName, params, cfg) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${cfg.phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en' },
        components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
      },
    },
    { headers: { Authorization: `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' } }
  );
}

/**
 * Notify all approvers when a new payment is submitted.
 *
 * WhatsApp template "payment_approval_request":
 *   Body: "New payment {{1}} for {{2}} of ₹{{3}} submitted by {{4}} is pending your approval."
 *   {{1}} paymentNumber  {{2}} supplierName  {{3}} amount  {{4}} submitterName
 */
export async function notifyPaymentSubmitted({ payment, supplierName, submitterName }) {
  try {
    const cfg = await getWaConfig();
    if (!cfg.enabled || !cfg.phoneNumberId || !cfg.accessToken) return;

    const approvers = await User.find({
      canApprovePayments: true,
      phone: { $exists: true, $ne: '' },
      isActive: true,
    }).select('phone name').lean();

    if (!approvers.length) return;

    const params = [
      payment.paymentNumber,
      supplierName || 'Supplier',
      fmtCurrency(payment.totalAmount),
      submitterName,
    ];

    const results = await Promise.allSettled(
      approvers.map((u) => sendWhatsApp(u.phone, WA_PAYMENT_SUBMITTED_TEMPLATE, params, cfg))
    );
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.error(`[PaymentWA] Submit notify failed → ${approvers[i]?.name}:`, r.reason?.message);
      else console.log(`[PaymentWA] Submit notify sent → ${approvers[i]?.name}`);
    });
  } catch (err) {
    console.error('[PaymentWA] notifyPaymentSubmitted error:', err.message);
  }
}

/**
 * Notify the submitter when a payment is approved or rejected.
 *
 * WhatsApp template "payment_status_update":
 *   Body: "Payment {{1}} of ₹{{2}} has been {{3}} by {{4}}."
 *   {{1}} paymentNumber  {{2}} amount  {{3}} APPROVED/REJECTED  {{4}} approverName
 */
export async function notifyPaymentStatusChange({ payment, approverName }) {
  try {
    const cfg = await getWaConfig();
    if (!cfg.enabled || !cfg.phoneNumberId || !cfg.accessToken) return;

    const submitter = await User.findById(payment.createdBy).select('phone name').lean();
    if (!submitter?.phone) return;

    const statusLabel = payment.status === 'approved' ? 'APPROVED' : 'REJECTED';
    const params = [
      payment.paymentNumber,
      fmtCurrency(payment.totalAmount),
      statusLabel,
      approverName,
    ];

    await sendWhatsApp(submitter.phone, WA_PAYMENT_STATUS_TEMPLATE, params, cfg);
    console.log(`[PaymentWA] Status notify sent → ${submitter.name} (${statusLabel})`);
  } catch (err) {
    console.error('[PaymentWA] notifyPaymentStatusChange error:', err.message);
  }
}
