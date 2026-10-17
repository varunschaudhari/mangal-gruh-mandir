import mongoose from 'mongoose';

// A Mahaprasad purchase on the public page (/prasad), paid through Razorpay. Coupons are made only
// once the payment is confirmed — by the devotee's browser (signed answer), Razorpay's webhook, or
// the server's own check, whichever comes first (services/mahaprasadOnline.service.js).
//   pending   waiting for payment; its plates are held on the daily limit until expiresAt
//   issuing   a confirmation is making the coupons right now (one at a time)
//   paid      coupons issued: batchId / shareToken point to the sale
//   expired   not paid in time, plates given back; a payment that still arrives issues (or is refunded)
//   refunded  paid, but no coupon could be given (day full or already over) — money sent back
//   failed    Razorpay would not create the order
const mahaprasadOrderSchema = new mongoose.Schema({
  token:           { type: String, required: true, unique: true },   // the devotee's handle on the order (in the page URL)
  razorpayOrderId: { type: String, unique: true, sparse: true },
  date:            { type: Date,   required: true, index: true },    // the Mahaprasad day (noon, like coupons)
  plates:          { type: Number, required: true, min: 1 },
  pricePerPlate:   { type: Number, required: true, min: 0 },
  amount:          { type: Number, required: true, min: 0 },         // ₹, plates × price
  mobile:          { type: String, required: true },
  name:            { type: String, default: '' },
  status:          { type: String, enum: ['pending', 'issuing', 'paid', 'expired', 'refunded', 'failed'], default: 'pending', index: true },
  personsHeld:     { type: Boolean, default: false },                // counted on the daily limit right now
  expiresAt:       { type: Date,   required: true },
  issuingSince:    { type: Date },
  checkedAt:       { type: Date },                                   // last time the page had Razorpay asked (at most every few seconds)
  // From Razorpay once paid
  paymentId:       { type: String, index: true, sparse: true },
  method:          { type: String, default: '' },                    // upi / card / netbanking / wallet
  paidAt:          { type: Date },
  // The sale it became (set when issuing starts, so a half-finished one can be found)
  batchId:         { type: String },
  shareToken:      { type: String },
  // When the money went back
  refundId:        { type: String },
  refundedAt:      { type: Date },
  refundReason:    { type: String },
  ip:              { type: String },
}, { timestamps: true });

mahaprasadOrderSchema.index({ status: 1, expiresAt: 1 });
mahaprasadOrderSchema.index({ mobile: 1, createdAt: -1 });
mahaprasadOrderSchema.index({ createdAt: -1 });

export default mongoose.model('MahaprasadOrder', mahaprasadOrderSchema);
