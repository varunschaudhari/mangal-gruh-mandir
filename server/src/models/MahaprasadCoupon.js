import mongoose from 'mongoose';

const mahaprasadCouponSchema = new mongoose.Schema({
  couponNumber: { type: String, required: true, unique: true, index: true },
  date:         { type: Date,   required: true, index: true },
  type:         { type: String, enum: ['paid', 'free'], required: true },
  amount:       { type: Number, default: 0, min: 0 },
  occasion:     { type: String, default: '' },
  status:       { type: String, enum: ['issued', 'redeemed', 'reserved'], default: 'issued', index: true },
  issuedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  issuedAt:     { type: Date, default: Date.now },
  redeemedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  redeemedAt:   { type: Date },
  batchId:      { type: String, index: true },
  groupSize:    { type: Number, default: 1, min: 1 },
  isGroup:      { type: Boolean, default: false },
}, { timestamps: true });

mahaprasadCouponSchema.index({ date: 1, status: 1 });
mahaprasadCouponSchema.index({ date: 1, type: 1 });

export default mongoose.model('MahaprasadCoupon', mahaprasadCouponSchema);
