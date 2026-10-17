import mongoose from 'mongoose';

const mahaprasadCouponSchema = new mongoose.Schema({
  couponNumber: { type: String, required: true, unique: true, index: true },
  date:         { type: Date,   required: true, index: true },
  type:         { type: String, enum: ['paid', 'free'], required: true },
  amount:       { type: Number, default: 0, min: 0 },
  occasion:     { type: String, default: '' },
  mobile:       { type: String, default: '', index: true },  // devotee's mobile, one per issue (all coupons of the batch)
  status:       { type: String, enum: ['issued', 'redeemed', 'reserved', 'voided'], default: 'issued', index: true },
  // Sold at a counter, or bought by the devotee on the public page (MahaprasadOrder) — then no staff issued it
  channel:      { type: String, enum: ['counter', 'online'], default: 'counter' },
  issuedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required() { return this.channel !== 'online'; } },
  // Bought online while Razorpay was in test mode (no real money): never served at the hall
  testMode:     { type: Boolean },
  issuedAt:     { type: Date, default: Date.now },
  redeemedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  redeemedAt:   { type: Date },
  batchId:      { type: String, index: true },
  groupSize:    { type: Number, default: 1, min: 1 },
  isGroup:      { type: Boolean, default: false },
  // The devotee's link to this sale's coupon QRs (/m/<shareToken>, sent by WhatsApp / SMS).
  // Same for every coupon of the sale; whoever has the link can show the QR, like the paper coupon.
  shareToken:   { type: String, index: true, sparse: true },
  // Cancelled sales: who, when and why
  voidedAt:     { type: Date },
  voidedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  voidReason:   { type: String },
}, { timestamps: true });

mahaprasadCouponSchema.index({ date: 1, status: 1 });
mahaprasadCouponSchema.index({ date: 1, type: 1 });

export default mongoose.model('MahaprasadCoupon', mahaprasadCouponSchema);
