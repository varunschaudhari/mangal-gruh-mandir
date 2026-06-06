import mongoose from 'mongoose';

const paymentTemplateSchema = new mongoose.Schema({
  name:                  { type: String, required: true, trim: true },
  supplier:              { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
  paymentMode:           { type: String, enum: ['cash', 'upi', 'neft', 'rtgs', 'cheque'], default: 'cash' },
  bankName:              { type: String },
  selectedBankAccountId: { type: mongoose.Schema.Types.ObjectId },
  notes:                 { type: String },
  usageCount:            { type: Number, default: 0 },
  lastUsedAt:            { type: Date },
  isActive:              { type: Boolean, default: true },
  createdBy:             { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

export default mongoose.model('PaymentTemplate', paymentTemplateSchema);
