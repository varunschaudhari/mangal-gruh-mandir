import mongoose from 'mongoose';

export const BORROW_GROUP_STATUSES = ['approved', 'checked_out', 'partially_returned', 'returned', 'overdue', 'cancelled'];
export const ID_PROOF_TYPES = ['aadhar', 'pan', 'driving_license', 'voter_id', 'passport'];

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

const borrowGroupSchema = new mongoose.Schema(
  {
    groupNumber:        { type: String, unique: true, sparse: true },
    borrowerType:       { type: String, enum: ['staff', 'external'], default: 'staff' },
    borrower:           { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    externalBorrower:   { type: externalBorrowerSchema },
    approvedBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    approvedAt:         { type: Date, default: Date.now },
    expectedReturnDate: { type: Date, required: true },
    status:             { type: String, enum: BORROW_GROUP_STATUSES, default: 'approved', index: true },
    extensions:         { type: [extensionSchema], default: [] },
    remindersSent:      [{ reminderType: String, sentAt: Date }],
    cancellationReason: { type: String },
    notes:              { type: String },
    createdBy:          { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

borrowGroupSchema.index({ borrower: 1, status: 1 });
borrowGroupSchema.index({ 'externalBorrower.phone': 1 });
borrowGroupSchema.index({ expectedReturnDate: 1, status: 1 });

export default mongoose.model('BorrowGroup', borrowGroupSchema);
