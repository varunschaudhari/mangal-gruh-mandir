import mongoose from 'mongoose';

// Management's decision for a double shift (day + same-night duty): one extra leave, an
// overtime amount, or nothing. Until decided the double shift shows as "waiting".
export const DOUBLE_DECISIONS = ['extra_leave', 'overtime', 'none'];

const doubleShiftSchema = new mongoose.Schema(
  {
    staff:     { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    date:      { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    decision:  { type: String, enum: DOUBLE_DECISIONS, required: true },
    amount:    { type: Number, min: 0, default: 0 },                       // overtime ₹
    expiresOn: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },            // extra leave usable until
    note:      { type: String, trim: true, default: '' },
    by:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

doubleShiftSchema.index({ staff: 1, date: 1 }, { unique: true });

export default mongoose.model('DoubleShift', doubleShiftSchema);
