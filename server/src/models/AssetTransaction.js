import mongoose from 'mongoose';

export const ASSET_TX_STATUSES = ['approved', 'checked_out', 'returned', 'overdue', 'cancelled'];
export const ASSET_CONDITIONS  = ['good', 'fair', 'damaged'];

const extensionSchema = new mongoose.Schema({
  previousReturnDate: { type: Date, required: true },
  newReturnDate:      { type: Date, required: true },
  approvedBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvedAt:         { type: Date, default: Date.now },
  extendedBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes:              { type: String },
}, { _id: true });

const assetTransactionSchema = new mongoose.Schema(
  {
    transactionNumber:  { type: String, unique: true, sparse: true },

    asset:              { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
    borrower:           { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
    quantityBorrowed:   { type: Number, required: true, min: 1 },
    expectedReturnDate: { type: Date, required: true },
    actualReturnDate:   { type: Date },
    status:             { type: String, enum: ASSET_TX_STATUSES, default: 'approved', index: true },

    approvedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    approvedAt:   { type: Date, default: Date.now },
    checkedOutAt: { type: Date },

    conditionAtCheckout: { type: String, enum: ASSET_CONDITIONS },
    conditionAtReturn:   { type: String, enum: ASSET_CONDITIONS },
    damageNotes:         { type: String },

    fineAmount:       { type: Number, default: 0 },
    fineApplied:      { type: Boolean, default: false },
    fineWaived:       { type: Boolean, default: false },
    fineWaivedReason: { type: String },
    lateDays:         { type: Number, default: 0 },

    cancellationReason: { type: String },

    extensions:    { type: [extensionSchema], default: [] },
    remindersSent: [{ reminderType: String, sentAt: Date }],

    notes:     { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

assetTransactionSchema.index({ asset: 1, status: 1 });
assetTransactionSchema.index({ borrower: 1, status: 1 });
assetTransactionSchema.index({ expectedReturnDate: 1, status: 1 });

export default mongoose.model('AssetTransaction', assetTransactionSchema);
