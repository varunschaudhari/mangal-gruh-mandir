import mongoose from 'mongoose';
const { Schema } = mongoose;

const purchaseItemSchema = new Schema({
  product:            { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity:           { type: Number, required: true, min: 0.001 },
  unit:               { type: Schema.Types.ObjectId, ref: 'Unit' },
  rate:               { type: Number, default: 0, min: 0 },
  totalValue:         { type: Number, default: 0 },
  expiryDate:         Date,
  manufacturingDate:  Date,
  batchRef:           String,
  stockTransactionId: { type: Schema.Types.ObjectId, ref: 'StockTransaction' },
}, { _id: true });

const purchaseEntrySchema = new Schema({
  entryNumber:   { type: String, unique: true, sparse: true, index: true },
  supplier:      { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
  invoiceNumber: { type: String, trim: true },
  invoiceDate:   Date,
  dueDate:       { type: Date, index: true },
  receivedDate:  { type: Date, default: Date.now },
  toDepartment:  { type: Schema.Types.ObjectId, ref: 'Department', required: true },
  items:         { type: [purchaseItemSchema], default: [] },
  totalValue:    { type: Number, default: 0 },
  notes:         String,
  isVoided:      { type: Boolean, default: false, index: true },
  voidReason:    String,
  voidedBy:      { type: Schema.Types.ObjectId, ref: 'User' },
  voidedAt:      Date,
  createdBy:     { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

purchaseEntrySchema.index({ supplier: 1, isVoided: 1 });
purchaseEntrySchema.index({ invoiceNumber: 1, supplier: 1 });

export default mongoose.model('PurchaseEntry', purchaseEntrySchema);
