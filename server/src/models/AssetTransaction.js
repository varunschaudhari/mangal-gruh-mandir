import mongoose from 'mongoose';

export const ASSET_TX_STATUSES = ['approved', 'checked_out', 'returned', 'overdue', 'cancelled', 'lost'];
export const ASSET_CONDITIONS  = ['good', 'fair', 'damaged'];
export const ID_PROOF_TYPES    = ['aadhar', 'pan', 'driving_license', 'voter_id', 'passport'];

const externalBorrowerSchema = new mongoose.Schema({
  name:          { type: String, required: true },
  phone:         { type: String, required: true },
  address:       { type: String },
  idProofType:   { type: String, enum: ID_PROOF_TYPES },
  idProofNumber: { type: String },
}, { _id: false });

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
    borrowerType:       { type: String, enum: ['staff', 'external'], default: 'staff' },
    borrower:           { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    externalBorrower:   { type: externalBorrowerSchema },
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

    lostAt:       { type: Date },
    lostReason:   { type: String },
    finePaid:     { type: Boolean, default: false },
    finePaidAt:   { type: Date },
    damageStatus: { type: String, enum: ['none', 'reported', 'assessed', 'repaired'], default: 'none' },

    extensions:    { type: [extensionSchema], default: [] },
    remindersSent: [{ reminderType: String, sentAt: Date }],

    group:     { type: mongoose.Schema.Types.ObjectId, ref: 'BorrowGroup' },

    notes:     { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

assetTransactionSchema.index({ asset: 1, status: 1 });
assetTransactionSchema.index({ borrower: 1, status: 1 });
assetTransactionSchema.index({ expectedReturnDate: 1, status: 1 });
assetTransactionSchema.index({ 'externalBorrower.phone': 1 });

export default mongoose.model('AssetTransaction', assetTransactionSchema);
