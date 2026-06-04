import mongoose from 'mongoose';

export const BORROW_GROUP_STATUSES = ['approved', 'checked_out', 'partially_returned', 'returned', 'overdue', 'cancelled'];

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
    borrower:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
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
borrowGroupSchema.index({ expectedReturnDate: 1, status: 1 });

export default mongoose.model('BorrowGroup', borrowGroupSchema);
