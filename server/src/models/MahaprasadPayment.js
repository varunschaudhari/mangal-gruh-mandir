import mongoose from 'mongoose';

const mahaprasadPaymentSchema = new mongoose.Schema({
  batchId:        { type: String, required: true, unique: true, index: true },
  date:           { type: Date,   required: true, index: true },
  couponNumbers:  [{ type: String }],
  qty:            { type: Number, required: true, min: 1 },
  mobile:         { type: String, default: '' },   // devotee's mobile number
  totalDue:       { type: Number, required: true, min: 0 },
  // online = paid on the public page through Razorpay (no counter, no staff)
  paymentMode:    { type: String, enum: ['cash', 'upi', 'online'], required: true, default: 'cash' },
  razorpayPaymentId: { type: String },
  razorpayOrderId:   { type: String },
  testMode:          { type: Boolean },   // Razorpay test mode: no real money came in
  amountReceived: { type: Number, default: 0, min: 0 },
  changeReturned: { type: Number, default: 0, min: 0 },
  issuedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  issuedAt:       { type: Date, default: Date.now },
  receivedNotes:   { type: [Number], default: () => [] }, // array of note denominations received
  changeBreakdown: { type: Object, default: () => ({}) },
  voided:          { type: Boolean, default: false },
  voidedAt:        { type: Date },
  voidedBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  voidReason:      { type: String },
  offline:         { type: Boolean, default: false }, // sold on a counter that was offline (no notes counted)
}, { timestamps: true });

mahaprasadPaymentSchema.index({ date: 1, paymentMode: 1 });

export default mongoose.model('MahaprasadPayment', mahaprasadPaymentSchema);
