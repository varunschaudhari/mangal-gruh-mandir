import User from '../models/User.js';
import { sendTemplate, sendTemplateToAll, whatsappConfig, whatsappReady } from './whatsappClient.service.js';

function fmtCurrency(n) {
  return new Intl.NumberFormat('en-IN').format(n);
}

/**
 * Notify all approvers when a new payment is submitted.
 *
 * WhatsApp template (named in Settings → WhatsApp, which also shows the wording to submit to Meta):
 *   {{1}} paymentNumber  {{2}} supplierName  {{3}} amount  {{4}} submitterName
 */
export async function notifyPaymentSubmitted({ payment, supplierName, submitterName }) {
  try {
    const cfg = await whatsappConfig();
    if (!whatsappReady(cfg) || !cfg.templates.paymentApproval) return;

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

    await sendTemplateToAll(cfg, approvers, { template: cfg.templates.paymentApproval, body: params, label: 'Payment approval' });
  } catch (err) {
    console.error('[PaymentWA] notifyPaymentSubmitted error:', err.message);
  }
}

/**
 * Notify the submitter when a payment is approved or rejected.
 *
 * WhatsApp template (named in Settings → WhatsApp, which also shows the wording to submit to Meta):
 *   {{1}} paymentNumber  {{2}} amount  {{3}} APPROVED/REJECTED  {{4}} approverName
 */
export async function notifyPaymentStatusChange({ payment, approverName }) {
  try {
    const cfg = await whatsappConfig();
    if (!whatsappReady(cfg) || !cfg.templates.paymentStatus) return;

    const submitter = await User.findById(payment.createdBy).select('phone name').lean();
    if (!submitter?.phone) return;

    const statusLabel = payment.status === 'approved' ? 'APPROVED' : 'REJECTED';
    const params = [
      payment.paymentNumber,
      fmtCurrency(payment.totalAmount),
      statusLabel,
      approverName,
    ];

    await sendTemplate(cfg, { to: submitter.phone, template: cfg.templates.paymentStatus, body: params, label: `Payment ${statusLabel.toLowerCase()} → ${submitter.name}` });
  } catch (err) {
    console.error('[PaymentWA] notifyPaymentStatusChange error:', err.message);
  }
}
