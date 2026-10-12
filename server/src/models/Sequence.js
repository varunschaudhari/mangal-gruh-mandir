import mongoose from 'mongoose';

// Last number handed out per prefix ("EXP-2026-", "DON-20261012-", "STF-" …).
// Incremented atomically, so two people saving at the same moment never get the same number.
const sequenceSchema = new mongoose.Schema(
  {
    _id: { type: String },          // the prefix
    seq: { type: Number, default: 0 },
  },
  { versionKey: false },
);

export default mongoose.model('Sequence', sequenceSchema);
