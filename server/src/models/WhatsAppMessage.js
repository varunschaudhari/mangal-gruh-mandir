import mongoose from 'mongoose';

// One WhatsApp message to a devotee — a Mahaprasad sale's coupons or a booking's receipt — and how
// far it got: sent (Meta took it) → delivered (on the phone) → read, or failed. Meta reports the
// later steps to /api/webhooks/whatsapp (services/whatsappStatus.service.js). Each resend is a new one.
export const MESSAGE_STATUSES = ['sent', 'delivered', 'read', 'failed'];

const whatsAppMessageSchema = new mongoose.Schema(
  {
    waId:     { type: String },                                   // Meta's message id (wamid…); none when it failed at once
    kind:     { type: String, enum: ['mahaprasad', 'booking'], required: true },
    ref:      { type: String, required: true },                   // the sale's batchId, or the booking's _id
    to:       { type: String, default: '' },                      // last 4 digits only
    template: { type: String, default: '' },
    language: { type: String, default: '' },
    status:   { type: String, enum: MESSAGE_STATUSES, default: 'sent' },
    error:    { type: String, default: '' },                      // why it failed, in words
    sentAt: Date, deliveredAt: Date, readAt: Date, failedAt: Date,
  },
  { timestamps: true },
);

whatsAppMessageSchema.index({ waId: 1 }, { unique: true, partialFilterExpression: { waId: { $type: 'string' } } });
whatsAppMessageSchema.index({ kind: 1, ref: 1, createdAt: -1 });

export default mongoose.model('WhatsAppMessage', whatsAppMessageSchema);
