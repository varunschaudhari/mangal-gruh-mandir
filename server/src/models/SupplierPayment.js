import mongoose from 'mongoose';

const PAYMENT_MODES    = ['cash', 'upi', 'neft', 'rtgs', 'cheque'];
const PAYMENT_STATUSES = ['pending_approval', 'approved', 'rejected', 'voided'];

const invoiceAllocationSchema = new mongoose.Schema({
  purchaseEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseEntry' },
  invoiceNumber:   { type: String },
  invoiceDate:     { type: Date },
  invoiceTotal:    { type: Number, required: true, min: 0 },
  paidAmount:      { type: Number, required: true, min: 0 },
}, { _id: false });

const supplierPaymentSchema = new mongoose.Schema({
  paymentNumber:   { type: String, unique: true, sparse: true },
  supplier:        { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
  invoices:        { type: [invoiceAllocationSchema], default: [] },
  totalAmount:     { type: Number, required: true, min: 0 },
  paymentDate:     { type: Date, required: true, default: Date.now, index: true },
  paymentMode:          { type: String, enum: PAYMENT_MODES, default: 'cash' },
  referenceNumber:      { type: String },
  bankName:             { type: String },
  selectedBankAccountId: { type: mongoose.Schema.Types.ObjectId },
  status:          { type: String, enum: PAYMENT_STATUSES, default: 'pending_approval', index: true },
  approvedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt:      { type: Date },
  approvalNote:    { type: String },
  rejectionReason: { type: String },
  rejectedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectedAt:      { type: Date },
  voidedBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  voidedAt:        { type: Date },
  voidReason:      { type: String },
  advanceApplied:  { type: Number, default: 0, min: 0 },
  notes:           { type: String },
  createdBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

supplierPaymentSchema.index({ status: 1, paymentDate: -1 });

export const PAYMENT_MODES_LIST = PAYMENT_MODES;
export default mongoose.model('SupplierPayment', supplierPaymentSchema);
