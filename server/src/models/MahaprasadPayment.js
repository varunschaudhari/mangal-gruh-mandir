import mongoose from 'mongoose';

const mahaprasadPaymentSchema = new mongoose.Schema({
  batchId:        { type: String, required: true, unique: true, index: true },
  date:           { type: Date,   required: true, index: true },
  couponNumbers:  [{ type: String }],
  qty:            { type: Number, required: true, min: 1 },
  totalDue:       { type: Number, required: true, min: 0 },
  paymentMode:    { type: String, enum: ['cash', 'upi'], required: true, default: 'cash' },
  amountReceived: { type: Number, default: 0, min: 0 },
  changeReturned: { type: Number, default: 0, min: 0 },
  issuedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  issuedAt:       { type: Date, default: Date.now },
  receivedNote:    { type: Number, default: null },
  changeBreakdown: { type: Object, default: () => ({}) },
  voided:          { type: Boolean, default: false },
  voidedAt:        { type: Date },
  voidedBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

mahaprasadPaymentSchema.index({ date: 1, paymentMode: 1 });

export default mongoose.model('MahaprasadPayment', mahaprasadPaymentSchema);
